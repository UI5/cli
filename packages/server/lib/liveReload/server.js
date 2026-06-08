import {WebSocketServer} from "ws";
import {getLogger} from "@ui5/logger";
import {WS_PATH} from "./constants.js";
import getPathname from "../helper/getPathname.js";
const log = getLogger("server:liveReloadServer");

const RELOAD_MESSAGE = JSON.stringify({type: "reload"});
const PING_MESSAGE = JSON.stringify({type: "ping"});

/**
 * Attaches a live reload WebSocket server to the given http.Server and wires it
 * to the BuildServer's <code>sourcesChanged</code> event.
 *
 * Connected clients receive a <code>{type: "reload"}</code> message whenever
 * sources change. Clients send periodic <code>{type: "ping"}</code> messages
 * which the server echoes back, keeping traffic on the wire so that
 * intermediate proxies don't idle-close the connection.
 *
 * @param {object} parameters Parameters
 * @param {http.Server} parameters.httpServer HTTP server to attach the upgrade handler to
 * @param {@ui5/project/build/BuildServer} parameters.buildServer BuildServer instance to listen on
 * @returns {{close: Function}} Handle with a <code>close</code> function to detach all listeners
 *   and shut down the WebSocket server
 * @private
 */
export default function attachLiveReloadServer({httpServer, buildServer}) {
	const wss = new WebSocketServer({noServer: true});
	const clients = new Set();

	// 'error' events on EventEmitters with no listener crash the process.
	wss.on("error", (err) => {
		log.error(`Live reload WebSocket server error: ${err.message}`);
	});

	wss.on("connection", (ws) => {
		clients.add(ws);
		log.verbose(`Live reload client connected (${clients.size} active)`);
		ws.on("error", (err) => {
			log.verbose(`Live reload client socket error: ${err.message}`);
			clients.delete(ws);
		});
		ws.on("close", () => {
			clients.delete(ws);
			log.verbose(`Live reload client disconnected (${clients.size} active)`);
		});
		ws.on("message", (data) => {
			// Reply to client pings so intermediate proxies see traffic in both
			// directions and don't idle-close the connection.
			let type;
			try {
				type = JSON.parse(data.toString()).type;
			} catch {
				return;
			}
			if (type === "ping" && ws.readyState === ws.OPEN) {
				try {
					ws.send(PING_MESSAGE);
				} catch (err) {
					log.verbose(`Failed to send ping reply to live reload client: ${err.message}`);
				}
			}
		});
	});

	function onSourcesChanged() {
		if (clients.size === 0) {
			return;
		}
		log.verbose(`Notifying ${clients.size} live reload client(s)`);
		for (const ws of clients) {
			if (ws.readyState !== ws.OPEN) {
				continue;
			}
			try {
				ws.send(RELOAD_MESSAGE);
			} catch (err) {
				// One bad client must not break the broadcast for others.
				log.verbose(`Failed to notify live reload client: ${err.message}`);
			}
		}
	}
	buildServer.on("sourcesChanged", onSourcesChanged);

	function onUpgrade(req, socket, head) {
		let pathname;
		try {
			pathname = getPathname(req);
		} catch {
			return;
		}
		if (pathname !== WS_PATH) {
			// Not ours — leave the socket alone for other upgrade handlers
			return;
		}
		try {
			wss.handleUpgrade(req, socket, head, (ws) => {
				wss.emit("connection", ws, req);
			});
		} catch (err) {
			// handleUpgrade can throw on malformed upgrade requests. Destroy the
			// socket so the request doesn't hang and no other handler tries to
			// reuse the half-upgraded connection.
			log.error(`Failed to handle live reload upgrade request: ${err.message}`);
			socket.destroy();
		}
	}
	httpServer.on("upgrade", onUpgrade);
	log.verbose("Live reload upgrade handler attached");

	return {
		close() {
			httpServer.off("upgrade", onUpgrade);
			buildServer.off("sourcesChanged", onSourcesChanged);
			wss.close();
		}
	};
}

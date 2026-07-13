import http from "node:http";
import process from "node:process";
import {getRandomValues} from "node:crypto";
import {EventEmitter} from "node:events";
import {getLogger} from "@ui5/logger";
import buildServeApp from "./serveApp.js";
import attachLiveReloadServer from "./liveReload/server.js";
import {listen, addSsl, announceListening} from "./serveHttp.js";

const log = getLogger("server:ServeSupervisor");

/**
 * Owns the stable HTTP front door for a served project and re-creates the serving stack
 * (graph + Express app + BuildServer) when the project definition changes.
 *
 * The port is bound once. Every request is routed through a stable trampoline to the
 * <em>current</em> Express app; a re-initialization swaps that app behind the trampoline,
 * so the socket, the bound port, and connected live-reload clients survive the swap.
 *
 * Re-initialization is <strong>build-new-then-swap</strong>: the new graph is resolved and
 * the new app built before the old one is torn down. If the new definition fails to resolve
 * (e.g. an invalid <code>ui5.yaml</code>), the previous working app keeps serving.
 *
 * @private
 */
class ServeSupervisor extends EventEmitter {
	#config;
	#graphFactory;
	#error;
	#webSocketToken;

	#httpServer = null;
	#port = null;
	#h2 = false;

	// The Express app every request is currently routed to. Reassigned on swap.
	#currentApp = null;
	// The current serving stack: {app, buildServer, liveReloadOptions}.
	#stack = null;

	// Stable emitter live-reload subscribes to once; its upstream is retargeted on swap
	// so connected browsers stay connected across a re-init.
	#sourcesChangedRelay = new EventEmitter();
	#relayUnsubscribe = null;
	#liveReloadHandle = null;

	#destroyed = false;
	#reinitInProgress = false;
	#reinitQueued = false;

	constructor(config, error, {graphFactory} = {}) {
		super();
		this.#config = config;
		this.#error = error;
		this.#graphFactory = graphFactory;
		this.#webSocketToken = config.webSocketToken;
	}

	/**
	 * Creates the supervisor, builds the initial serving stack, binds the port, and attaches
	 * the live-reload WebSocket server.
	 *
	 * @param {@ui5/project/graph/ProjectGraph} graph Initial (already resolved) project graph
	 * @param {object} config Resolved server configuration
	 * @param {Function} [error] Error callback for out-of-band BuildServer errors
	 * @param {object} [options]
	 * @param {Function} [options.graphFactory] Async factory returning a fresh ProjectGraph;
	 *   required for {@link ServeSupervisor#reinitialize} to do anything
	 * @returns {Promise<ServeSupervisor>} The listening supervisor
	 */
	static async create(graph, config, error, {graphFactory} = {}) {
		const supervisor = new ServeSupervisor(config, error, {graphFactory});
		await supervisor.#init(graph);
		return supervisor;
	}

	async #init(graph) {
		const {
			port: requestedPort, changePortIfInUse = false, h2 = false, key, cert,
			acceptRemoteConnections = false, liveReload = false,
		} = this.#config;
		this.#h2 = h2;

		if (h2) {
			const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);
			if (nodeVersion >= 24) {
				log.error("ERROR: With Node v24, usage of HTTP/2 is no longer supported. " +
					"Please check https://github.com/UI5/cli/issues/327 for updates.");
				process.exit(1);
			}
		}

		// Build the initial stack before binding so a construction failure surfaces to the caller.
		this.#stack = await buildServeApp(graph, this.#config, this.#error);
		this.#currentApp = this.#stack.app;

		// Stable request handler. Reads #currentApp on every request so a swap retargets
		// transparently without touching the bound socket.
		const trampoline = (req, res) => this.#currentApp(req, res);

		let port; let server;
		try {
			const listenTarget = h2 ?
				await addSsl({app: trampoline, key, cert}) :
				http.createServer(trampoline);
			({port, server} = await listen(listenTarget, requestedPort, changePortIfInUse, acceptRemoteConnections));
		} catch (err) {
			// Release the BuildServer (source watcher + cache handle) before rethrowing so a
			// failed bind does not leak a running build server.
			await this.#stack.buildServer.destroy();
			throw err;
		}
		this.#httpServer = server;
		this.#port = port;

		if (liveReload) {
			// Attach once to the stable http server, subscribed to the relay rather than the
			// BuildServer directly, so connected clients persist across swaps.
			this.#liveReloadHandle = attachLiveReloadServer({
				httpServer: server,
				buildServer: this.#sourcesChangedRelay,
				token: this.#webSocketToken,
			});
		}
		this.#relayFrom(this.#stack.buildServer);

		announceListening({port, h2, acceptRemoteConnections});
	}

	// Forwards the current BuildServer's sourcesChanged onto the stable relay. Detaches any
	// previous subscription first so a swapped-out BuildServer stops driving live-reload.
	#relayFrom(buildServer) {
		this.#detachRelay();
		const onSourcesChanged = () => this.#sourcesChangedRelay.emit("sourcesChanged");
		buildServer.on("sourcesChanged", onSourcesChanged);
		this.#relayUnsubscribe = () => buildServer.off("sourcesChanged", onSourcesChanged);
	}

	#detachRelay() {
		if (this.#relayUnsubscribe) {
			this.#relayUnsubscribe();
			this.#relayUnsubscribe = null;
		}
	}

	/**
	 * Re-resolves the graph and re-creates the serving stack behind the stable HTTP server.
	 *
	 * Build-new-then-swap: on a resolution/build failure the previous stack keeps serving and
	 * the error is logged (never emitted as a fatal <code>"error"</code>). Overlapping calls
	 * collapse into a single trailing pass.
	 *
	 * @returns {Promise<void>} Resolves once the swap (or the no-op) completes
	 */
	async reinitialize() {
		if (this.#destroyed) {
			return;
		}
		if (!this.#graphFactory) {
			log.warn("Cannot re-initialize server: no graph factory was provided");
			return;
		}
		if (this.#reinitInProgress) {
			// Collapse overlapping requests into one trailing pass against the settled definition.
			this.#reinitQueued = true;
			return;
		}
		this.#reinitInProgress = true;
		try {
			do {
				this.#reinitQueued = false;
				await this.#swap();
			} while (this.#reinitQueued && !this.#destroyed);
		} finally {
			this.#reinitInProgress = false;
		}
	}

	async #swap() {
		const oldStack = this.#stack;
		let newStack;
		try {
			const newGraph = await this.#graphFactory();
			newStack = await buildServeApp(newGraph, this.#config, this.#error);
		} catch (err) {
			// Keep the last-good stack serving. A subsequent valid edit will swap cleanly.
			log.error(`Failed to re-initialize server: ${err?.message ?? err}`);
			if (err?.stack) {
				log.verbose(err.stack);
			}
			return;
		}
		if (this.#destroyed) {
			// Destroyed while building — discard the new stack instead of adopting it.
			await newStack.buildServer.destroy();
			return;
		}
		// Swap: retarget the trampoline, move live-reload to the new BuildServer, notify clients.
		this.#stack = newStack;
		this.#currentApp = newStack.app;
		this.#relayFrom(newStack.buildServer);
		this.#sourcesChangedRelay.emit("sourcesChanged");
		// Tear down the old stack. Its BuildServer releases the source watcher and the cache
		// handle; the new BuildServer already reopened the same (refcounted) cache.
		await oldStack.buildServer.destroy();
	}

	getPort() {
		return this.#port;
	}

	get h2() {
		return this.#h2;
	}

	getServeError() {
		return this.#stack?.buildServer.getServeError() ?? null;
	}

	/**
	 * Stops the server: closes live-reload, the HTTP socket, and the current BuildServer.
	 * Mirrors the tolerant teardown of the single-shot wrapper — the socket is closed even
	 * if the BuildServer's destroy rejects.
	 *
	 * @param {Function} [callback] Invoked once the HTTP server has closed
	 * @returns {Promise<void>} Resolves once teardown completes
	 */
	async destroy(callback) {
		this.#destroyed = true;
		this.#liveReloadHandle?.close();
		this.#detachRelay();
		this.#httpServer?.close(callback);
		try {
			await this.#stack?.buildServer.destroy();
		} catch (err) {
			log.verbose(`Error while destroying BuildServer: ${err?.message ?? err}`);
		}
	}

	/**
	 * Generates a per-process live-reload token: random 72 bits (9 * 8 bits), base64url-encoded
	 * to a 12-character string. OWASP recommends at least 64 bits of entropy for session IDs:
	 * https://owasp.org/www-community/vulnerabilities/Insufficient_Session-ID_Length
	 *
	 * @returns {string} The token
	 */
	static generateWebSocketToken() {
		return Buffer.from(getRandomValues(new Uint8Array(9))).toString("base64url");
	}

	// Test-only introspection into private state. Defined as a static method because private
	// fields are only reachable from within the class body. Wired to __internals__ below.
	static #peek(supervisor) {
		return {
			stack: supervisor.#stack,
			currentApp: supervisor.#currentApp,
			httpServer: supervisor.#httpServer,
			sourcesChangedRelay: supervisor.#sourcesChangedRelay,
			reinitInProgress: supervisor.#reinitInProgress,
		};
	}

	static get __internals__() {
		if (process.env.NODE_ENV !== "test") {
			return undefined;
		}
		return {peek: ServeSupervisor.#peek};
	}
}

export default ServeSupervisor;

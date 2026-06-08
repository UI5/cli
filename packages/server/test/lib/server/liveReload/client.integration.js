import test from "ava";
import sinon from "sinon";
import vm from "node:vm";
import http from "node:http";
import {EventEmitter} from "node:events";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {WebSocket} from "ws";
import attachLiveReloadServer from "../../../../lib/liveReload/server.js";
import {WS_PATH} from "../../../../lib/liveReload/constants.js";

const TEST_TOKEN = "test-token";

const CLIENT_FILE = fileURLToPath(
	new URL("../../../../lib/liveReload/client.js", import.meta.url)
);
const clientTemplate = await readFile(CLIENT_FILE, "utf8");
const clientSource = clientTemplate
	.replace("__UI5_LR_WS_PATH__", WS_PATH)
	.replace("__UI5_LR_WS_TOKEN__", TEST_TOKEN);

function startServer({port = 0} = {}) {
	return new Promise((resolve, reject) => {
		const httpServer = http.createServer();
		httpServer.once("error", reject);
		httpServer.listen(port, "127.0.0.1", () => {
			httpServer.removeListener("error", reject);
			const buildServer = new EventEmitter();
			const handle = attachLiveReloadServer({httpServer, buildServer, token: TEST_TOKEN});
			resolve({httpServer, port: httpServer.address().port, buildServer, handle});
		});
	});
}

function runClient({port, visibilityState = "visible"} = {}) {
	const state = {visibilityState};
	const windowListeners = {};
	const documentListeners = {};
	const registeredIntervals = [];
	const registeredTimeouts = [];
	const createdWebSockets = [];

	const fakeLocation = {
		protocol: "http:",
		host: `127.0.0.1:${port}`,
		reload: sinon.stub(),
	};

	const fakeWindow = {
		addEventListener(type, fn) {
			if (!windowListeners[type]) {
				windowListeners[type] = [];
			}
			windowListeners[type].push(fn);
		},
	};

	const fakeDocument = {
		get visibilityState() {
			return state.visibilityState;
		},
		addEventListener(type, fn) {
			if (!documentListeners[type]) {
				documentListeners[type] = [];
			}
			documentListeners[type].push(fn);
		},
		removeEventListener(type, fn) {
			const listeners = documentListeners[type];
			if (!listeners) {
				return;
			}
			const index = listeners.indexOf(fn);
			if (index >= 0) {
				listeners.splice(index, 1);
			}
		},
	};

	// Wrap the real WebSocket constructor so we can track all instances
	// created by client.js (for assertions and teardown).
	const WebSocketProxy = new Proxy(WebSocket, {
		construct(target, args) {
			const instance = Reflect.construct(target, args);
			createdWebSockets.push(instance);
			return instance;
		},
	});

	const sandbox = {
		WebSocket: WebSocketProxy,
		location: fakeLocation,
		window: fakeWindow,
		document: fakeDocument,

		// Fake timers: both setInterval and setTimeout are captured so
		// tests can fire callbacks on demand without real delays.
		setInterval(fn, ms) {
			const handle = {fn, ms};
			registeredIntervals.push(handle);
			return handle;
		},
		clearInterval(handle) {
			const index = registeredIntervals.indexOf(handle);
			if (index >= 0) {
				registeredIntervals.splice(index, 1);
			}
		},
		setTimeout(fn, ms) {
			const handle = {fn, ms};
			registeredTimeouts.push(handle);
			return handle;
		},
		clearTimeout(handle) {
			const index = registeredTimeouts.indexOf(handle);
			if (index >= 0) {
				registeredTimeouts.splice(index, 1);
			}
		},

		// client.js does not use URL or Buffer directly, but the `ws`
		// library's WebSocket constructor internally needs them to parse
		// the server address and handle binary frames. Inside a VM
		// context, globals from the outer realm are not available unless
		// explicitly provided.
		URL,
		Buffer,
	};

	vm.createContext(sandbox);
	vm.runInContext(clientSource, sandbox, {filename: "client.js"});

	return {
		sandbox,
		fakeLocation,
		createdWebSockets,
		registeredIntervals,
		registeredTimeouts,

		firePing() {
			registeredIntervals.slice().forEach((interval) => interval.fn());
		},
		fireNextTimeout() {
			const handle = registeredTimeouts.shift();
			if (handle) {
				handle.fn();
			}
		},
		emitWindowEvent(type, ...args) {
			const listeners = windowListeners[type] || [];
			listeners.slice().forEach((fn) => fn(...args));
		},
		setVisibility(newState) {
			state.visibilityState = newState;
			const listeners = documentListeners.visibilitychange || [];
			listeners.slice().forEach((fn) => fn());
		},
	};
}

// Polls `predicate` on real wall-clock time (not the sandbox's fake timers).
// Use this to await real WebSocket events from the server; use firePing() /
// fireNextTimeout() to drive client.js's sandboxed timers.
function waitFor(predicate, {timeout = 5000, step = 25} = {}) {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const tick = () => {
			if (predicate()) {
				return resolve();
			}
			if (Date.now() - start > timeout) {
				return reject(new Error("waitFor timed out"));
			}
			setTimeout(tick, step);
		};
		tick();
	});
}

function closeHttp(httpServer) {
	return new Promise((resolve) => httpServer.close(resolve));
}

// Terminates every WebSocket instance the client created so the upgraded
// socket is released. http.Server stops tracking sockets after a successful
// WebSocket upgrade — `close()` would otherwise wait forever for the
// connection to drain. Call this before closeHttp().
function terminateClientSockets(client) {
	for (const ws of client.createdWebSockets) {
		if (ws.readyState !== WebSocket.CLOSED) {
			try {
				ws.terminate();
			} catch {
				// ignore
			}
		}
	}
}

async function teardown({handle, httpServer, client}) {
	if (handle) {
		handle.close();
	}
	if (client) {
		terminateClientSockets(client);
	}
	if (httpServer && httpServer.listening) {
		await closeHttp(httpServer);
	}
}

test.afterEach.always(() => {
	sinon.restore();
});

test.serial("Connect + reload broadcast", async (t) => {
	const {httpServer, port, buildServer, handle} = await startServer();
	const client = runClient({port});
	try {
		await waitFor(() =>
			client.createdWebSockets[0]?.readyState === WebSocket.OPEN
		);
		buildServer.emit("sourcesChanged");
		await waitFor(() => client.fakeLocation.reload.callCount === 1);
		t.is(client.fakeLocation.reload.callCount, 1);
	} finally {
		await teardown({handle, httpServer, client});
	}
});

test.serial("Client ping → server echo, no reload", async (t) => {
	const {httpServer, port, handle} = await startServer();
	const client = runClient({port});
	try {
		await waitFor(() =>
			client.createdWebSockets[0]?.readyState === WebSocket.OPEN
		);

		const ws = client.createdWebSockets[0];
		const pingEcho = new Promise((resolve) => ws.once("message", resolve));

		client.firePing();
		const data = await pingEcho;
		t.is(JSON.parse(data.toString()).type, "ping");
		t.is(client.fakeLocation.reload.callCount, 0);
	} finally {
		await teardown({handle, httpServer, client});
	}
});

test.serial("Server close triggers reconnect → reload after server returns", async (t) => {
	const first = await startServer();
	const client = runClient({port: first.port});
	try {
		await waitFor(() =>
			client.createdWebSockets[0]?.readyState === WebSocket.OPEN
		);

		await teardown({handle: first.handle, httpServer: first.httpServer, client});

		// Wait until client observed the close and scheduled the reconnect probe
		await waitFor(() => client.registeredTimeouts.length > 0);

		// Spin up a fresh server on the SAME port
		const second = await startServer({port: first.port});
		try {
			// Drive reconnect probes until the new server accepts and the client reloads
			await waitFor(() => {
				if (client.fakeLocation.reload.callCount >= 1) {
					return true;
				}
				if (client.registeredTimeouts.length > 0) {
					client.fireNextTimeout();
				}
				return false;
			});
			t.is(client.fakeLocation.reload.callCount, 1);
		} finally {
			await teardown({handle: second.handle, httpServer: second.httpServer, client});
		}
	} catch (err) {
		// First-server teardown already happened in the try block on the
		// happy path; ensure client sockets are released if we threw earlier.
		terminateClientSockets(client);
		throw err;
	}
});

test.serial("beforeunload suppresses reconnect-driven reload", async (t) => {
	const {httpServer, port, handle} = await startServer();
	const client = runClient({port});
	try {
		await waitFor(() =>
			client.createdWebSockets[0]?.readyState === WebSocket.OPEN
		);

		client.emitWindowEvent("beforeunload");
		await teardown({handle, httpServer, client});

		// Wait for the close to register on the client
		await waitFor(() =>
			client.createdWebSockets[0]?.readyState === WebSocket.CLOSED ||
			client.createdWebSockets[0]?.readyState === WebSocket.CLOSING);

		// Drain any scheduled timeouts; none should lead to a reload
		while (client.registeredTimeouts.length > 0) {
			client.fireNextTimeout();
		}
		// Give any pending microtasks a chance
		await new Promise((resolve) => setTimeout(resolve, 50));
		t.is(client.fakeLocation.reload.callCount, 0);
	} catch (err) {
		terminateClientSockets(client);
		throw err;
	}
});

test.serial("Hidden visibility pauses probing; visible resumes", async (t) => {
	const first = await startServer();
	const client = runClient({port: first.port, visibilityState: "hidden"});
	try {
		await waitFor(() =>
			client.createdWebSockets[0]?.readyState === WebSocket.OPEN
		);

		await teardown({handle: first.handle, httpServer: first.httpServer, client});

		// Wait for client to observe close
		await waitFor(() =>
			client.createdWebSockets[0]?.readyState === WebSocket.CLOSED ||
			client.createdWebSockets[0]?.readyState === WebSocket.CLOSING);

		// Drain timeouts: while hidden, the loop awaits visibility, so probes
		// should NOT spawn new WebSocket instances.
		while (client.registeredTimeouts.length > 0) {
			client.fireNextTimeout();
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		t.is(client.fakeLocation.reload.callCount, 0);
		t.is(client.createdWebSockets.length, 1,
			"No new WebSocket constructed while hidden");

		// Restart server on same port
		const second = await startServer({port: first.port});
		try {
			// Flip visibility, which resolves the waitVisible() promise and runs the loop
			client.setVisibility("visible");
			await waitFor(() => {
				if (client.fakeLocation.reload.callCount >= 1) {
					return true;
				}
				if (client.registeredTimeouts.length > 0) {
					client.fireNextTimeout();
				}
				return false;
			});
			t.is(client.fakeLocation.reload.callCount, 1);
		} finally {
			await teardown({handle: second.handle, httpServer: second.httpServer, client});
		}
	} catch (err) {
		terminateClientSockets(client);
		throw err;
	}
});

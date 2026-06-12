import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {EventEmitter} from "node:events";

test.afterEach.always(() => {
	sinon.restore();
});

// Loads the module with `ws` replaced by a controllable FakeWebSocketServer
// that exposes the constructed instance for inspection.
async function loadModule() {
	let lastInstance = null;
	class FakeWebSocketServer extends EventEmitter {
		constructor(opts) {
			super();
			this.opts = opts;
			this.handleUpgrade = sinon.stub().callsFake((req, socket, head, cb) => {
				const ws = createFakeClient();
				cb(ws);
			});
			this.close = sinon.stub();
			lastInstance = this;
		}
	}
	const module = await esmock("../../../../lib/liveReload/server.js", {
		"ws": {WebSocketServer: FakeWebSocketServer}
	});
	return {module, getInstance: () => lastInstance};
}

function createFakeClient() {
	const ws = new EventEmitter();
	ws.OPEN = 1;
	ws.readyState = 1;
	ws.send = sinon.stub();
	return ws;
}

test("Instantiates WebSocketServer in noServer mode and attaches upgrade handler", async (t) => {
	const {module, getInstance} = await loadModule();
	const httpServer = new EventEmitter();
	sinon.spy(httpServer, "on");
	const buildServer = new EventEmitter();

	module.default({httpServer, buildServer});

	t.truthy(getInstance());
	t.deepEqual(getInstance().opts, {noServer: true});
	const upgradeListenerCalls = httpServer.on.getCalls().filter((c) => c.args[0] === "upgrade");
	t.is(upgradeListenerCalls.length, 1, "upgrade listener attached");
});

test("Upgrade for matching path calls handleUpgrade and emits connection", async (t) => {
	const {module, getInstance} = await loadModule();
	const httpServer = new EventEmitter();
	module.default({httpServer, buildServer: new EventEmitter()});

	const wss = getInstance();
	const socket = {destroy: sinon.stub()};
	const head = Buffer.alloc(0);
	const upgradeReq = {url: "/.ui5/liveReload/ws"};

	httpServer.emit("upgrade", upgradeReq, socket, head);

	t.is(wss.handleUpgrade.callCount, 1);
	t.deepEqual(wss.handleUpgrade.getCall(0).args.slice(0, 3), [upgradeReq, socket, head]);
});

test("Upgrade for non-matching path is ignored", async (t) => {
	const {module, getInstance} = await loadModule();
	const httpServer = new EventEmitter();
	module.default({httpServer, buildServer: new EventEmitter()});

	const wss = getInstance();
	const socket = {destroy: sinon.stub()};
	httpServer.emit("upgrade", {url: "/other/socket"}, socket, Buffer.alloc(0));

	t.is(wss.handleUpgrade.callCount, 0);
	t.is(socket.destroy.callCount, 0, "socket left for other handlers");
});

test("Upgrade with malformed URL is ignored", async (t) => {
	const {module, getInstance} = await loadModule();
	const httpServer = new EventEmitter();
	module.default({httpServer, buildServer: new EventEmitter()});

	const wss = getInstance();
	httpServer.emit("upgrade", {url: undefined}, {destroy: sinon.stub()}, Buffer.alloc(0));

	t.is(wss.handleUpgrade.callCount, 0);
});

test("sourcesChanged: broadcasts {type: reload} JSON to OPEN clients", async (t) => {
	const {module, getInstance} = await loadModule();
	const buildServer = new EventEmitter();
	module.default({httpServer: new EventEmitter(), buildServer});

	const wss = getInstance();
	const open1 = createFakeClient();
	const open2 = createFakeClient();
	const closed = createFakeClient();
	closed.readyState = 3; // CLOSED

	wss.emit("connection", open1);
	wss.emit("connection", open2);
	wss.emit("connection", closed);

	buildServer.emit("sourcesChanged");

	const expected = JSON.stringify({type: "reload"});
	t.is(open1.send.callCount, 1);
	t.is(open1.send.getCall(0).args[0], expected);
	t.is(open2.send.callCount, 1);
	t.is(open2.send.getCall(0).args[0], expected);
	t.is(closed.send.callCount, 0, "non-OPEN client not sent");
});

test("sourcesChanged: skips broadcast when no clients connected", async (t) => {
	const {module} = await loadModule();
	const buildServer = new EventEmitter();
	module.default({httpServer: new EventEmitter(), buildServer});

	t.notThrows(() => buildServer.emit("sourcesChanged"));
});

test("Client close removes it from broadcast set", async (t) => {
	const {module, getInstance} = await loadModule();
	const buildServer = new EventEmitter();
	module.default({httpServer: new EventEmitter(), buildServer});

	const wss = getInstance();
	const ws1 = createFakeClient();
	const ws2 = createFakeClient();
	wss.emit("connection", ws1);
	wss.emit("connection", ws2);

	ws1.emit("close");

	buildServer.emit("sourcesChanged");

	t.is(ws1.send.callCount, 0, "closed client not notified");
	t.is(ws2.send.callCount, 1, "remaining client still notified");
});

test("close(): detaches upgrade handler, sourcesChanged listener, and closes wss", async (t) => {
	const {module, getInstance} = await loadModule();
	const httpServer = new EventEmitter();
	const buildServer = new EventEmitter();

	const handle = module.default({httpServer, buildServer});
	const wss = getInstance();

	t.is(httpServer.listenerCount("upgrade"), 1);
	t.is(buildServer.listenerCount("sourcesChanged"), 1);

	handle.close();

	t.is(httpServer.listenerCount("upgrade"), 0, "upgrade listener removed");
	t.is(buildServer.listenerCount("sourcesChanged"), 0, "sourcesChanged listener removed");
	t.is(wss.close.callCount, 1, "wss.close called");
});

test("Echoes ping message back to OPEN client", async (t) => {
	const {module, getInstance} = await loadModule();
	module.default({httpServer: new EventEmitter(), buildServer: new EventEmitter()});

	const wss = getInstance();
	const ws = createFakeClient();
	wss.emit("connection", ws);

	ws.emit("message", Buffer.from(JSON.stringify({type: "ping"})));

	t.is(ws.send.callCount, 1);
	t.is(ws.send.getCall(0).args[0], JSON.stringify({type: "ping"}));
});

test("Does not echo ping when client is not OPEN", async (t) => {
	const {module, getInstance} = await loadModule();
	module.default({httpServer: new EventEmitter(), buildServer: new EventEmitter()});

	const wss = getInstance();
	const ws = createFakeClient();
	wss.emit("connection", ws);
	ws.readyState = 3; // CLOSED

	ws.emit("message", Buffer.from(JSON.stringify({type: "ping"})));

	t.is(ws.send.callCount, 0);
});

test("Ignores non-ping messages from clients", async (t) => {
	const {module, getInstance} = await loadModule();
	module.default({httpServer: new EventEmitter(), buildServer: new EventEmitter()});

	const wss = getInstance();
	const ws = createFakeClient();
	wss.emit("connection", ws);

	ws.emit("message", Buffer.from(JSON.stringify({type: "something-else"})));

	t.is(ws.send.callCount, 0);
});

test("Ignores malformed JSON messages from clients", async (t) => {
	const {module, getInstance} = await loadModule();
	module.default({httpServer: new EventEmitter(), buildServer: new EventEmitter()});

	const wss = getInstance();
	const ws = createFakeClient();
	wss.emit("connection", ws);

	t.notThrows(() => ws.emit("message", Buffer.from("not json")));
	t.is(ws.send.callCount, 0);
});

test("Attaches 'error' listener to wss to prevent unhandled error crash", async (t) => {
	const {module, getInstance} = await loadModule();
	module.default({httpServer: new EventEmitter(), buildServer: new EventEmitter()});

	const wss = getInstance();
	t.true(wss.listenerCount("error") >= 1, "wss has error listener");
	t.notThrows(() => wss.emit("error", new Error("boom")), "emitting error does not crash");
});

test("Client socket 'error' is handled and client is removed from broadcast set", async (t) => {
	const {module, getInstance} = await loadModule();
	const buildServer = new EventEmitter();
	module.default({httpServer: new EventEmitter(), buildServer});

	const wss = getInstance();
	const ws1 = createFakeClient();
	const ws2 = createFakeClient();
	wss.emit("connection", ws1);
	wss.emit("connection", ws2);

	t.true(ws1.listenerCount("error") >= 1, "client has error listener");
	t.notThrows(() => ws1.emit("error", new Error("client boom")));

	buildServer.emit("sourcesChanged");

	t.is(ws1.send.callCount, 0, "errored client is removed and not notified");
	t.is(ws2.send.callCount, 1, "remaining client still notified");
});

test("sourcesChanged: ws.send throwing for one client does not break loop for others", async (t) => {
	const {module, getInstance} = await loadModule();
	const buildServer = new EventEmitter();
	module.default({httpServer: new EventEmitter(), buildServer});

	const wss = getInstance();
	const bad = createFakeClient();
	bad.send = sinon.stub().throws(new Error("send failed"));
	const good = createFakeClient();
	wss.emit("connection", bad);
	wss.emit("connection", good);

	t.notThrows(() => buildServer.emit("sourcesChanged"));
	t.is(bad.send.callCount, 1);
	t.is(good.send.callCount, 1, "good client still notified after bad client throws");
});

test("Ping reply: ws.send throwing does not propagate", async (t) => {
	const {module, getInstance} = await loadModule();
	module.default({httpServer: new EventEmitter(), buildServer: new EventEmitter()});

	const wss = getInstance();
	const ws = createFakeClient();
	ws.send = sinon.stub().throws(new Error("send failed"));
	wss.emit("connection", ws);

	t.notThrows(() => ws.emit("message", Buffer.from(JSON.stringify({type: "ping"}))));
	t.is(ws.send.callCount, 1);
});

test("Upgrade: handleUpgrade throwing destroys the socket", async (t) => {
	const {module, getInstance} = await loadModule();
	const httpServer = new EventEmitter();
	module.default({httpServer, buildServer: new EventEmitter()});

	const wss = getInstance();
	wss.handleUpgrade = sinon.stub().throws(new Error("upgrade failed"));

	const socket = {destroy: sinon.stub()};
	t.notThrows(() => httpServer.emit("upgrade",
		{url: "/.ui5/liveReload/ws"}, socket, Buffer.alloc(0)));

	t.is(socket.destroy.callCount, 1, "socket destroyed after handleUpgrade throws");
});

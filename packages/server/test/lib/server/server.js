import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

// server.js is now a thin wrapper over Supervisor: it generates the live-reload token, builds
// the config, delegates to Supervisor.create(), and shapes the {h2, port, close, reinitialize}
// result. These tests exercise that wrapper; the swap/relay/trampoline behavior lives in
// serve/Supervisor.js and is covered there.

function createSupervisorMock({port = 3000, createRejects = null} = {}) {
	const supervisor = {
		getPort: sinon.stub().returns(port),
		destroy: sinon.stub().callsFake((cb) => cb && cb()),
		reinitialize: sinon.stub().resolves(),
	};
	const create = createRejects ?
		sinon.stub().rejects(createRejects) :
		sinon.stub().resolves(supervisor);
	const Supervisor = {
		create,
	};
	return {supervisor, Supervisor};
}

async function importServe(Supervisor) {
	return esmock("../../../lib/server.js", {
		"../../../lib/serve/Supervisor.js": {default: Supervisor},
	});
}

test.afterEach.always(() => {
	sinon.restore();
});

test("serve() delegates to Supervisor.create and returns port/h2/close/reinitialize", async (t) => {
	const {supervisor, Supervisor} = createSupervisorMock({port: 3000});
	const {serve} = await importServe(Supervisor);
	const graph = {};
	const graphFactory = sinon.stub();

	const result = await serve(graph, {port: 3000, h2: false, liveReload: true}, undefined, {graphFactory});

	t.true(Supervisor.create.calledOnce);
	const [passedGraph, config, , options] = Supervisor.create.firstCall.args;
	t.is(passedGraph, graph);
	t.is(options.graphFactory, graphFactory, "graphFactory is threaded through to the supervisor");
	t.is(typeof config.webSocketToken, "string", "a token is generated when liveReload is active");
	t.is(config.webSocketToken.length, 12, "the token is 72 bits base64url-encoded to 12 characters");
	t.is(result.port, 3000);
	t.is(result.h2, false);
	t.is(typeof result.close, "function");
	t.is(typeof result.reinitialize, "function");

	result.reinitialize();
	t.true(supervisor.reinitialize.calledOnce, "reinitialize forwards to the supervisor");
});

test("serve() does not generate a live-reload token when liveReload is off", async (t) => {
	const {Supervisor} = createSupervisorMock();
	const {serve} = await importServe(Supervisor);

	await serve({}, {port: 3000, liveReload: false}, undefined, {});

	const config = Supervisor.create.firstCall.args[1];
	t.is(config.webSocketToken, null);
});

test("serve() close() forwards to supervisor.destroy()", async (t) => {
	const {supervisor, Supervisor} = createSupervisorMock();
	const {serve} = await importServe(Supervisor);

	const result = await serve({}, {port: 3000}, undefined, {});
	await new Promise((resolve) => result.close(resolve));

	t.true(supervisor.destroy.calledOnce);
});

test("serve() rejects when Supervisor.create rejects", async (t) => {
	const createError = new Error("bind failed");
	const {Supervisor} = createSupervisorMock({createRejects: createError});
	const {serve} = await importServe(Supervisor);

	const err = await t.throwsAsync(serve({}, {port: 3000}, undefined, {}));
	t.is(err, createError);
});

test("serve() works without the 4th options argument (backward compatible)", async (t) => {
	const {Supervisor} = createSupervisorMock();
	const {serve} = await importServe(Supervisor);

	const result = await serve({}, {port: 3000}, undefined);
	t.is(result.port, 3000);
	const options = Supervisor.create.firstCall.args[3];
	t.is(options.graphFactory, undefined);
});

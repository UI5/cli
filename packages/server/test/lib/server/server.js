import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

// server.js is now a thin wrapper over ServeSupervisor: it generates the live-reload token, builds
// the config, delegates to ServeSupervisor.create(), and shapes the {h2, port, close, reinitialize}
// result. These tests exercise that wrapper; the swap/relay/trampoline behavior lives in
// ServeSupervisor.js and is covered in ServeSupervisor.js.

function createSupervisorMock({port = 3000, createRejects = null} = {}) {
	const supervisor = {
		getPort: sinon.stub().returns(port),
		destroy: sinon.stub().callsFake((cb) => cb && cb()),
		reinitialize: sinon.stub().resolves(),
	};
	const create = createRejects ?
		sinon.stub().rejects(createRejects) :
		sinon.stub().resolves(supervisor);
	const ServeSupervisor = {
		create,
	};
	return {supervisor, ServeSupervisor};
}

async function importServe(ServeSupervisor) {
	return esmock("../../../lib/server.js", {
		"../../../lib/ServeSupervisor.js": {default: ServeSupervisor},
	});
}

test.afterEach.always(() => {
	sinon.restore();
});

test("serve() delegates to ServeSupervisor.create and returns port/h2/close/reinitialize", async (t) => {
	const {supervisor, ServeSupervisor} = createSupervisorMock({port: 3000});
	const {serve} = await importServe(ServeSupervisor);
	const graph = {};
	const graphFactory = sinon.stub();

	const result = await serve(graph, {port: 3000, h2: false, liveReload: true}, undefined, {graphFactory});

	t.true(ServeSupervisor.create.calledOnce);
	const [passedGraph, config, , options] = ServeSupervisor.create.firstCall.args;
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
	const {ServeSupervisor} = createSupervisorMock();
	const {serve} = await importServe(ServeSupervisor);

	await serve({}, {port: 3000, liveReload: false}, undefined, {});

	const config = ServeSupervisor.create.firstCall.args[1];
	t.is(config.webSocketToken, null);
});

test("serve() close() forwards to supervisor.destroy()", async (t) => {
	const {supervisor, ServeSupervisor} = createSupervisorMock();
	const {serve} = await importServe(ServeSupervisor);

	const result = await serve({}, {port: 3000}, undefined, {});
	await new Promise((resolve) => result.close(resolve));

	t.true(supervisor.destroy.calledOnce);
});

test("serve() rejects when ServeSupervisor.create rejects", async (t) => {
	const createError = new Error("bind failed");
	const {ServeSupervisor} = createSupervisorMock({createRejects: createError});
	const {serve} = await importServe(ServeSupervisor);

	const err = await t.throwsAsync(serve({}, {port: 3000}, undefined, {}));
	t.is(err, createError);
});

test("serve() works without the 4th options argument (backward compatible)", async (t) => {
	const {ServeSupervisor} = createSupervisorMock();
	const {serve} = await importServe(ServeSupervisor);

	const result = await serve({}, {port: 3000}, undefined);
	t.is(result.port, 3000);
	const options = ServeSupervisor.create.firstCall.args[3];
	t.is(options.graphFactory, undefined);
});

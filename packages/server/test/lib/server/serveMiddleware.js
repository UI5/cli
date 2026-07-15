import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import express from "express";
import supertest from "supertest";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import serveMiddleware from "../../../lib/serveMiddleware.js";
import {INJECT_SCRIPT_TAG} from "../../../lib/liveReload/constants.js";
import {isolatedUi5DataDir} from "../../utils/buildCacheIsolation.js";

// Integration: mount the returned middleware on a caller-owned express app and serve real
// requests through supertest, without binding a port or starting a UI5-owned HTTP server.

let app;
let close;
let request;

test.before(async (t) => {
	const graph = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});

	const result = await serveMiddleware(graph, {
		ui5DataDir: isolatedUi5DataDir(t),
	});
	close = result.close;

	app = express();
	app.use(result.middleware);
	request = supertest(app);
});

test.after.always(async () => {
	await close();
});

async function get(path) {
	const res = await request.get(path);
	if (res.error) {
		throw new Error(res.error);
	}
	return res;
}

test("Serves index.html through a caller-owned express app", async (t) => {
	const res = await get("/index.html");
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /html/, "Correct content type");
	t.regex(res.text, /<title>Application A<\/title>/, "Correct response");
});

test("Serves the UI5 version info", async (t) => {
	const res = await get("/resources/sap-ui-version.json");
	t.is(res.statusCode, 200, "Correct HTTP status code");
	t.regex(res.headers["content-type"], /json/, "Correct content type");
});

test("Does not inject the live-reload client script", async (t) => {
	const res = await get("/index.html");
	t.false(res.text.includes(INJECT_SCRIPT_TAG),
		"The live-reload client script is not injected in the embedding API");
});

// Unit: the module contract independent of a real graph — the returned middleware is the
// router from the shared core, close() releases the BuildServer once and is idempotent, and
// the live-reload WebSocket path is disabled.

function createBuildServeRouterMock() {
	const router = sinon.stub();
	const buildServer = {
		destroy: sinon.stub().resolves(),
	};
	const buildServeRouter = sinon.stub().resolves({
		router,
		buildServer,
		liveReloadOptions: {active: false, token: null},
	});
	return {router, buildServer, buildServeRouter};
}

async function importServeMiddleware(buildServeRouter) {
	return esmock("../../../lib/serveMiddleware.js", {
		"../../../lib/serveApp.js": {buildServeRouter},
	});
}

test("serveMiddleware() returns the router as middleware and disables live-reload", async (t) => {
	const {router, buildServeRouter} = createBuildServeRouterMock();
	const {default: serveMiddlewareMocked} = await importServeMiddleware(buildServeRouter);
	const graph = {};

	const result = await serveMiddlewareMocked(graph, {ui5DataDir: "/tmp/data"});

	t.true(buildServeRouter.calledOnce);
	const [passedGraph, config] = buildServeRouter.firstCall.args;
	t.is(passedGraph, graph, "the graph is threaded through to the shared core");
	t.is(config.liveReload, false, "live-reload is disabled for the embedding API");
	t.is(config.webSocketToken, null, "no WebSocket token is minted for the embedding API");
	t.is(config.ui5DataDir, "/tmp/data", "options are threaded into the config");
	t.is(result.middleware, router, "the shared core's router is returned as middleware");
	t.is(typeof result.close, "function");
});

test("serveMiddleware() close() destroys the BuildServer once and is idempotent", async (t) => {
	const {buildServer, buildServeRouter} = createBuildServeRouterMock();
	const {default: serveMiddlewareMocked} = await importServeMiddleware(buildServeRouter);

	const {close} = await serveMiddlewareMocked({}, {});
	await close();
	await close();

	t.true(buildServer.destroy.calledOnce, "the BuildServer is destroyed exactly once");
});

test("serveMiddleware() works without options", async (t) => {
	const {buildServeRouter} = createBuildServeRouterMock();
	const {default: serveMiddlewareMocked} = await importServeMiddleware(buildServeRouter);

	await serveMiddlewareMocked({});

	const config = buildServeRouter.firstCall.args[1];
	t.is(config.liveReload, false);
	t.is(config.webSocketToken, null);
});

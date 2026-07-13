import test from "ava";
import supertest from "supertest";
import {serve} from "../../../lib/server.js";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {isolatedUi5DataDir} from "../../utils/buildCacheIsolation.js";

// Integration coverage for the ServeSupervisor swap against a real graph + BuildServer: the port
// stays bound, the same socket keeps serving, and a re-init reuses the (config-keyed, refcounted)
// build cache rather than cold-rebuilding. Uses a fixed cwd so the graphFactory re-resolves the
// same project.

async function buildGraph() {
	return graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});
}

test.serial("reinitialize() keeps the port bound and continues serving", async (t) => {
	const ui5DataDir = isolatedUi5DataDir(t);
	const graph = await buildGraph();
	const server = await serve(graph, {
		port: 3395,
		changePortIfInUse: true,
		liveReload: false,
		ui5DataDir,
	}, undefined, {graphFactory: buildGraph});

	const port = server.port;
	const request = supertest(`http://127.0.0.1:${port}`);

	const before = await request.get("/index.html");
	t.is(before.statusCode, 200, "serves before re-init");

	await server.reinitialize();

	// Same port, same socket — the request client is unchanged.
	const after = await request.get("/index.html");
	t.is(after.statusCode, 200, "serves after re-init on the same port");
	t.is(server.port, port, "the bound port is unchanged across re-init");

	await new Promise((resolve) => server.close(resolve));
});

test.serial("reinitialize() without a graphFactory is a no-op and keeps serving", async (t) => {
	const ui5DataDir = isolatedUi5DataDir(t);
	const graph = await buildGraph();
	// No 4th argument → no graphFactory.
	const server = await serve(graph, {
		port: 3396,
		changePortIfInUse: true,
		liveReload: false,
		ui5DataDir,
	});

	const request = supertest(`http://127.0.0.1:${server.port}`);
	await server.reinitialize(); // warns + no-ops

	const result = await request.get("/index.html");
	t.is(result.statusCode, 200, "still serving after a no-op re-init");

	await new Promise((resolve) => server.close(resolve));
});

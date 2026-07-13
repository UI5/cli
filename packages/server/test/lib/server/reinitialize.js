import test from "ava";
import supertest from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
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

// Integration coverage for the DefinitionWatcher trigger: editing a project's ui5.yaml on disk
// drives a real re-init through the watcher (not a programmatic reinitialize() call). Runs against
// a fixture copied to test/tmp so the edit does not mutate the checked-in fixture.
test.serial("editing ui5.yaml triggers a re-init and keeps serving on the same port", async (t) => {
	const ui5DataDir = isolatedUi5DataDir(t);
	const tmpProject = path.join("./test/tmp", `reinitialize-watcher-${process.pid}`);
	await fs.rm(tmpProject, {recursive: true, force: true});
	await fs.cp("./test/fixtures/application.a", tmpProject, {recursive: true});

	const buildTmpGraph = () => graphFromPackageDependencies({cwd: tmpProject});
	const graph = await buildTmpGraph();

	// Count re-resolutions so we can await the watcher-driven one.
	let graphBuilds = 0;
	const graphFactory = async () => {
		graphBuilds++;
		return buildTmpGraph();
	};

	const server = await serve(graph, {
		port: 3397,
		changePortIfInUse: true,
		liveReload: false,
		ui5DataDir,
		cwd: tmpProject,
	}, undefined, {graphFactory});

	const port = server.port;
	const request = supertest(`http://127.0.0.1:${port}`);
	t.is((await request.get("/index.html")).statusCode, 200, "serves before the edit");

	// Edit ui5.yaml on disk. The watcher's settle window (550 ms) then coalesces the change and
	// drives a re-init through the graphFactory.
	const ui5YamlPath = path.join(tmpProject, "ui5.yaml");
	const original = await fs.readFile(ui5YamlPath, "utf8");
	await fs.writeFile(ui5YamlPath, original + "\n# watcher-triggered edit\n");

	// Wait for the watcher to observe the change and complete the re-init (settle + graph rebuild).
	const deadline = Date.now() + 15000;
	while (graphBuilds === 0 && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	t.true(graphBuilds >= 1, "the ui5.yaml edit drove at least one re-init via the watcher");

	const after = await request.get("/index.html");
	t.is(after.statusCode, 200, "serves after the watcher-driven re-init");
	t.is(server.port, port, "the bound port is unchanged");

	await new Promise((resolve) => server.close(resolve));
	await fs.rm(tmpProject, {recursive: true, force: true});
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

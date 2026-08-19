// Probe F — three serve/reinitialize/close cycles in one process (no AVA).
//
// The real test file has three serial subtests, each a full serve/…/close. AVA runs them
// back-to-back in ONE worker process. probe-serve.mjs does a single cycle and exits clean;
// this repeats the cycle three times with supertest requests, so a crash that only shows
// up after repeated open/close of the native handles (parcel re-subscribe, sqlite reopen
// on the same cache dir, socket churn) in one long-lived process is reproduced.
//
// Run from packages/server:  node test/probes/probe-serve-thrice.mjs
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

process.env.NODE_ENV = "test";
const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..", "..");
process.chdir(serverRoot);

const {serve} = await import(pathToFileURL(path.resolve(serverRoot, "lib/server.js")));
const {graphFromPackageDependencies} = await import("@ui5/project/graph");
const projectWatcher = await import("@ui5/project/internal/graph/ProjectDefinitionWatcher");
const {default: supertest} = await import("supertest");

const buildGraph = () => graphFromPackageDependencies({cwd: "./test/fixtures/application.a"});

for (let cycle = 1; cycle <= 3; cycle++) {
	const ui5DataDir = path.resolve(
		"test", "tmp", "buildcache", `probe-thrice-${cycle}-${process.pid}`);
	const graph = await buildGraph();
	const server = await serve(graph, {
		port: 3400 + cycle,
		changePortIfInUse: true,
		liveReload: false,
		ui5DataDir,
	}, undefined, buildGraph, projectWatcher);
	const request = supertest(`http://127.0.0.1:${server.port}`);
	await request.get("/index.html");
	await server.reinitialize();
	await request.get("/index.html");
	await new Promise((resolve) => server.close(resolve));
	console.log(`[probe-thrice] cycle ${cycle} done (port ${server.port})`);
}

await new Promise((r) => setTimeout(r, 1000));
console.log(`[probe-thrice] all cycles settled — process exiting`);

// Probe E — serve() lifecycle WITH supertest requests, standalone (no AVA).
//
// probe-serve.mjs exits clean, so the isolated lifecycle is fine. The real test differs
// in that it drives HTTP requests through supertest against the bound socket. This probe
// adds exactly that: GET /index.html before and after reinitialize(), then close(). If
// this crashes but probe-serve does not, the trigger involves the request sockets /
// keep-alive handles interacting with teardown.
//
// Run from packages/server:  node test/probes/probe-serve-supertest.mjs
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

const ui5DataDir = path.resolve("test", "tmp", "buildcache", `probe-serve-supertest-${process.pid}`);
const graph = await buildGraph();
const server = await serve(graph, {
	port: 3399,
	changePortIfInUse: true,
	liveReload: false,
	ui5DataDir,
}, undefined, buildGraph, projectWatcher);
console.log(`[probe-supertest] listening on ${server.port}`);

const request = supertest(`http://127.0.0.1:${server.port}`);
console.log(`[probe-supertest] GET before: ${(await request.get("/index.html")).statusCode}`);

await server.reinitialize();
console.log(`[probe-supertest] reinitialized`);

console.log(`[probe-supertest] GET after: ${(await request.get("/index.html")).statusCode}`);

await new Promise((resolve) => server.close(resolve));
console.log(`[probe-supertest] closed`);

await new Promise((r) => setTimeout(r, 1000));
console.log(`[probe-supertest] settled — process exiting`);

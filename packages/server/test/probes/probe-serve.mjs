// Probe D — Full serve() -> reinitialize() -> close() lifecycle, standalone (no AVA).
//
// Mirrors the first subtest of reinitialize.js against the real graph + BuildServer +
// Supervisor, but as a plain Node process so the exit code is attributable to this flow
// alone (AVA is not in the picture). After close() resolves it prints a marker, waits
// briefly, then exits.
//
//   - If it crashes 0xC0000005 BEFORE "[probe-serve] closed" -> the crash is during
//     destroy()/teardown while JS is still running.
//   - If it prints "[probe-serve] closed" and "[probe-serve] settled" and THEN the
//     process crashes on exit -> the crash is at process exit with a native handle
//     (parcel watch thread / sqlite mmap) not fully released.
//   - Exit 0 clean -> the isolated lifecycle does not reproduce it; the trigger needs
//     the AVA worker environment (e.g. supertest sockets, the loader, concurrent files).
//
// Run from packages/server:  node test/probes/probe-serve.mjs
import path from "node:path";
import {fileURLToPath} from "node:url";

process.env.NODE_ENV = "test";
const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..", "..");
process.chdir(serverRoot); // so ./test/fixtures/application.a resolves like the test

const {serve} = await import(path.resolve(serverRoot, "lib/server.js"));
const {graphFromPackageDependencies} = await import("@ui5/project/graph");
const projectWatcher = await import("@ui5/project/internal/graph/ProjectDefinitionWatcher");

const buildGraph = () => graphFromPackageDependencies({cwd: "./test/fixtures/application.a"});

const ui5DataDir = path.resolve("test", "tmp", "buildcache", `probe-serve-${process.pid}`);
console.log(`[probe-serve] serving (ui5DataDir=${ui5DataDir})`);
const graph = await buildGraph();
const server = await serve(graph, {
	port: 3399, // fixed port; changePortIfInUse bumps it if busy
	changePortIfInUse: true,
	liveReload: false,
	ui5DataDir,
}, undefined, buildGraph, projectWatcher);
console.log(`[probe-serve] listening on ${server.port}`);

console.log(`[probe-serve] reinitialize`);
await server.reinitialize();
console.log(`[probe-serve] reinitialized`);

await new Promise((resolve) => server.close(resolve));
console.log(`[probe-serve] closed`);

// Hold the process open briefly so an exit-time native crash is clearly separated from
// the in-flight teardown above.
await new Promise((r) => setTimeout(r, 1000));
console.log(`[probe-serve] settled — process exiting`);

// Probe B — node:sqlite reopen/refcount pattern of a reinitialize() swap.
//
// A reinitialize() opens a SECOND handle on the same cache dir before the first is
// closed (refcount 1 -> 2), then closes the first (2 -> 1), later the second (1 -> 0).
// Two DatabaseSync handles onto the same WAL+mmap file, overlapping, then both closed.
// If this crashes but probe-sqlite does not, the origin is concurrent handles onto the
// same mmapped WAL DB on Windows.
//
// Run from packages/project:  node ../server/test/tmp/probe-sqlite-reopen.mjs
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const {default: BuildCacheStorage} =
	await import(pathToFileURL(path.resolve(here, "../../../project/lib/build/cache/BuildCacheStorage.js")));

const dbDir = path.resolve(here, `probe-sqlite-reopen-${process.pid}`);
console.log(`[probe-reopen] open #1 ${dbDir}`);
const a = new BuildCacheStorage(dbDir);
a.transaction(() => a.putContent("sha512-a", Buffer.alloc(4096, 1)));

console.log(`[probe-reopen] open #2 (overlapping) same dir`);
const b = new BuildCacheStorage(dbDir);
console.log(`[probe-reopen] #2 reads #1's row: ${b.hasContent("sha512-a")}`);
b.transaction(() => b.putContent("sha512-b", Buffer.alloc(4096, 2)));

console.log(`[probe-reopen] close #1 (swap: old stack torn down)`);
a.close();
console.log(`[probe-reopen] #2 still serving: ${b.hasContent("sha512-a")} / ${b.hasContent("sha512-b")}`);

console.log(`[probe-reopen] close #2 (server.close)`);
b.close();
console.log(`[probe-reopen] both closed OK — process exiting`);

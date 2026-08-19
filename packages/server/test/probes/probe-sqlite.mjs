// Probe A — node:sqlite (BuildCacheStorage) native teardown in isolation.
//
// Opens the build-cache DB the exact way the server does (WAL + mmap + busy_timeout),
// writes a row, closes it (WAL checkpoint TRUNCATE + db.close()), then lets the process
// exit. If this crashes with 0xC0000005 on Windows, the origin is node:sqlite teardown
// (mmap unmap / WAL checkpoint on close), independent of parcel and the swap logic.
//
// Run from packages/project:  node ../server/test/tmp/probe-sqlite.mjs
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const {default: BuildCacheStorage} =
	await import(path.resolve(here, "../../../project/lib/build/cache/BuildCacheStorage.js"));

const dbDir = path.resolve(here, `probe-sqlite-${process.pid}`);
console.log(`[probe-sqlite] opening ${dbDir}`);
const storage = new BuildCacheStorage(dbDir);

// Exercise a write + read so mmap pages are actually mapped in.
storage.transaction(() => {
	storage.putContent("sha512-probe", Buffer.alloc(4096, 7));
});
console.log(`[probe-sqlite] hasContent=${storage.hasContent("sha512-probe")}`);
console.log(`[probe-sqlite] size=${storage.getDatabaseSize()}`);

console.log(`[probe-sqlite] closing`);
storage.close();
console.log(`[probe-sqlite] closed OK — process exiting`);

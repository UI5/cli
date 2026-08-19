// Probe C — @parcel/watcher subscribe/unsubscribe native teardown in isolation.
//
// Subscribes to a directory, triggers an event, unsubscribes, then lets the process exit.
// If this crashes with 0xC0000005 on Windows, the origin is the @parcel/watcher native
// binding (a background ReadDirectoryChangesW thread outliving unsubscribe / racing exit),
// independent of node:sqlite and the swap logic.
//
// Run from packages/project:  node ../server/test/tmp/probe-parcel.mjs
import path from "node:path";
import fs from "node:fs/promises";
import {fileURLToPath, pathToFileURL} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const {subscribe} = await import(
	pathToFileURL(path.resolve(here, "../../../project/lib/build/helpers/fileWatcher.js")));

const dir = path.resolve(here, `probe-parcel-${process.pid}`);
await fs.mkdir(dir, {recursive: true});
console.log(`[probe-parcel] subscribing to ${dir}`);

let eventCount = 0;
const sub = await subscribe(dir, (err, events) => {
	if (err) {
		console.error(`[probe-parcel] watcher error: ${err.message}`);
		return;
	}
	eventCount += events.length;
});

// Produce a change so the native watch thread is actively delivering.
await fs.writeFile(path.join(dir, "file.txt"), "hello");
await new Promise((r) => setTimeout(r, 300));
await fs.writeFile(path.join(dir, "file.txt"), "world");
await new Promise((r) => setTimeout(r, 300));
console.log(`[probe-parcel] observed ${eventCount} event(s)`);

console.log(`[probe-parcel] unsubscribing`);
await sub.unsubscribe();
console.log(`[probe-parcel] unsubscribed OK — process exiting`);

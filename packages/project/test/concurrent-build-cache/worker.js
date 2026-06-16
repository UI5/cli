/*
 * Worker: runs one full project build against a shared SQLite cache.
 *
 * Args (env):
 *   UI5_BUILD_CACHE_BARRIER  URL hit by ProjectBuildCache.writeCache before
 *                            opening the DB transaction. The driver releases
 *                            all peers simultaneously.
 *   WORKER_ID                logical id, used for log prefixes / dist subdir
 *   FIXTURE_PATH             absolute path to copied application.a fixture
 *   UI5_DATA_DIR             shared ui5DataDir (cache.db lives here)
 *   DEST_PATH                worker-specific dist target (avoid clobbering)
 *   CACHE_MODE               build cache mode (default "default")
 *   MID_BUILD_MUTATION_MARKER
 *                            if set, a timer fires shortly after build kickoff
 *                            and appends `// <marker>\n` to webapp/test.js.
 *                            Exercises the SourceChangedDuringBuildError code
 *                            path under concurrent cache contention. Driver
 *                            sets this only in --mutate-during-build mode,
 *                            which already guarantees per-worker fixtures.
 */

import {appendFile} from "node:fs/promises";
import path from "node:path";
import {graphFromPackageDependencies} from "../../lib/graph/graph.js";

const id = process.env.WORKER_ID ?? "?";
const fixturePath = process.env.FIXTURE_PATH;
const ui5DataDir = process.env.UI5_DATA_DIR;
const destPath = process.env.DEST_PATH;
const cacheMode = process.env.CACHE_MODE ?? "default";
const midBuildMarker = process.env.MID_BUILD_MUTATION_MARKER ?? null;

if (!fixturePath || !ui5DataDir || !destPath) {
	console.error(`worker[${id}]: missing FIXTURE_PATH / UI5_DATA_DIR / DEST_PATH`);
	process.exit(2);
}

function log(msg) {
	console.log(`worker[${id}] ${msg}`);
}

// Schedules a single append to webapp/test.js a short time after kickoff.
// Delay is small but jittered so workers don't all mutate at the exact same
// instant (otherwise they'd serialize on the FS layer rather than racing the
// in-flight build). Returns a function that cancels the timer.
function scheduleMidBuildMutation(marker) {
	const targetFile = path.join(fixturePath, "webapp", "test.js");
	// Jitter 25–125ms — fast enough to land inside the build's resource-read
	// window for a small fixture, slow enough to vary across workers.
	const delay = 25 + Math.floor(Math.random() * 100);
	let cancelled = false;
	const handle = setTimeout(async () => {
		if (cancelled) return;
		try {
			await appendFile(targetFile, `\n// ${marker}\n`);
			log(`mid-build mutation applied to ${targetFile} after ${delay}ms`);
		} catch (err) {
			log(`mid-build mutation FAILED: ${err.message}`);
		}
	}, delay);
	return () => {
		cancelled = true;
		clearTimeout(handle);
	};
}

const start = performance.now();
let cancelMutation = null;
try {
	log(`starting build, cache=${cacheMode}, barrier=${process.env.UI5_BUILD_CACHE_BARRIER ? "on" : "off"}` +
		`${midBuildMarker ? ", midBuildMutation=on" : ""}`);

	const graph = await graphFromPackageDependencies({
		cwd: fixturePath,
	});

	if (midBuildMarker) {
		cancelMutation = scheduleMidBuildMutation(midBuildMarker);
	}

	await graph.build({
		destPath,
		ui5DataDir,
		cache: cacheMode,
	});

	cancelMutation?.();
	const elapsed = (performance.now() - start).toFixed(1);
	log(`build OK in ${elapsed} ms`);
	process.exit(0);
} catch (err) {
	cancelMutation?.();
	const elapsed = (performance.now() - start).toFixed(1);
	const msg = String(err?.message ?? "");
	// Categorize for the driver. SourceChangedDuringBuildError is an EXPECTED
	// outcome under --mutate-during-build (the build aborts cleanly without
	// committing); distinguish it from BUSY and from genuine errors.
	let tag, exitCode;
	if (/SQLITE_BUSY|database is locked/i.test(msg)) {
		tag = "BUSY"; exitCode = 3;
	} else if (err?.name === "SourceChangedDuringBuildError" ||
			/source files .* during the build/i.test(msg)) {
		tag = "SOURCE_CHANGED"; exitCode = 4;
	} else {
		tag = "ERROR"; exitCode = 1;
	}
	log(`build ${tag} after ${elapsed} ms: ${err?.message}`);
	if (process.env.WORKER_VERBOSE) {
		console.error(err?.stack ?? err);
	}
	process.exit(exitCode);
}

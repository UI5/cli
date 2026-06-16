#!/usr/bin/env node
/*
 * Concurrent build cache stress driver.
 *
 * Spawns N worker processes that each run a full project build against the
 * SAME ui5DataDir (and therefore the SAME cache.db). Holds them at a
 * synchronized barrier just before they open the writer transaction, then
 * releases all of them simultaneously. Verifies the resulting cache.db.
 *
 * Usage:
 *   node packages/project/test/concurrent-build-cache/run.js [options]
 *
 * Options:
 *   --workers=N      number of concurrent worker processes (default 4)
 *   --rounds=N       repeat the whole experiment N times (default 1)
 *   --repeat=N       after the initial concurrent build, run N-1 additional
 *                    builds against the SAME cache.db with the SAME fixtures.
 *                    Asserts the cache is NOT mutated by re-builds — i.e. that
 *                    every repeat is fully served from cache (default 1 = no
 *                    repeat). When combined with --mutate-during-build, the
 *                    mid-build mutation only fires during the initial build;
 *                    the byte-stability baseline is captured after repeat 1
 *                    (so SOURCE_CHANGED workers' first-repeat catch-up is
 *                    accepted) and stability is asserted across repeats 2..N-1.
 *   --extra-files=N  drop N generated .js modules into the fixture to inflate
 *                    the cache write transaction (default 0)
 *   --mutate-during-build  each worker appends a second marker to its
 *                    webapp/test.js shortly after build kickoff, so source
 *                    files change WHILE the build is running. Exercises
 *                    SourceChangedDuringBuildError detection under concurrent
 *                    cache contention. Implies per-worker fixtures (--mutate).
 *   --no-barrier     skip the synchronized release; spawn workers and let
 *                    them race naturally (baseline)
 *   --keep           leave tmp dirs and cache.db on disk after the run
 *   --verbose        print worker stdout/stderr live
 *   --cache-mode=M   passed to graph.build (default "default")
 */

import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {readFileSync, existsSync, rmSync} from "node:fs";
import {cp, mkdtemp, mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {verifyCacheDb} from "./verify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const FIXTURES_ROOT = path.join(PROJECT_ROOT, "test/fixtures");
const TMP_ROOT = path.join(PROJECT_ROOT, "test/tmp");
const HOOK_FILE = path.join(PROJECT_ROOT, "lib/build/cache/ProjectBuildCache.js");
const HOOK_MARKER = "UI5_BUILD_CACHE_BARRIER";
const WORKER = path.join(__dirname, "worker.js");

function parseArgs(argv) {
	const opts = {
		workers: 4,
		rounds: 1,
		repeat: 1,
		barrier: true,
		keep: false,
		verbose: false,
		cacheMode: "default",
		mutate: true,
		extraFiles: 0,
		mutateDuringBuild: false,
	};
	for (const arg of argv.slice(2)) {
		const [k, v] = arg.includes("=") ? arg.split("=", 2) : [arg, "true"];
		switch (k) {
			case "--workers": opts.workers = parseInt(v, 10); break;
			case "--rounds": opts.rounds = parseInt(v, 10); break;
			case "--repeat": opts.repeat = parseInt(v, 10); break;
			case "--no-barrier": opts.barrier = false; break;
			case "--keep": opts.keep = true; break;
			case "--verbose": opts.verbose = true; break;
			case "--cache-mode": opts.cacheMode = v; break;
			case "--shared": opts.mutate = false; break;
			case "--no-mutate": opts.mutate = false; break;
			case "--extra-files": opts.extraFiles = parseInt(v, 10); break;
			case "--mutate-during-build": opts.mutateDuringBuild = true; break;
			case "--help":
			case "-h":
				console.log(readFileSync(path.join(__dirname, "README.md"), "utf8"));
				process.exit(0);
			default:
				console.error(`Unknown option: ${arg}`);
				process.exit(2);
		}
	}
	if (!Number.isFinite(opts.workers) || opts.workers < 1) {
		console.error(`--workers must be >= 1`);
		process.exit(2);
	}
	if (!Number.isFinite(opts.extraFiles) || opts.extraFiles < 0) {
		console.error(`--extra-files must be >= 0`);
		process.exit(2);
	}
	if (!Number.isFinite(opts.repeat) || opts.repeat < 1) {
		console.error(`--repeat must be >= 1`);
		process.exit(2);
	}
	if (opts.mutateDuringBuild && !opts.mutate) {
		console.error(`--mutate-during-build requires per-worker fixtures; ` +
			`incompatible with --shared / --no-mutate`);
		process.exit(2);
	}
	return opts;
}

function checkInstrumentation() {
	const src = readFileSync(HOOK_FILE, "utf8");
	if (!src.includes(HOOK_MARKER)) {
		console.error(
			`\n[!] WARNING: ${HOOK_FILE}\n` +
			`    does not contain the ${HOOK_MARKER} hook.\n` +
			`    Workers will NOT pause at the barrier — concurrent overlap is\n` +
			`    only by chance. See README.md for the one-line patch.\n`
		);
		return false;
	}
	return true;
}

/**
 * Barrier HTTP server that holds incoming requests until N have arrived,
 * then responds to all of them at once.
 *
 * Workers that error out BEFORE writeCache (e.g. SourceChangedDuringBuildError
 * from --mutate-during-build) never hit the barrier. The driver calls
 * dropIfAbsent(id) when such a worker exits, which shrinks `remaining` so the
 * peers actually present can be released without waiting for the watchdog.
 *
 * Workers identify themselves via ?id=<WORKER_ID> on the barrier URL.
 */
function startBarrier({expected, log}) {
	const pending = [];
	const arrived = new Set();
	let released = false;
	let remaining = expected;
	const tryRelease = () => {
		if (released || pending.length < remaining) return;
		released = true;
		log(`barrier: releasing all ${pending.length} peer(s)`);
		for (const r of pending) {
			r.statusCode = 200;
			r.end("go");
		}
	};
	const server = createServer((req, res) => {
		const url = new URL(req.url, "http://x");
		const peerId = url.searchParams.get("id") ?? `?${pending.length}`;
		arrived.add(peerId);
		log(`barrier: peer ${peerId} arrived (${pending.length + 1}/${remaining})`);
		pending.push(res);
		tryRelease();
	});
	return new Promise((resolve, reject) => {
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const {port} = server.address();
			resolve({
				url: `http://127.0.0.1:${port}/`,
				close: () => new Promise((r) => server.close(() => r())),
				releaseEarly: () => {
					if (!released) {
						released = true;
						for (const r of pending) {
							r.statusCode = 200;
							r.end("go");
						}
					}
				},
				// Driver calls this on every worker exit. If that worker
				// never reached the barrier (e.g. SOURCE_CHANGED before
				// writeCache), shrink `remaining` so the survivors release
				// without waiting for the watchdog.
				dropIfAbsent: (peerId) => {
					if (released) return;
					if (arrived.has(peerId)) return;
					if (remaining > 0) remaining--;
					log(`barrier: peer ${peerId} exited without arriving, ` +
						`${pending.length}/${remaining} now needed`);
					tryRelease();
				},
			});
		});
	});
}

async function copyFixture(workDir) {
	const fixturePath = path.join(workDir, "application.a");
	await cp(path.join(FIXTURES_ROOT, "application.a"), fixturePath, {recursive: true});
	return fixturePath;
}

/**
 * Drop N tiny .js modules into webapp/generated/ to inflate the build cache so
 * its write transaction takes long enough for concurrent workers to actually
 * collide on the writer lock.
 *
 * `seed` is mixed into every file's body so two fixtures populated with the
 * same `count` but different seeds produce identical *paths* but disjoint
 * *content* — the same `mod0.js` resource yields a different integrity hash
 * per worker, maximally stressing CAS contention while keeping the project's
 * resource set identical across workers.
 *
 * In --shared mode the driver passes a constant seed so all workers see
 * the same generated content and the row-collision behaviour is preserved.
 */
async function populateExtraFiles(fixturePath, count, seed, log) {
	if (count <= 0) return;
	const {writeFile, mkdir} = await import("node:fs/promises");
	const dir = path.join(fixturePath, "webapp", "generated");
	await mkdir(dir, {recursive: true});
	const writes = [];
	for (let i = 0; i < count; i++) {
		const filePath = path.join(dir, `mod${i}.js`);
		const content =
			`// generated module ${i} (seed=${seed})\n` +
			`sap.ui.define([], function() {\n` +
			`	"use strict";\n` +
			`	return {\n` +
			`		id: ${i},\n` +
			`		seed: ${JSON.stringify(String(seed))},\n` +
			`		fn: function(x) { return x + ${i}; }\n` +
			`	};\n` +
			`});\n`;
		writes.push(writeFile(filePath, content));
	}
	await Promise.all(writes);
	log(`populated ${count} extra .js files under ${dir} (seed=${seed})`);
}

/**
 * Computes a deterministic sha256 fingerprint of cache.db's logical state
 * by hashing every row of the three persistent tables in PK order. Two
 * fingerprints are equal iff the cache contains the exact same rows with
 * the exact same blob bytes — used to assert that repeat builds DO NOT
 * mutate the cache.
 *
 * Reads through a fresh read-only DatabaseSync handle so an in-flight WAL
 * checkpoint wouldn't see our reads as writers.
 */
function fingerprintCache(dbPath) {
	const db = new DatabaseSync(dbPath, {readOnly: true});
	const h = createHash("sha256");
	const counts = {};
	try {
		const tables = [
			{name: "content", sql: "SELECT integrity, data FROM content ORDER BY integrity"},
			{
				name: "stage_metadata",
				sql: "SELECT project_id, build_signature, stage_id, stage_signature, data " +
					"FROM stage_metadata " +
					"ORDER BY project_id, build_signature, stage_id, stage_signature",
			},
			{
				name: "result_metadata",
				sql: "SELECT project_id, build_signature, stage_signature, data " +
					"FROM result_metadata " +
					"ORDER BY project_id, build_signature, stage_signature",
			},
		];
		for (const t of tables) {
			h.update(`\x00${t.name}\x00`);
			let n = 0;
			for (const row of db.prepare(t.sql).iterate()) {
				n++;
				for (const key of Object.keys(row)) {
					const val = row[key];
					h.update(`\x01${key}\x01`);
					if (val instanceof Uint8Array) {
						h.update(val);
					} else if (val == null) {
						h.update("\x02NULL\x02");
					} else {
						h.update(Buffer.from(String(val), "utf8"));
					}
				}
				h.update("\x03"); // row terminator
			}
			counts[t.name] = n;
		}
	} finally {
		db.close();
	}
	return {hash: h.digest("hex"), counts};
}

function spawnWorker({id, fixturePath, ui5DataDir, destPath, barrierUrl, midBuildMarker, onExit, opts}) {
	return new Promise((resolve) => {
		const env = {
			...process.env,
			WORKER_ID: String(id),
			FIXTURE_PATH: fixturePath,
			UI5_DATA_DIR: ui5DataDir,
			DEST_PATH: destPath,
			CACHE_MODE: opts.cacheMode,
		};
		if (barrierUrl) {
			// Suffix the URL with the worker id so the barrier server can
			// log per-peer arrivals and so dropIfAbsent(id) on early exit
			// only shrinks for workers that never reached writeCache.
			env.UI5_BUILD_CACHE_BARRIER = `${barrierUrl}?id=${id}`;
		}
		if (opts.mutateDuringBuild && midBuildMarker) {
			env.MID_BUILD_MUTATION_MARKER = midBuildMarker;
		}
		if (opts.verbose) {
			env.WORKER_VERBOSE = "1";
		}
		const child = spawn(process.execPath, [WORKER], {
			env,
			stdio: opts.verbose ? "inherit" : ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const start = performance.now();
		if (!opts.verbose) {
			child.stdout.on("data", (b) => stdout += b);
			child.stderr.on("data", (b) => stderr += b);
		}
		child.on("exit", (code, signal) => {
			// Notify driver immediately on exit (before the Promise resolves
			// up the await chain) so the barrier can drop ghosts and release
			// surviving peers without waiting for the watchdog.
			try {
				onExit?.({id, code, signal});
			} catch (err) {
				// Don't let a buggy callback strand the worker result.
				console.error(`onExit callback threw for worker[${id}]: ${err.message}`);
			}
			resolve({
				id,
				code,
				signal,
				elapsedMs: performance.now() - start,
				stdout,
				stderr,
			});
		});
	});
}

function runRound({roundNum, opts, hookPresent, log}) {
	return (async () => {
		const workDir = await mkdtemp(path.join(TMP_ROOT, `concurrent-build-cache-r${roundNum}-`));
		const ui5DataDir = path.join(workDir, "ui5-data");
		log(`workdir: ${workDir}`);

		const fixtureMaster = await copyFixture(workDir);

		// Two modes:
		//   --mutate (default): each worker gets its own fixture copy with a unique
		//     line appended to webapp/test.js. Distinct source content → distinct
		//     buildSignatures, sourceIndex hashes, integrities. Workers race to insert
		//     mostly-disjoint CAS rows + disjoint stage_metadata rows. Realistic CAS
		//     concurrency.
		//     --extra-files content is also seeded per worker — same paths, disjoint
		//     bytes — so each generated mod*.js becomes a different CAS row per worker.
		//   --shared: all workers share ONE fixture root. Identical content → identical
		//     signatures → all writeCache calls target the SAME rows. Stresses
		//     INSERT OR REPLACE serialization on the writer lock. --extra-files content
		//     is populated once on the shared master.
		const workerInputs = [];
		if (opts.mutate) {
			const {appendFileSync} = await import("node:fs");
			for (let i = 0; i < opts.workers; i++) {
				const wDir = path.join(workDir, `w${i}`);
				await cp(fixtureMaster, wDir, {recursive: true});
				await populateExtraFiles(wDir, opts.extraFiles, `w${i}`, log);
				const testFile = path.join(wDir, "webapp", "test.js");
				// Each marker is unique per (worker, round) so verify.js can
				// look it up after the run and prove this worker's content
				// actually made it into the cache.
				const marker = `per-worker mutation: worker ${i} round ${roundNum}`;
				appendFileSync(testFile, `\n// ${marker}\n`);
				workerInputs.push({
					id: i,
					fixturePath: wDir,
					destPath: path.join(workDir, `dist-${i}`),
					marker,
					midBuildMarker: opts.mutateDuringBuild ?
						`mid-build mutation: worker ${i} round ${roundNum}` :
						null,
				});
			}
		} else {
			await populateExtraFiles(fixtureMaster, opts.extraFiles, "shared", log);
			for (let i = 0; i < opts.workers; i++) {
				workerInputs.push({
					id: i,
					fixturePath: fixtureMaster,
					destPath: path.join(workDir, `dist-${i}`),
					marker: null,
					midBuildMarker: null,
				});
			}
		}

		let barrier = null;
		let barrierUrl = null;
		if (opts.barrier && hookPresent) {
			barrier = await startBarrier({expected: opts.workers, log});
			barrierUrl = barrier.url;
		}

		const startedAt = performance.now();
		log(`spawning ${opts.workers} worker(s)${barrierUrl ? " with barrier" : " without barrier"}`);

		const watchdog = setTimeout(() => {
			log(`watchdog: 90s elapsed, releasing barrier early in case some workers never arrived`);
			barrier?.releaseEarly();
		}, 90_000);

		const results = await Promise.all(workerInputs.map((w) => spawnWorker({
			...w,
			ui5DataDir,
			barrierUrl,
			onExit: ({id}) => barrier?.dropIfAbsent(String(id)),
			opts,
		})));
		clearTimeout(watchdog);
		await barrier?.close();

		const totalElapsed = performance.now() - startedAt;
		const okCount = results.filter((r) => r.code === 0).length;
		const busyCount = results.filter((r) => r.code === 3).length;
		const sourceChangedCount = results.filter((r) => r.code === 4).length;
		const errCount = results.length - okCount - busyCount - sourceChangedCount;

		log(`results: ${okCount} OK / ${busyCount} BUSY / ` +
			`${sourceChangedCount} SOURCE_CHANGED / ${errCount} ERROR ` +
			`(wall ${totalElapsed.toFixed(0)} ms, slowest worker ` +
			`${Math.max(...results.map((r) => r.elapsedMs)).toFixed(0)} ms)`);

		for (const r of results) {
			const tag = r.code === 0 ? "OK" :
				r.code === 3 ? "BUSY" :
				r.code === 4 ? "SOURCE_CHANGED" :
				"ERROR";
			log(`  worker[${r.id}] ${tag} (exit=${r.code}, ${r.elapsedMs.toFixed(0)} ms)`);
			if (!opts.verbose && r.code !== 0 && r.code !== 4) {
				const tail = (r.stdout + r.stderr).split("\n").filter(Boolean).slice(-6).join("\n      ");
				if (tail) log(`      ${tail}`);
			}
		}

		// Verify cache.db. The cache lives under ui5DataDir/buildCache/<version>/cache.db,
		// and the version segment changes between releases — discover it instead of hardcoding.
		const buildCacheRoot = path.join(ui5DataDir, "buildCache");
		let dbPath = null;
		if (existsSync(buildCacheRoot)) {
			const {readdirSync} = await import("node:fs");
			for (const entry of readdirSync(buildCacheRoot)) {
				const candidate = path.join(buildCacheRoot, entry, "cache.db");
				if (existsSync(candidate)) {
					dbPath = candidate;
					break;
				}
			}
		}
		let verification = null;
		if (dbPath) {
			log(`verifying ${dbPath}`);
			// Predict how many distinct build_signatures the application project
			// should have in result_metadata after the dust settles:
			//   --mutate: each OK worker has a unique buildSignature
			//   --shared: all OK workers collapse to one row
			const expectedResultCount = opts.mutate ? okCount : (okCount > 0 ? 1 : 0);
			// In --mutate mode, every OK worker has a unique marker line in
			// webapp/test.js. Verifier confirms each marker actually made it
			// into a CAS row (proves no worker's CONTENT got lost — strictly
			// stronger than the row-count check above).
			const expectedWorkerMarkers = opts.mutate ?
				results
					.filter((r) => r.code === 0)
					.map((r) => workerInputs.find((w) => w.id === r.id)?.marker)
					.filter(Boolean) :
				null;
			try {
				verification = verifyCacheDb(dbPath, {
					expectedResultCount,
					mode: opts.mutate ? "mutate" : "shared",
					expectedWorkerMarkers,
				});
				const verdict = verification.ok ? "OK" : "FAILED";
				log(`  verdict: ${verdict} (${verification.errors.length} error(s), ` +
					`${verification.warnings.length} warning(s))`);
				log(`  stats: ${JSON.stringify(verification.stats)}`);
				for (const c of verification.expectations) {
					const tag = c.ok ? "OK" : "UNEXPECTED";
					log(`  [${tag}] ${c.label}: expected ${JSON.stringify(c.expected)}, ` +
						`got ${JSON.stringify(c.actual)}`);
				}
				for (const e of verification.errors) log(`  ERROR: ${e}`);
				for (const w of verification.warnings) log(`  WARN: ${w}`);
			} catch (err) {
				log(`  verifier threw: ${err.message}`);
				verification = {
					ok: false,
					errors: [err.message],
					warnings: [],
					stats: {},
					expectations: [],
				};
			}
		} else {
			log(`no cache.db under ${buildCacheRoot} — nothing to verify`);
		}

		// Repeat phase: re-run N-1 builds against the SAME cache, with the
		// SAME fixtures, and assert the cache is byte-identical afterwards.
		// First build populated everything; subsequent builds should hit cache
		// for every resource and therefore not mutate any row. Any difference
		// in the row-hash means the cache layer is doing redundant writes
		// (worst case: re-inserting identical rows; bug case: actually
		// changing stored content).
		//
		// Special case: --mutate-during-build. Workers that hit SOURCE_CHANGED
		// during the initial build wrote nothing, so the first repeat will
		// legitimately add rows for the post-mutation source content of those
		// fixtures. We capture the baseline AFTER the first repeat (the cache
		// has now seen every fixture's final content) and check stability
		// across all subsequent repeats. Repeats themselves never re-run
		// mid-build mutation — `midBuildMarker: null` on every spawn.
		const repeatReports = [];
		let cacheMutatedOnRepeat = 0;
		if (opts.repeat > 1 && dbPath && verification?.ok) {
			const baselineRepeat = opts.mutateDuringBuild ? 1 : 0;
			let baseline = opts.mutateDuringBuild ? null : fingerprintCache(dbPath);
			if (baseline) {
				log(`repeat baseline: hash=${baseline.hash.slice(0, 16)}… ` +
					`counts=${JSON.stringify(baseline.counts)}`);
			} else {
				log(`repeat baseline deferred to after repeat[1] ` +
					`(--mutate-during-build: SOURCE_CHANGED workers may add rows on first repeat)`);
			}
			for (let rep = 1; rep < opts.repeat; rep++) {
				log(`---- repeat ${rep} / ${opts.repeat - 1} (cache reuse) ----`);
				const repeatResults = await Promise.all(workerInputs.map((w) => spawnWorker({
					...w,
					ui5DataDir,
					barrierUrl: null, // no contention expected on cache hits
					midBuildMarker: null, // mutation forbidden on repeat
					onExit: null,
					opts,
				})));
				const okRepeat = repeatResults.filter((r) => r.code === 0).length;
				const errRepeat = repeatResults.length - okRepeat;
				log(`  repeat[${rep}] results: ${okRepeat} OK / ${errRepeat} non-OK`);
				for (const r of repeatResults) {
					if (r.code !== 0) {
						const tail = (r.stdout + r.stderr)
							.split("\n").filter(Boolean).slice(-6).join("\n      ");
						log(`    worker[${r.id}] exit=${r.code} ${tail ? `\n      ${tail}` : ""}`);
					}
				}
				const after = fingerprintCache(dbPath);
				if (rep === baselineRepeat && !baseline) {
					baseline = after;
					log(`  [BASELINE] cache fingerprint captured after repeat[${rep}]: ` +
						`hash=${after.hash.slice(0, 16)}… counts=${JSON.stringify(after.counts)}`);
					if (errRepeat > 0) {
						log(`  [UNEXPECTED] ${errRepeat} worker(s) failed on repeat[${rep}] — ` +
							`expected all to succeed`);
						repeatReports.push({
							iteration: rep,
							ok: okRepeat,
							err: errRepeat,
							hash: after.hash,
							counts: after.counts,
							mutated: false,
						});
					}
					continue;
				}
				const mutated = after.hash !== baseline.hash;
				const report = {
					iteration: rep,
					ok: okRepeat,
					err: errRepeat,
					hash: after.hash,
					counts: after.counts,
					mutated,
				};
				repeatReports.push(report);
				if (mutated) {
					cacheMutatedOnRepeat++;
					log(`  [UNEXPECTED] cache mutated on repeat[${rep}]: ` +
						`baseline=${baseline.hash.slice(0, 16)}… ` +
						`after=${after.hash.slice(0, 16)}… ` +
						`counts=${JSON.stringify(after.counts)}`);
				} else {
					log(`  [OK] cache unchanged on repeat[${rep}] ` +
						`(hash=${after.hash.slice(0, 16)}…)`);
				}
				if (errRepeat > 0) {
					// Worker failure on repeat is itself unexpected: source
					// hasn't changed, cache is populated, the build should
					// just succeed. Surface it as cache-mutation-class noise.
					log(`  [UNEXPECTED] ${errRepeat} worker(s) failed on repeat[${rep}] — ` +
						`expected all to succeed from cache`);
				}
			}
		}

		if (!opts.keep) {
			rmSync(workDir, {recursive: true, force: true});
		} else {
			log(`--keep: leaving ${workDir} on disk`);
		}

		return {results, verification, totalElapsed, repeatReports, cacheMutatedOnRepeat};
	})();
}

async function main() {
	const opts = parseArgs(process.argv);
	const hookPresent = checkInstrumentation();
	if (opts.barrier && !hookPresent) {
		console.error(`Continuing without synchronized barrier (workers will race naturally).\n`);
	}

	await mkdir(TMP_ROOT, {recursive: true});

	const log = (msg) => console.log(`[driver] ${msg}`);
	log(`config: workers=${opts.workers} rounds=${opts.rounds} repeat=${opts.repeat} ` +
		`barrier=${opts.barrier && hookPresent} ` +
		`mutate=${opts.mutate} mutateDuringBuild=${opts.mutateDuringBuild} ` +
		`extraFiles=${opts.extraFiles} cache=${opts.cacheMode} keep=${opts.keep}`);

	const summary = {
		rounds: opts.rounds,
		workers: opts.workers,
		barrier: opts.barrier && hookPresent,
		mutate: opts.mutate,
		mutateDuringBuild: opts.mutateDuringBuild,
		ok: 0,
		busy: 0,
		sourceChanged: 0,
		error: 0,
		integrityFailed: 0,
		danglingRefs: 0,
		hashMismatches: 0,
		commitLoss: 0,
		atomicityBreaks: 0,
		lostWorkerContent: 0,
		pkDuplicates: 0,
		walIssues: 0,
		cacheMutatedOnRepeat: 0,
		seenCasMax: 0,
		unexpected: [],
	};

	for (let r = 0; r < opts.rounds; r++) {
		log(`---- round ${r + 1} / ${opts.rounds} ----`);
		const {results, verification, repeatReports, cacheMutatedOnRepeat} = await runRound({
			roundNum: r,
			opts,
			hookPresent,
			log,
		});
		summary.ok += results.filter((x) => x.code === 0).length;
		summary.busy += results.filter((x) => x.code === 3).length;
		summary.sourceChanged += results.filter((x) => x.code === 4).length;
		summary.error += results.filter(
			(x) => x.code !== 0 && x.code !== 3 && x.code !== 4).length;
		summary.cacheMutatedOnRepeat += cacheMutatedOnRepeat ?? 0;
		if (Array.isArray(repeatReports)) {
			for (const rr of repeatReports) {
				if (rr.mutated) {
					summary.unexpected.push(
						`r${r + 1}: cache mutated on repeat[${rr.iteration}] ` +
						`(counts ${JSON.stringify(rr.counts)})`
					);
				}
				if (rr.err > 0) {
					summary.unexpected.push(
						`r${r + 1}: ${rr.err} worker(s) failed on repeat[${rr.iteration}]`
					);
				}
			}
		}
		if (verification) {
			if (!verification.ok) summary.integrityFailed++;
			summary.danglingRefs += verification.errors.filter((e) => /DANGLING/.test(e)).length;
			summary.hashMismatches += verification.errors.filter((e) => /HASH MISMATCH/.test(e)).length;
			summary.commitLoss += verification.errors.filter((e) => /COMMIT LOSS/.test(e)).length;
			summary.atomicityBreaks += verification.errors.filter(
				(e) => /ATOMICITY|RESULT NO STAGES/.test(e)).length;
			summary.lostWorkerContent += verification.errors.filter(
				(e) => /LOST WORKER CONTENT/.test(e)).length;
			summary.pkDuplicates += verification.errors.filter((e) => /PK DUPLICATE/.test(e)).length;
			summary.walIssues += verification.errors.filter((e) => /WAL/.test(e)).length;
			if (typeof verification.stats?.casCount === "number") {
				summary.seenCasMax = Math.max(summary.seenCasMax, verification.stats.casCount);
			}
			for (const c of verification.expectations) {
				if (!c.ok) {
					summary.unexpected.push(
						`r${r + 1}: ${c.label} (expected ${JSON.stringify(c.expected)}, ` +
						`got ${JSON.stringify(c.actual)})`
					);
				}
			}
		}
	}

	log(`==== summary ====`);
	log(JSON.stringify(summary, null, 2));

	if (summary.unexpected.length === 0 && summary.error === 0) {
		log(`VERDICT: OK — all checks matched expectations`);
	} else {
		log(`VERDICT: UNEXPECTED — ${summary.unexpected.length} check(s) didn't match, ` +
			`${summary.error} worker error(s)`);
		for (const u of summary.unexpected) log(`  - ${u}`);
	}

	const fatal = summary.integrityFailed > 0 ||
		summary.danglingRefs > 0 ||
		summary.hashMismatches > 0 ||
		summary.commitLoss > 0 ||
		summary.atomicityBreaks > 0 ||
		summary.lostWorkerContent > 0 ||
		summary.pkDuplicates > 0 ||
		summary.walIssues > 0 ||
		summary.cacheMutatedOnRepeat > 0 ||
		summary.error > 0;
	process.exit(fatal ? 1 : 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

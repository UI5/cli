/*
 * Verifies a cache.db produced by the concurrent harness.
 *
 * Returns {ok, errors, warnings, stats, expectations}.
 *   - errors[]    = corruption / dangling refs / hash mismatch / commit loss /
 *                   atomicity break / lost-worker-content
 *   - warnings[]  = unexpected-but-not-corrupting (orphans, decompression,
 *                   non-gzip rows, suspicious PRAGMA settings)
 *   - expectations[] = {label, expected, actual, ok} so the driver can render
 *     "[OK] <label>: expected X, got X" or
 *     "[UNEXPECTED] <label>: expected X, got Y" lines.
 *
 * Mirrors BuildCacheStorage#deserializeMetadata: blob is JSON, gzip-compressed
 * iff it starts with magic bytes 1F 8B.
 */

import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";

// Mirrors BuildCacheStorage.js. Buffers <= this size are stored raw by
// putContent; only larger non-gzip rows indicate a bypassed compression path.
const CONTENT_COMPRESSION_THRESHOLD = 128;

function deserializeMetadata(data) {
	if (data instanceof Uint8Array && data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
		return JSON.parse(gunzipSync(data).toString());
	}
	return JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString());
}

/**
 * Decompresses a content blob if gzip-prefixed; otherwise returns it as-is.
 * Mirrors BuildCacheStorage#putContent: gzips only when buffer.length >
 * CONTENT_COMPRESSION_THRESHOLD (128 bytes). Smaller buffers are stored raw,
 * so a non-gzip row is only suspicious when the raw payload exceeds the
 * threshold.
 */
function decodeContentBlob(blob) {
	const buf = blob instanceof Uint8Array ? Buffer.from(blob) : Buffer.from(blob);
	if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
		return {raw: gunzipSync(buf), compressed: true};
	}
	return {raw: buf, compressed: false};
}

/**
 * SRI integrity strings have shape `<algo>-<base64>` (see ssri / Resource.js).
 * We accept whatever algo the row claims and recompute against it.
 */
function parseIntegrity(integrity) {
	const dash = integrity.indexOf("-");
	if (dash <= 0) return null;
	const algo = integrity.slice(0, dash);
	const expected = integrity.slice(dash + 1);
	return {algo, expected};
}

/**
 * Walks a parsed stage_metadata blob and yields {path, integrity} for every
 * resource entry that has an integrity. Source-stage and task-stage shapes
 * differ — see ProjectBuildCache#processStageCacheMetadata.
 */
function* iterStageResources(parsed) {
	const buckets = [];
	if (Array.isArray(parsed?.resourceMetadata)) {
		buckets.push(...parsed.resourceMetadata);
	} else if (parsed?.resourceMetadata) {
		buckets.push(parsed.resourceMetadata);
	}
	for (const bucket of buckets) {
		for (const path of Object.keys(bucket)) {
			const integrity = bucket[path]?.integrity;
			if (typeof integrity === "string") {
				yield {path, integrity};
			}
		}
	}
}

export function verifyCacheDb(dbPath, {
	expectedResultCount = null,
	mode = "mutate",
	expectedWorkerMarkers = null, // optional: array of literal strings, one per OK worker
} = {}) {
	const db = new DatabaseSync(dbPath, {readOnly: true});
	const errors = [];
	const warnings = [];
	const stats = {};
	const expectations = [];

	const expect = (label, expected, actual, predicate = (e, a) => e === a) => {
		const ok = predicate(expected, actual);
		expectations.push({label, expected, actual, ok});
		return ok;
	};

	// Cache for content rows we'll need twice (CAS hash check + worker-marker scan).
	const casBlobs = new Map(); // integrity -> {raw: Buffer}

	try {
		// 1) Physical integrity
		const integrity = db.prepare("PRAGMA integrity_check").all();
		const integrityOk = integrity.length === 1 && integrity[0].integrity_check === "ok";
		expect("PRAGMA integrity_check", "ok", integrityOk ? "ok" : JSON.stringify(integrity));
		if (!integrityOk) {
			errors.push(`integrity_check failed: ${JSON.stringify(integrity)}`);
		}

		// 2) Foreign-key check (no-op if schema declares no FKs, still cheap)
		const fkRows = db.prepare("PRAGMA foreign_key_check").all();
		expect("PRAGMA foreign_key_check rows", 0, fkRows.length);
		for (const row of fkRows) {
			errors.push(`FK violation: ${JSON.stringify(row)}`);
		}

		// 3) Durability-pragma sanity. The codebase configures WAL +
		// synchronous=NORMAL; a silent downgrade (e.g. journal_mode=delete)
		// would break crash safety without ever showing as a row error.
		const journalMode = db.prepare("PRAGMA journal_mode").get()?.journal_mode;
		const synchronous = db.prepare("PRAGMA synchronous").get()?.synchronous;
		stats.journalMode = journalMode;
		stats.synchronous = synchronous;
		if (journalMode !== "wal") {
			warnings.push(`journal_mode=${journalMode} (expected wal)`);
		}
		// synchronous: 0=OFF, 1=NORMAL, 2=FULL, 3=EXTRA. NORMAL or FULL is fine.
		if (synchronous !== 1 && synchronous !== 2) {
			warnings.push(`synchronous=${synchronous} (expected NORMAL=1 or FULL=2)`);
		}
		expect("journal_mode", "wal", journalMode);
		expect("synchronous in {NORMAL, FULL}", true, synchronous === 1 || synchronous === 2);

		// 4) Walk every content row: decompress, recompute hash, compare to key.
		// This is the headline check — no other downstream check can detect
		// "right integrity key, wrong bytes". We also stash the decompressed
		// buffer so the worker-marker scan (#11) doesn't re-decompress.
		const casRows = db.prepare("SELECT integrity, data FROM content").all();
		const cas = new Set();
		let hashMismatches = 0;
		let decompressFailures = 0;
		let nonGzipRows = 0;
		const nonGzipSamples = []; // {integrity, length, head} for first few non-gzip rows
		for (const row of casRows) {
			cas.add(row.integrity);
			let decoded;
			try {
				decoded = decodeContentBlob(row.data);
			} catch (err) {
				decompressFailures++;
				errors.push(`CONTENT DECOMPRESS: integrity=${row.integrity}: ${err.message}`);
				continue;
			}
			if (!decoded.compressed && decoded.raw.length > CONTENT_COMPRESSION_THRESHOLD) {
				nonGzipRows++;
				if (nonGzipSamples.length < 5) {
					const head = decoded.raw.subarray(0, Math.min(16, decoded.raw.length));
					nonGzipSamples.push({
						integrity: row.integrity,
						length: decoded.raw.length,
						hex: head.toString("hex"),
						ascii: head.toString("utf8").replace(/[^\x20-\x7e]/g, "."),
					});
				}
			}
			casBlobs.set(row.integrity, decoded);
			const parsed = parseIntegrity(row.integrity);
			if (!parsed) {
				errors.push(`CONTENT BAD INTEGRITY KEY: ${row.integrity}`);
				continue;
			}
			let actual;
			try {
				actual = createHash(parsed.algo).update(decoded.raw).digest("base64");
			} catch (err) {
				errors.push(`CONTENT HASH ALGO: integrity=${row.integrity}: ${err.message}`);
				continue;
			}
			if (actual !== parsed.expected) {
				hashMismatches++;
				errors.push(
					`CONTENT HASH MISMATCH: row claims ${row.integrity}, ` +
					`recomputed ${parsed.algo}-${actual} ` +
					`(uncompressed ${decoded.raw.length} bytes)`
				);
			}
		}
		stats.casCount = cas.size;
		stats.casHashMismatches = hashMismatches;
		stats.casDecompressFailures = decompressFailures;
		expect("content hash mismatches", 0, hashMismatches);
		expect("content decompress failures", 0, decompressFailures);
		if (nonGzipRows > 0) {
			warnings.push(
				`${nonGzipRows} content row(s) > ${CONTENT_COMPRESSION_THRESHOLD} bytes ` +
				`not gzip-prefixed (putContent should gzip these)`
			);
			for (const s of nonGzipSamples) {
				warnings.push(
					`  non-gzip sample: integrity=${s.integrity} length=${s.length} ` +
					`hex[0..${Math.min(16, s.length) - 1}]=${s.hex} ascii=${JSON.stringify(s.ascii)}`
				);
			}
		}

		// 5) Uniqueness on PRIMARY KEYs. SQLite must enforce these — we assert
		// anyway, so any future schema migration regression or bizarre
		// concurrent-INSERT-OR-REPLACE bug surfaces immediately.
		const dupCas = db.prepare(
			"SELECT integrity, COUNT(*) AS c FROM content GROUP BY integrity HAVING c > 1"
		).all();
		expect("content PK uniqueness violations", 0, dupCas.length);
		for (const r of dupCas) {
			errors.push(`PK DUPLICATE: content.integrity=${r.integrity} appears ${r.c}×`);
		}
		const dupStage = db.prepare(
			`SELECT project_id, build_signature, stage_id, stage_signature, COUNT(*) AS c
			 FROM stage_metadata
			 GROUP BY project_id, build_signature, stage_id, stage_signature HAVING c > 1`
		).all();
		expect("stage_metadata PK uniqueness violations", 0, dupStage.length);
		for (const r of dupStage) {
			errors.push(`PK DUPLICATE: stage_metadata ${r.project_id}/${r.build_signature}/` +
				`${r.stage_id}/${r.stage_signature} appears ${r.c}×`);
		}
		const dupResult = db.prepare(
			`SELECT project_id, build_signature, stage_signature, COUNT(*) AS c
			 FROM result_metadata
			 GROUP BY project_id, build_signature, stage_signature HAVING c > 1`
		).all();
		expect("result_metadata PK uniqueness violations", 0, dupResult.length);
		for (const r of dupResult) {
			errors.push(`PK DUPLICATE: result_metadata ${r.project_id}/${r.build_signature}/` +
				`${r.stage_signature} appears ${r.c}×`);
		}

		// 6) stage_metadata: every referenced integrity must exist in `content`.
		// Also collect (project_id, build_signature) and integrity → stages map
		// for cross-table consistency (#7) and worker-marker scan (#11).
		const stageRows = db.prepare(
			"SELECT project_id, build_signature, stage_id, stage_signature, data FROM stage_metadata"
		).all();
		stats.stageCount = stageRows.length;

		const referencedIntegrities = new Set();
		const stageBuildKeys = new Set(); // `${project_id}|${build_signature}`
		const integrityPaths = new Map(); // integrity -> Set<path>
		let stageDanglingCount = 0;
		let stageParseFailures = 0;
		for (const row of stageRows) {
			let parsed;
			try {
				parsed = deserializeMetadata(row.data);
			} catch (err) {
				stageParseFailures++;
				errors.push(`stage_metadata ${row.project_id}/${row.stage_id}: ` +
					`metadata not parseable: ${err.message}`);
				continue;
			}
			stageBuildKeys.add(`${row.project_id}|${row.build_signature}`);
			for (const {path, integrity} of iterStageResources(parsed)) {
				referencedIntegrities.add(integrity);
				let paths = integrityPaths.get(integrity);
				if (!paths) {
					paths = new Set();
					integrityPaths.set(integrity, paths);
				}
				paths.add(path);
				if (!cas.has(integrity)) {
					stageDanglingCount++;
					errors.push(
						`DANGLING CAS: stage_metadata ${row.project_id}/${row.stage_id} ` +
						`(${row.stage_signature}) references integrity ${integrity} ` +
						`for ${path}, but no row exists in content table`
					);
				}
			}
		}
		expect("stage_metadata dangling CAS refs", 0, stageDanglingCount);
		expect("stage_metadata parse failures", 0, stageParseFailures);

		// 7) result_metadata: each result's stageSignatures must exist in
		// stage_metadata, and each result must carry a non-empty
		// stageSignatures map (atomicity probe H — half-written result rows).
		const resultRows = db.prepare(
			"SELECT project_id, build_signature, stage_signature, data FROM result_metadata"
		).all();
		stats.resultCount = resultRows.length;
		const stageSigSet = new Set(stageRows.map((r) => `${r.project_id}|${r.stage_signature}`));
		const resultBuildKeys = new Set(); // `${project_id}|${build_signature}`
		let resultDanglingCount = 0;
		let emptyStageSignatures = 0;
		let resultParseFailures = 0;
		for (const row of resultRows) {
			let parsed;
			try {
				parsed = deserializeMetadata(row.data);
			} catch (err) {
				resultParseFailures++;
				errors.push(`result_metadata ${row.project_id}/${row.build_signature}: ` +
					`metadata not parseable: ${err.message}`);
				continue;
			}
			resultBuildKeys.add(`${row.project_id}|${row.build_signature}`);
			const refs = parsed?.stageSignatures ?? {};
			const refKeys = Object.keys(refs);
			if (refKeys.length === 0) {
				emptyStageSignatures++;
				errors.push(
					`RESULT NO STAGES: result_metadata ${row.project_id}/${row.build_signature} ` +
					`has no stageSignatures — looks like a partial write`
				);
			}
			for (const stageName of refKeys) {
				const stageSig = refs[stageName];
				if (!stageSigSet.has(`${row.project_id}|${stageSig}`)) {
					resultDanglingCount++;
					errors.push(
						`DANGLING STAGE: result_metadata ${row.project_id} references ` +
						`stage ${stageName}=${stageSig}, no matching stage_metadata row`
					);
				}
			}
			const sourceSig = parsed?.sourceStageSignature;
			if (sourceSig && !stageSigSet.has(`${row.project_id}|${sourceSig}`)) {
				resultDanglingCount++;
				errors.push(
					`DANGLING SOURCE STAGE: result_metadata ${row.project_id} references ` +
					`source stage ${sourceSig}, no matching stage_metadata row`
				);
			}
		}
		expect("result_metadata dangling stage refs", 0, resultDanglingCount);
		expect("result_metadata parse failures", 0, resultParseFailures);
		expect("result_metadata rows with empty stageSignatures", 0, emptyStageSignatures);

		// 8) Cross-table build_signature consistency (D + G).
		//    Every (project_id, build_signature) appearing in result_metadata
		//    MUST appear in stage_metadata (a result without backing stages).
		//    Inverse — stage_metadata without result_metadata — is NOT an error
		//    on its own (a worker may have written stage rows then crashed
		//    before the result row, in which case the transaction should have
		//    rolled back; but a partial commit would land here). Reported as a
		//    warning when no expectedResultCount is set, error when it is.
		let resultsWithoutStages = 0;
		for (const key of resultBuildKeys) {
			if (!stageBuildKeys.has(key)) {
				resultsWithoutStages++;
				errors.push(`ATOMICITY: result_metadata ${key} has no matching stage_metadata rows`);
			}
		}
		expect("results without backing stages", 0, resultsWithoutStages);

		let stagesWithoutResults = 0;
		for (const key of stageBuildKeys) {
			if (!resultBuildKeys.has(key)) {
				stagesWithoutResults++;
			}
		}
		// Whether stages-without-result indicates a bug depends on the test:
		// in the harness a successful worker commits both atomically, so any
		// orphaned stage build_signature is suspicious. Flag as warning so the
		// driver can decide based on opts.
		stats.stagesWithoutResults = stagesWithoutResults;
		if (stagesWithoutResults > 0) {
			warnings.push(`${stagesWithoutResults} (project_id, build_signature) pair(s) have ` +
				`stage_metadata rows but no result_metadata row — possible partial commit`);
		}

		// 9) Worker-result vs DB cross-check. The driver knows how many workers
		// exited 0 and which mode was used; from that we predict how many
		// distinct (project_id, build_signature) pairs result_metadata should
		// hold for the application project.
		//
		//   --mutate: each OK worker has a unique buildSignature → expect one
		//             distinct build_signature per OK worker (per top-level project).
		//   --shared: identical signatures → expect 1 if any worker committed,
		//             else 0.
		if (expectedResultCount !== null) {
			// Count distinct build_signatures across the largest project_id —
			// the application project — to ignore framework/library rows whose
			// signatures don't depend on per-worker mutation.
			const sigsByProject = new Map();
			for (const r of resultRows) {
				let set = sigsByProject.get(r.project_id);
				if (!set) {
					set = new Set();
					sigsByProject.set(r.project_id, set);
				}
				set.add(r.build_signature);
			}
			let maxDistinct = 0;
			for (const set of sigsByProject.values()) {
				if (set.size > maxDistinct) maxDistinct = set.size;
			}
			stats.maxDistinctBuildSigsPerProject = maxDistinct;
			const ok = expect(
				`distinct build_signatures (${mode} mode)`,
				expectedResultCount,
				maxDistinct
			);
			if (!ok) {
				errors.push(
					`COMMIT LOSS: expected ${expectedResultCount} distinct build_signature(s) ` +
					`(${mode} mode), found ${maxDistinct}. ` +
					`A worker reported success but its result_metadata is missing.`
				);
			}
		}

		// 10) Per-worker content-presence (check L). Strictly stronger than #9:
		// proves no worker's CONTENT was lost, not just its row count. Driver
		// passes `expectedWorkerMarkers` — the literal strings each worker
		// appended to webapp/test.js. Each marker is unique and would only
		// appear in unminified/sourcemap content; the build pipeline minifies
		// test.js along the way, but the source-stage CAS row, the *-dbg.js
		// CAS row, and the .js.map CAS row all carry the original text. We
		// don't try to predict *which* path key holds the marker — paths
		// rename through the pipeline (e.g. /resources/<id>/test-dbg.js,
		// virtual sourcemap paths). Instead we sweep every CAS row's body
		// for the substring. A surviving marker anywhere means that worker's
		// pre-minify bytes did make it into the cache.
		if (Array.isArray(expectedWorkerMarkers) && expectedWorkerMarkers.length > 0) {
			const missing = [];
			const matchingRows = new Map(); // marker -> integrity count
			for (const marker of expectedWorkerMarkers) {
				let count = 0;
				for (const [, blob] of casBlobs) {
					// Quick byte-level check before string conversion to keep
					// this O(rows × markers × bytes) cheap on large caches.
					if (blob.raw.includes(marker)) count++;
				}
				matchingRows.set(marker, count);
				if (count === 0) missing.push(marker);
			}
			stats.workerMarkersExpected = expectedWorkerMarkers.length;
			stats.workerMarkersMissing = missing.length;
			expect(
				"worker markers present in CAS",
				expectedWorkerMarkers.length,
				expectedWorkerMarkers.length - missing.length
			);
			for (const m of missing) {
				errors.push(`LOST WORKER CONTENT: marker not found in any CAS row: ${JSON.stringify(m)}`);
			}
		}

		// 11) Orphan content rows — warning only. Legitimate when a peer that
		// wrote CAS aborted before its stage_metadata insert, or when later
		// builds dedupe.
		let orphanCount = 0;
		for (const integrity of cas) {
			if (!referencedIntegrities.has(integrity)) {
				orphanCount++;
			}
		}
		if (orphanCount > 0) {
			warnings.push(`${orphanCount} content row(s) not referenced by any stage_metadata`);
		}
		stats.orphanContentCount = orphanCount;
	} finally {
		db.close();
	}

	// 12) WAL drain — re-open writable and checkpoint(TRUNCATE). Returns
	// (busy, log_pages, checkpointed). All three should be 0 once writers
	// are gone; busy=1 means a stuck connection or stale lock file.
	let walOk = false;
	try {
		const rw = new DatabaseSync(dbPath);
		try {
			const [chk] = rw.prepare("PRAGMA wal_checkpoint(TRUNCATE)").all();
			stats.walCheckpoint = chk;
			walOk = chk?.busy === 0 && chk?.log === 0 && chk?.checkpointed === 0;
			if (!walOk) {
				errors.push(`WAL CHECKPOINT not fully drained: ${JSON.stringify(chk)}`);
			}
		} finally {
			rw.close();
		}
	} catch (err) {
		errors.push(`WAL CHECKPOINT failed: ${err.message}`);
	}
	expect("WAL fully drained", true, walOk);

	return {ok: errors.length === 0, errors, warnings, stats, expectations};
}

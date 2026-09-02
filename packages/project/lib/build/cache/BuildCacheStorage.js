import {DatabaseSync} from "node:sqlite";
import {mkdirSync, existsSync} from "node:fs";
import path from "node:path";
import {gzipSync, gunzipSync} from "node:zlib";
import {getLogger} from "@ui5/logger";

const log = getLogger("build:cache:BuildCacheStorage");

const METADATA_COMPRESSION_THRESHOLD = 4096;
const CONTENT_COMPRESSION_THRESHOLD = 128;

/** All live data table names */
const DATA_TABLES = ["content", "index_cache", "stage_metadata", "task_metadata", "result_metadata"];

/**
 * Data tables keyed by project_id. The content table is content-addressed and shared
 * across projects, so it is not part of a project-scoped delete.
 */
const PROJECT_TABLES = ["index_cache", "stage_metadata", "task_metadata", "result_metadata"];

/**
 * Flattens a stage metadata blob's resource metadata into a list of resources.
 *
 * The blob stores resource metadata either as a single object keyed by resource path (plain
 * writer) or as an array of per-reader objects with a `resourceMapping` from path to array index
 * (writer collection). Both forms are reduced to one resource entry per path.
 *
 * @param {object} metadata Deserialized stage metadata blob
 * @returns {Array<{path: string, integrity: string, size: number, lastModified: number}>}
 */
function normalizeStageResources(metadata) {
	const {resourceMetadata, resourceMapping} = metadata ?? {};
	const toEntry = (path, meta) => ({
		path,
		integrity: meta?.integrity ?? null,
		size: meta?.size ?? null,
		lastModified: meta?.lastModified ?? null,
	});
	if (Array.isArray(resourceMetadata)) {
		return Object.entries(resourceMapping ?? {}).map(([path, idx]) =>
			toEntry(path, resourceMetadata[idx]?.[path]));
	}
	return Object.entries(resourceMetadata ?? {}).map(([path, meta]) => toEntry(path, meta));
}

/**
 * Escapes the LIKE wildcards `%` and `_` (and the escape character itself) so a caller-supplied
 * value is matched as a plain string under `LIKE ? ESCAPE '\'`. Stage signatures are hex, but the
 * value reaching {@link BuildCacheStorage#getStageEntriesBySignature} is a user-typed prefix.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeLikePattern(value) {
	return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Unified SQLite-backed storage for the build cache
 *
 * Stores both metadata (index caches, stage metadata, task metadata, result metadata)
 * and content-addressable resource content (gzip-compressed BLOBs) in a single database.
 *
 * @class
 */
export default class BuildCacheStorage {
	#db;
	#stmts;
	#dbPath;
	#inTransaction = false;

	/**
	 * @param {string} dbDir Directory in which to create the cache.db file
	 */
	constructor(dbDir) {
		mkdirSync(dbDir, {recursive: true});
		this.#dbPath = path.join(dbDir, "cache.db");
		log.verbose(`Opening build cache database: ${this.#dbPath}`);

		this.#db = new DatabaseSync(this.#dbPath);
		this.#db.exec("PRAGMA busy_timeout=5000");
		this.#db.exec("PRAGMA page_size=32768");
		this.#db.exec("PRAGMA journal_mode=WAL");
		this.#db.exec("PRAGMA synchronous=NORMAL");
		this.#db.exec("PRAGMA mmap_size=268435456");
		this.#db.exec("PRAGMA cache_size=-65536");

		this.#createTables();
		this.#prepareStatements();
	}

	#createTables() {
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS content (
				integrity TEXT PRIMARY KEY,
				data BLOB NOT NULL
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS index_cache (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				kind TEXT NOT NULL,
				data BLOB NOT NULL,
				PRIMARY KEY (project_id, build_signature, kind)
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS stage_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				stage_id TEXT NOT NULL,
				stage_signature TEXT NOT NULL,
				data BLOB NOT NULL,
				PRIMARY KEY (project_id, build_signature, stage_id, stage_signature)
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS task_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				task_name TEXT NOT NULL,
				type TEXT NOT NULL,
				data BLOB NOT NULL,
				PRIMARY KEY (project_id, build_signature, task_name, type)
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS result_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				stage_signature TEXT NOT NULL,
				data BLOB NOT NULL,
				PRIMARY KEY (project_id, build_signature, stage_signature)
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS _vacuum_pending (
				pending INTEGER NOT NULL DEFAULT 0
			);
			INSERT OR IGNORE INTO _vacuum_pending(rowid, pending) VALUES(1, 0);
		`);
	}

	#prepareStatements() {
		this.#stmts = {
			// Content (CAS)
			hasContent: this.#db.prepare(
				"SELECT 1 FROM content WHERE integrity = ?"
			),
			readContent: this.#db.prepare(
				"SELECT data FROM content WHERE integrity = ?"
			),
			writeContent: this.#db.prepare(
				"INSERT OR IGNORE INTO content (integrity, data) VALUES (?, ?)"
			),

			// Index cache
			readIndexCache: this.#db.prepare(
				"SELECT data FROM index_cache WHERE project_id = ? AND build_signature = ? AND kind = ?"
			),
			writeIndexCache: this.#db.prepare(
				`INSERT OR REPLACE INTO index_cache (project_id, build_signature, kind, data)
				VALUES (?, ?, ?, ?)`
			),

			// Stage metadata
			readStageMetadata: this.#db.prepare(
				`SELECT data FROM stage_metadata
				WHERE project_id = ? AND build_signature = ? AND stage_id = ? AND stage_signature = ?`
			),
			writeStageMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO stage_metadata
				(project_id, build_signature, stage_id, stage_signature, data) VALUES (?, ?, ?, ?, ?)`
			),

			// Task metadata
			readTaskMetadata: this.#db.prepare(
				`SELECT data FROM task_metadata
				WHERE project_id = ? AND build_signature = ? AND task_name = ? AND type = ?`
			),
			writeTaskMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO task_metadata
				(project_id, build_signature, task_name, type, data) VALUES (?, ?, ?, ?, ?)`
			),

			// Result metadata
			readResultMetadata: this.#db.prepare(
				`SELECT data FROM result_metadata
				WHERE project_id = ? AND build_signature = ? AND stage_signature = ?`
			),
			writeResultMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO result_metadata
				(project_id, build_signature, stage_signature, data) VALUES (?, ?, ?, ?)`
			),

			// Project-scoped deletion (one DELETE per project-keyed table)
			deleteProjectRecords: Object.fromEntries(PROJECT_TABLES.map((table) => [
				table, this.#db.prepare(`DELETE FROM ${table} WHERE project_id = ?`)
			])),
		};
	}

	/**
	 * Whether the database connection is open and the database file still exists on disk.
	 *
	 * @returns {boolean}
	 */
	get isValid() {
		return this.#db.isOpen && existsSync(this.#dbPath);
	}

	// ===== Content (CAS) operations =====

	/**
	 * Checks whether content with the given integrity exists in storage
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {boolean} True if content exists
	 */
	hasContent(integrity) {
		return this.#stmts.hasContent.get(integrity) !== undefined;
	}

	/**
	 * Stores resource content in the CAS
	 *
	 * Compresses the buffer with gzip and stores it as a BLOB.
	 * Deduplicates via INSERT OR IGNORE.
	 *
	 * @param {string} integrity SRI integrity string of the uncompressed content
	 * @param {Buffer} buffer Uncompressed resource content
	 */
	putContent(integrity, buffer) {
		const stored = buffer.length > CONTENT_COMPRESSION_THRESHOLD ?
			gzipSync(buffer, {level: 1}) : buffer;
		this.#stmts.writeContent.run(integrity, stored);
	}

	/**
	 * Stores pre-compressed content in the CAS
	 *
	 * Caller is responsible for providing gzip-compressed data.
	 * Deduplicates via INSERT OR IGNORE.
	 *
	 * @param {string} integrity SRI integrity string of the uncompressed content
	 * @param {Buffer} compressedBuffer Gzip-compressed resource content
	 */
	putCompressedContent(integrity, compressedBuffer) {
		this.#stmts.writeContent.run(integrity, compressedBuffer);
	}

	/**
	 * Reads the raw compressed BLOB from the CAS
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {Buffer} Compressed content buffer
	 */
	readContentRaw(integrity) {
		const row = this.#stmts.readContent.get(integrity);
		if (!row) {
			throw new Error(`Content not found in CAS for integrity: ${integrity}`);
		}
		return row.data;
	}

	/**
	 * Reads and decompresses content from the CAS
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {Buffer} Decompressed content buffer
	 */
	readContent(integrity) {
		const raw = this.readContentRaw(integrity);
		if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
			return gunzipSync(raw);
		}
		return Buffer.from(raw);
	}

	// ===== Metadata operations =====

	/**
	 * Serializes metadata to a buffer, compressing with gzip if above threshold
	 *
	 * @param {object} metadata Object to serialize
	 * @returns {Buffer|string} Compressed buffer or JSON string
	 */
	#serializeMetadata(metadata) {
		const json = JSON.stringify(metadata);
		if (json.length > METADATA_COMPRESSION_THRESHOLD) {
			return gzipSync(Buffer.from(json), {level: 1});
		}
		return json;
	}

	/**
	 * Deserializes metadata, detecting and decompressing gzip data
	 *
	 * @param {Buffer|string} data Raw data from database
	 * @returns {object} Parsed metadata object
	 */
	#deserializeMetadata(data) {
		if (data instanceof Uint8Array && data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
			return JSON.parse(gunzipSync(data).toString());
		}
		return JSON.parse(typeof data === "string" ? data : data.toString());
	}

	/**
	 * Reads resource index cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @returns {object|null} Parsed index cache object or null if not found
	 */
	readIndexCache(projectId, buildSignature, kind) {
		try {
			const row = this.#stmts.readIndexCache.get(projectId, buildSignature, kind);
			return row ? this.#deserializeMetadata(row.data) : null;
		} catch (err) {
			throw new Error(
				`Failed to read resource index cache for ` +
				`${projectId} / ${buildSignature}: ${err.message}`,
				{cause: err}
			);
		}
	}

	/**
	 * Writes resource index cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @param {object} index Index object to serialize
	 */
	writeIndexCache(projectId, buildSignature, kind, index) {
		this.#stmts.writeIndexCache.run(projectId, buildSignature, kind, this.#serializeMetadata(index));
	}

	/**
	 * Reads stage metadata from cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier
	 * @param {string} stageSignature Stage signature hash
	 * @returns {object|null} Parsed stage metadata or null if not found
	 */
	readStageCache(projectId, buildSignature, stageId, stageSignature) {
		try {
			const row = this.#stmts.readStageMetadata.get(
				projectId, buildSignature, stageId, stageSignature
			);
			return row ? this.#deserializeMetadata(row.data) : null;
		} catch (err) {
			throw new Error(
				`Failed to read stage metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${stageId} / ${stageSignature}: ${err.message}`,
				{cause: err}
			);
		}
	}

	/**
	 * Writes stage metadata to cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier
	 * @param {string} stageSignature Stage signature hash
	 * @param {object} metadata Stage metadata object to serialize
	 */
	writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata) {
		this.#stmts.writeStageMetadata.run(
			projectId, buildSignature, stageId, stageSignature, this.#serializeMetadata(metadata)
		);
	}

	/**
	 * Reads task metadata from cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @returns {object|null} Parsed task metadata or null if not found
	 */
	readTaskMetadata(projectId, buildSignature, taskName, type) {
		try {
			const row = this.#stmts.readTaskMetadata.get(
				projectId, buildSignature, taskName, type
			);
			return row ? this.#deserializeMetadata(row.data) : null;
		} catch (err) {
			throw new Error(
				`Failed to read task metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${taskName} / ${type}: ${err.message}`,
				{cause: err}
			);
		}
	}

	/**
	 * Writes task metadata to cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @param {object} metadata Task metadata object to serialize
	 */
	writeTaskMetadata(projectId, buildSignature, taskName, type, metadata) {
		this.#stmts.writeTaskMetadata.run(
			projectId, buildSignature, taskName, type, this.#serializeMetadata(metadata)
		);
	}

	/**
	 * Reads result metadata from cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash
	 * @returns {object|null} Parsed result metadata or null if not found
	 */
	readResultMetadata(projectId, buildSignature, stageSignature) {
		try {
			const row = this.#stmts.readResultMetadata.get(
				projectId, buildSignature, stageSignature
			);
			return row ? this.#deserializeMetadata(row.data) : null;
		} catch (err) {
			throw new Error(
				`Failed to read result metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${stageSignature}: ${err.message}`,
				{cause: err}
			);
		}
	}

	/**
	 * Writes result metadata to cache
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash
	 * @param {object} metadata Result metadata object to serialize
	 */
	writeResultMetadata(projectId, buildSignature, stageSignature, metadata) {
		this.#stmts.writeResultMetadata.run(
			projectId, buildSignature, stageSignature, this.#serializeMetadata(metadata)
		);
	}

	// ===== Transactions =====

	/**
	 * Runs the given synchronous callback inside a database transaction.
	 *
	 * The transaction is committed when the callback returns and rolled back if it throws.
	 * Callers do not have to manage BEGIN/COMMIT/ROLLBACK themselves — passing a
	 * callback that performs both metadata and content writes is sufficient.
	 *
	 * Nested calls are not supported and will throw.
	 * Async callbacks (or any callback that returns a thenable) are not supported
	 * and will throw, rolling back the transaction.
	 *
	 * @param {Function} fn Synchronous callback that performs the writes
	 * @returns {*} Whatever the callback returns
	 */
	transaction(fn) {
		if (this.#inTransaction) {
			throw new Error("BuildCacheStorage#transaction: Nested transactions are not supported");
		}
		this.#db.exec("BEGIN");
		this.#inTransaction = true;
		try {
			const result = fn();
			if (result && typeof result.then === "function") {
				throw new Error(
					"BuildCacheStorage#transaction: Async callbacks are not supported. " +
					"The callback must be synchronous."
				);
			}
			this.#db.exec("COMMIT");
			this.#inTransaction = false;
			return result;
		} catch (err) {
			try {
				this.#db.exec("ROLLBACK");
			} finally {
				this.#inTransaction = false;
			}
			throw err;
		}
	}

	// ===== Batch existence checks =====

	/**
	 * Finds which stage signatures exist in the database for a given project/build/stage
	 *
	 * Uses a single SELECT ... IN (...) query to batch-check existence without
	 * reading full data blobs. Returns matching signatures in the order they appear
	 * in the input array (preserving priority).
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier
	 * @param {string[]} signatures Array of stage signatures to check
	 * @returns {string[]} Signatures that exist in the database (in input order)
	 */
	findExistingStageSignatures(projectId, buildSignature, stageId, signatures) {
		if (!signatures.length) {
			return [];
		}
		const placeholders = signatures.map(() => "?").join(",");
		const stmt = this.#db.prepare(
			`SELECT stage_signature FROM stage_metadata
			WHERE project_id = ? AND build_signature = ? AND stage_id = ?
			AND stage_signature IN (${placeholders})`
		);
		const rows = stmt.all(projectId, buildSignature, stageId, ...signatures);
		const existingSet = new Set(rows.map((row) => row.stage_signature));
		return signatures.filter((sig) => existingSet.has(sig));
	}

	/**
	 * Finds which result signatures exist in the database for a given project/build
	 *
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string[]} signatures Array of stage signatures to check
	 * @returns {string[]} Signatures that exist in the database (in input order)
	 */
	findExistingResultSignatures(projectId, buildSignature, signatures) {
		if (!signatures.length) {
			return [];
		}
		const placeholders = signatures.map(() => "?").join(",");
		const stmt = this.#db.prepare(
			`SELECT stage_signature FROM result_metadata
			WHERE project_id = ? AND build_signature = ?
			AND stage_signature IN (${placeholders})`
		);
		const rows = stmt.all(projectId, buildSignature, ...signatures);
		const existingSet = new Set(rows.map((row) => row.stage_signature));
		return signatures.filter((sig) => existingSet.has(sig));
	}

	/**
	 * Finds which content integrities already exist in the CAS
	 *
	 * Uses a single SELECT ... IN (...) query to batch-check existence without
	 * reading full data blobs.
	 *
	 * @param {string[]} integrities Array of integrity hashes to check
	 * @returns {Set<string>} Set of integrities that exist in the database
	 */
	findExistingContentIntegrities(integrities) {
		if (!integrities.length) {
			return new Set();
		}
		const placeholders = integrities.map(() => "?").join(",");
		const stmt = this.#db.prepare(
			`SELECT integrity FROM content WHERE integrity IN (${placeholders})`
		);
		const rows = stmt.all(...integrities);
		return new Set(rows.map((row) => row.integrity));
	}

	/**
	 * Checks if the database has any records in any table.
	 *
	 * @returns {boolean} True if there are any records
	 */
	hasRecords() {
		for (const table of DATA_TABLES) {
			const {is_populated: isPopulated} =
				this.#db.prepare(`SELECT EXISTS(SELECT 1 FROM ${table} LIMIT 1) as is_populated`).get();
			if (isPopulated) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Checks whether any project-keyed table holds records for the given project.
	 *
	 * The content table is content-addressed and shared across projects, so it is not
	 * considered here.
	 *
	 * @param {string} projectId Project identifier
	 * @returns {boolean} True if any project-keyed table has a row for the project
	 */
	hasProjectRecords(projectId) {
		for (const table of PROJECT_TABLES) {
			const {is_populated: isPopulated} = this.#db.prepare(
				`SELECT EXISTS(SELECT 1 FROM ${table} WHERE project_id = ? LIMIT 1) as is_populated`
			).get(projectId);
			if (isPopulated) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Enumerates all cache entries for a single project across the project-keyed tables,
	 * grouped by build signature. Read-only; used by the inspect command to surface what
	 * the cache holds for a project without recomputing the live build signature.
	 *
	 * The index_cache "source" blob is the anchor for a signature: it carries the index
	 * timestamp (age), the recorded task list, and the dependency-set identity. A signature
	 * present only in the stage/result/task tables (partial or legacy) still yields an entry,
	 * with a null indexTimestamp.
	 *
	 * @param {string} projectId Project identifier
	 * @param {object} [options]
	 * @param {boolean} [options.withSizes=false] Also compute the on-disk content size per signature
	 *   (reads stage blobs to collect integrities; deduped within a signature)
	 * @returns {Array<{
	 *   buildSignature: string,
	 *   indexTimestamp: number|null,
	 *   tasks: string[],
	 *   availableDependencies: string|null,
	 *   stageEntries: Array<{stageId: string, stageSignature: string}>,
	 *   resultSignatures: string[],
	 *   taskEntries: Array<{taskName: string, type: string}>,
	 *   sizeBytes?: number,
	 * }>} Per-signature summaries, one per build signature present for the project
	 */
	getProjectCacheEntries(projectId, {withSizes = false} = {}) {
		const bySignature = new Map();
		const forSignature = (buildSignature) => {
			let entry = bySignature.get(buildSignature);
			if (!entry) {
				entry = {
					buildSignature,
					indexTimestamp: null,
					tasks: [],
					availableDependencies: null,
					stageEntries: [],
					resultSignatures: [],
					taskEntries: [],
				};
				if (withSizes) {
					entry.sizeBytes = 0;
					entry.integrities = new Set(); // dropped before returning
				}
				bySignature.set(buildSignature, entry);
			}
			return entry;
		};

		const indexRows = this.#db.prepare(
			"SELECT build_signature, kind, data FROM index_cache WHERE project_id = ?"
		).all(projectId);
		for (const row of indexRows) {
			const entry = forSignature(row.build_signature);
			if (row.kind !== "source") {
				continue;
			}
			const index = this.#deserializeMetadata(row.data);
			entry.indexTimestamp = index.indexTimestamp ?? null;
			entry.availableDependencies = index.availableDependencies ?? null;
			// tasks is an array of [taskName, supportsDifferentialBuilds] pairs
			entry.tasks = (index.tasks ?? []).map((task) => Array.isArray(task) ? task[0] : task);
		}

		// With sizes, the stage data blob is needed to collect resource integrities
		const stageColumns = withSizes ?
			"build_signature, stage_id, stage_signature, data" :
			"build_signature, stage_id, stage_signature";
		const stageRows = this.#db.prepare(
			`SELECT ${stageColumns} FROM stage_metadata WHERE project_id = ?`
		).all(projectId);
		for (const row of stageRows) {
			const entry = forSignature(row.build_signature);
			entry.stageEntries.push({
				stageId: row.stage_id,
				stageSignature: row.stage_signature,
			});
			if (withSizes) {
				for (const {integrity} of normalizeStageResources(this.#deserializeMetadata(row.data))) {
					if (integrity) {
						entry.integrities.add(integrity);
					}
				}
			}
		}

		const resultRows = this.#db.prepare(
			"SELECT build_signature, stage_signature FROM result_metadata WHERE project_id = ?"
		).all(projectId);
		for (const row of resultRows) {
			forSignature(row.build_signature).resultSignatures.push(row.stage_signature);
		}

		const taskRows = this.#db.prepare(
			"SELECT build_signature, task_name, type FROM task_metadata WHERE project_id = ?"
		).all(projectId);
		for (const row of taskRows) {
			forSignature(row.build_signature).taskEntries.push({
				taskName: row.task_name,
				type: row.type,
			});
		}

		const entries = [...bySignature.values()];
		if (withSizes) {
			// Sum on-disk content sizes per signature, deduped within the signature. Blobs shared
			// across signatures are counted once per signature, so a tree total may over-count.
			for (const entry of entries) {
				const sizes = this.getContentSizes([...entry.integrities]);
				let total = 0;
				for (const size of sizes.values()) {
					total += size;
				}
				entry.sizeBytes = total;
				delete entry.integrities;
			}
		}
		return entries;
	}

	/**
	 * Locates every cached stage whose signature starts with the given prefix and returns its stored
	 * resource list. Signatures are shown abbreviated (see the inspect command), so the prefix is
	 * what a user pastes back, like a short git commit hash. A hash prefix is effectively unique, but
	 * the query is not scoped to a project, so more than one row may match: an identical stage shared
	 * across builds or projects yields one row each, all with the same full signature.
	 *
	 * When the prefix matches more than one distinct full signature, it is ambiguous and an error is
	 * thrown listing the candidates rather than returning an arbitrary one.
	 *
	 * The stage blob stores resource metadata either as a single {@link Object} (plain writer) or
	 * as an array of per-reader objects addressed by a `resourceMapping` (writer collection); both
	 * are normalized into a flat resource list here.
	 *
	 * @param {string} stageSignaturePrefix Full stage signature or a leading prefix of one
	 * @returns {Array<{
	 *   projectId: string,
	 *   buildSignature: string,
	 *   stageId: string,
	 *   resources: Array<{path: string, integrity: string, size: number, lastModified: number}>,
	 * }>} One entry per matching stage row
	 * @throws {Error} When the prefix matches more than one distinct stage signature
	 */
	getStageEntriesBySignature(stageSignaturePrefix) {
		const rows = this.#db.prepare(
			`SELECT project_id, build_signature, stage_id, stage_signature, data
			FROM stage_metadata WHERE stage_signature LIKE ? ESCAPE '\\'`
		).all(`${escapeLikePattern(stageSignaturePrefix)}%`);

		const distinct = new Set(rows.map((row) => row.stage_signature));
		if (distinct.size > 1) {
			const candidates = [...distinct].map((sig) => sig.slice(0, 12)).sort().join(", ");
			throw new Error(
				`Stage signature prefix '${stageSignaturePrefix}' is ambiguous: it matches ` +
				`${distinct.size} stage signatures (${candidates}). Provide more characters.`
			);
		}

		return rows.map((row) => {
			const metadata = this.#deserializeMetadata(row.data);
			return {
				projectId: row.project_id,
				buildSignature: row.build_signature,
				stageId: row.stage_id,
				resources: normalizeStageResources(metadata),
			};
		});
	}

	/**
	 * Returns the on-disk byte length of each stored content blob for the given integrities.
	 * The length is the compressed size when the blob is gzip-compressed (content above the
	 * compression threshold) and the raw size otherwise. Missing integrities are absent from the map.
	 *
	 * @param {string[]} integrities SRI integrity strings
	 * @returns {Map<string, number>} Map of integrity to stored byte length
	 */
	getContentSizes(integrities) {
		const sizes = new Map();
		if (!integrities.length) {
			return sizes;
		}
		const placeholders = integrities.map(() => "?").join(",");
		const rows = this.#db.prepare(
			`SELECT integrity, LENGTH(data) AS size FROM content WHERE integrity IN (${placeholders})`
		).all(...integrities);
		for (const row of rows) {
			sizes.set(row.integrity, row.size);
		}
		return sizes;
	}

	/**
	 * Deletes all cache entries for a single project across the project-keyed tables
	 * (index_cache, stage_metadata, task_metadata, result_metadata) in one transaction.
	 *
	 * The content table is left untouched: it is content-addressed and shared across
	 * projects. Orphaned blobs are reused on the next build and reclaimed by a full
	 * {@link dropAllRecords}. No VACUUM is run; freed pages return to the freelist.
	 *
	 * @param {string} projectId Project identifier
	 * @returns {number} Number of deleted rows across all project-keyed tables
	 */
	dropProjectRecords(projectId) {
		this.#db.exec("BEGIN");
		try {
			let deletedEntries = 0;
			for (const table of PROJECT_TABLES) {
				deletedEntries += this.#stmts.deleteProjectRecords[table].run(projectId).changes;
			}
			this.#db.exec("COMMIT");
			return deletedEntries;
		} catch (err) {
			this.#db.exec("ROLLBACK");
			throw err;
		}
	}

	/**
	 * Atomically drops all live tables and recreates fresh empty ones in a single
	 * transaction. The operation completes in milliseconds regardless of data volume —
	 * DROP TABLE never reads row data; it only removes the schema entry and adds
	 * pages to the freelist. Call {@link vacuum} afterwards to reclaim disk space.
	 *
	 * A persistent marker is set so that a deferred VACUUM can be detected on the
	 * next invocation even if the process exits before {@link vacuum} runs.
	 *
	 * @returns {number} Database size in bytes before the drop (pending reclamation after vacuum)
	 */
	dropAllRecords() {
		const bytesBefore = this.getDatabaseSize();

		this.#db.exec("BEGIN");
		try {
			for (const table of DATA_TABLES) {
				this.#db.exec(`DROP TABLE ${table}`);
			}
			this.#createTables();
			this.#db.exec("UPDATE _vacuum_pending SET pending = 1 WHERE rowid = 1");
			this.#db.exec("COMMIT");
		} catch (err) {
			this.#db.exec("ROLLBACK");
			// "no such table" would only occur if a concurrent process dropped the tables
			// between our BEGIN and our first DROP — an edge case that WAL's writer
			// serialization makes nearly impossible, but guard for a clear error message.
			if (/** @type {NodeJS.ErrnoException} */ (err).message?.includes("no such table")) {
				throw new Error(
					"Build cache clean was already performed by another process. " +
					"Run ui5 cache clean again to complete the deferred VACUUM.",
					{cause: err}
				);
			}
			throw err;
		}

		return bytesBefore;
	}

	/**
	 * Returns true if a VACUUM is pending — i.e. {@link dropAllRecords} was called
	 * but {@link vacuum} has not yet run to reclaim the freed disk space.
	 *
	 * @returns {boolean}
	 */
	hasVacuumPending() {
		return this.#db.prepare("SELECT pending FROM _vacuum_pending WHERE rowid = 1").get().pending === 1;
	}

	/**
	 * Runs VACUUM to reclaim disk space from freed pages and clears the pending marker.
	 * This is the slow half of the two-phase cache clean; call it from
	 * <code>cleanAdditional</code> after the fast {@link dropAllRecords} pass.
	 *
	 * @returns {number} Number of bytes freed
	 */
	vacuum() {
		const bytesBefore = this.getDatabaseSize();
		this.#db.exec("VACUUM");
		this.#db.exec("UPDATE _vacuum_pending SET pending = 0 WHERE rowid = 1");
		return bytesBefore - this.getDatabaseSize();
	}

	/**
	 * Closes the database connection
	 */
	close() {
		if (this.#inTransaction) {
			try {
				this.#db.exec("ROLLBACK");
			} finally {
				this.#inTransaction = false;
			}
		}
		this.#db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		this.#db.close();
	}

	/**
	 * Get the total size of the database file
	 *
	 * @returns {number} Database size in bytes
	 */
	getDatabaseSize() {
		const pageCount = this.#db.prepare("PRAGMA page_count").get().page_count;
		const pageSize = this.#db.prepare("PRAGMA page_size").get().page_size;
		return pageCount * pageSize;
	}
}

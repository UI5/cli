import {DatabaseSync} from "node:sqlite";
import {mkdirSync, existsSync} from "node:fs";
import path from "node:path";
import {gzipSync, gunzipSync} from "node:zlib";
import {getLogger} from "@ui5/logger";

const log = getLogger("build:cache:BuildCacheStorage");

const METADATA_COMPRESSION_THRESHOLD = 4096;
const CONTENT_COMPRESSION_THRESHOLD = 128;

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
	#inMetadataBatch = false;
	#inContentBatch = false;

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

	// ===== Batch transactions =====

	/**
	 * Begins a metadata batch transaction (outer transaction)
	 */
	beginMetadataBatch() {
		if (!this.#inMetadataBatch) {
			this.#db.exec("BEGIN");
			this.#inMetadataBatch = true;
		}
	}

	/**
	 * Commits the current metadata batch transaction
	 */
	endMetadataBatch() {
		if (this.#inMetadataBatch) {
			this.#db.exec("COMMIT");
			this.#inMetadataBatch = false;
		}
	}

	/**
	 * Rolls back the current metadata batch transaction
	 */
	rollbackMetadataBatch() {
		if (this.#inMetadataBatch) {
			this.#db.exec("ROLLBACK");
			this.#inMetadataBatch = false;
		}
	}

	/**
	 * Begins a content batch transaction.
	 * Uses SAVEPOINT when nested inside a metadata batch, plain BEGIN otherwise.
	 */
	beginContentBatch() {
		if (this.#inContentBatch) {
			return;
		}
		if (this.#inMetadataBatch) {
			this.#db.exec("SAVEPOINT content_batch");
		} else {
			this.#db.exec("BEGIN");
		}
		this.#inContentBatch = true;
	}

	/**
	 * Commits the current content batch transaction.
	 * Uses RELEASE when nested inside a metadata batch, plain COMMIT otherwise.
	 */
	endContentBatch() {
		if (!this.#inContentBatch) {
			return;
		}
		if (this.#inMetadataBatch) {
			this.#db.exec("RELEASE content_batch");
		} else {
			this.#db.exec("COMMIT");
		}
		this.#inContentBatch = false;
	}

	/**
	 * Rolls back the current content batch transaction.
	 * Uses ROLLBACK TO + RELEASE when nested inside a metadata batch, plain ROLLBACK otherwise.
	 */
	rollbackContentBatch() {
		if (!this.#inContentBatch) {
			return;
		}
		if (this.#inMetadataBatch) {
			this.#db.exec("ROLLBACK TO content_batch");
			this.#db.exec("RELEASE content_batch");
		} else {
			this.#db.exec("ROLLBACK");
		}
		this.#inContentBatch = false;
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
	 * Closes the database connection
	 */
	close() {
		if (this.#inContentBatch) {
			this.rollbackContentBatch();
		}
		if (this.#inMetadataBatch) {
			this.rollbackMetadataBatch();
		}
		this.#db.close();
	}
}

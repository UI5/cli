import {DatabaseSync} from "node:sqlite";
import {mkdirSync, existsSync} from "node:fs";
import path from "node:path";
import {getLogger} from "@ui5/logger";

const log = getLogger("build:cache:MetadataStorage");

/**
 * SQLite-backed metadata storage for the build cache
 *
 * Stores build metadata (index caches, stage metadata, task metadata, result metadata)
 * as JSON blobs in a single SQLite database keyed by composite primary keys.
 *
 * @class
 */
export default class MetadataStorage {
	#db;
	#stmts;
	#dbPath;

	/**
	 * @param {string} dbDir Directory in which to create the metadata.db file
	 */
	constructor(dbDir) {
		mkdirSync(dbDir, {recursive: true});
		this.#dbPath = path.join(dbDir, "metadata.db");
		log.verbose(`Opening metadata database: ${this.#dbPath}`);

		this.#db = new DatabaseSync(this.#dbPath);
		this.#db.exec("PRAGMA journal_mode=WAL");
		this.#db.exec("PRAGMA synchronous=NORMAL");
		this.#db.exec("PRAGMA busy_timeout=5000");

		this.#createTables();
		this.#prepareStatements();
	}

	#createTables() {
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS index_cache (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				kind TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, kind)
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS stage_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				stage_id TEXT NOT NULL,
				stage_signature TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, stage_id, stage_signature)
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS task_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				task_name TEXT NOT NULL,
				type TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, task_name, type)
			) WITHOUT ROWID;

			CREATE TABLE IF NOT EXISTS result_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				stage_signature TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, stage_signature)
			) WITHOUT ROWID;
		`);
	}

	#prepareStatements() {
		this.#stmts = {
			readIndexCache: this.#db.prepare(
				"SELECT data FROM index_cache WHERE project_id = ? AND build_signature = ? AND kind = ?"
			),
			writeIndexCache: this.#db.prepare(
				`INSERT OR REPLACE INTO index_cache (project_id, build_signature, kind, data)
				VALUES (?, ?, ?, ?)`
			),

			readStageMetadata: this.#db.prepare(
				`SELECT data FROM stage_metadata
				WHERE project_id = ? AND build_signature = ? AND stage_id = ? AND stage_signature = ?`
			),
			writeStageMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO stage_metadata
				(project_id, build_signature, stage_id, stage_signature, data) VALUES (?, ?, ?, ?, ?)`
			),

			readTaskMetadata: this.#db.prepare(
				`SELECT data FROM task_metadata
				WHERE project_id = ? AND build_signature = ? AND task_name = ? AND type = ?`
			),
			writeTaskMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO task_metadata
				(project_id, build_signature, task_name, type, data) VALUES (?, ?, ?, ?, ?)`
			),

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
	 * This detects cases where the cache directory was deleted externally
	 * (e.g., by test cleanup) while the connection was still open.
	 *
	 * @returns {boolean}
	 */
	get isValid() {
		return this.#db.isOpen && existsSync(this.#dbPath);
	}

	/**
	 * Closes the database connection
	 */
	close() {
		this.#db.close();
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
			return row ? JSON.parse(row.data) : null;
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
		this.#stmts.writeIndexCache.run(projectId, buildSignature, kind, JSON.stringify(index));
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
			return row ? JSON.parse(row.data) : null;
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
			projectId, buildSignature, stageId, stageSignature, JSON.stringify(metadata)
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
			return row ? JSON.parse(row.data) : null;
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
			projectId, buildSignature, taskName, type, JSON.stringify(metadata)
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
			return row ? JSON.parse(row.data) : null;
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
			projectId, buildSignature, stageSignature, JSON.stringify(metadata)
		);
	}
}

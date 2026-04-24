import {DatabaseSync} from "node:sqlite";
import path from "node:path";
import fs from "graceful-fs";

/**
 * SQLite-based metadata store for build cache.
 *
 * Provides a key-value interface backed by a single SQLite database file.
 * Each metadata category maps to a table with composite TEXT keys and a
 * TEXT value column (JSON).
 *
 * WAL mode is enabled for concurrent read performance.
 */
export default class MetadataStore {
	#db;
	#stmts;

	/**
	 * Open (or create) the SQLite database at the given directory.
	 *
	 * @param {string} cacheDir Absolute path to the versioned cache directory
	 */
	constructor(cacheDir) {
		const dbDir = path.join(cacheDir, "metadata");
		fs.mkdirSync(dbDir, {recursive: true});

		const dbPath = path.join(dbDir, "cache.db");
		this.#db = new DatabaseSync(dbPath);

		// Performance tuning
		this.#db.exec("PRAGMA journal_mode = WAL");
		this.#db.exec("PRAGMA synchronous = NORMAL");

		this.#createTables();
		this.#stmts = this.#prepareStatements();
	}

	#createTables() {
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS build_manifests (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				value TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature)
			);
			CREATE TABLE IF NOT EXISTS index_cache (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				kind TEXT NOT NULL,
				value TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, kind)
			);
			CREATE TABLE IF NOT EXISTS stage_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				stage_id TEXT NOT NULL,
				stage_signature TEXT NOT NULL,
				value TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, stage_id, stage_signature)
			);
			CREATE TABLE IF NOT EXISTS task_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				task_name TEXT NOT NULL,
				type TEXT NOT NULL,
				value TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, task_name, type)
			);
			CREATE TABLE IF NOT EXISTS result_metadata (
				project_id TEXT NOT NULL,
				build_signature TEXT NOT NULL,
				stage_signature TEXT NOT NULL,
				value TEXT NOT NULL,
				PRIMARY KEY (project_id, build_signature, stage_signature)
			);
		`);
	}

	#prepareStatements() {
		return {
			getBuildManifest: this.#db.prepare(
				"SELECT value FROM build_manifests WHERE project_id = ? AND build_signature = ?"
			),
			putBuildManifest: this.#db.prepare(
				`INSERT OR REPLACE INTO build_manifests (project_id, build_signature, value)
				 VALUES (?, ?, ?)`
			),
			getIndexCache: this.#db.prepare(
				"SELECT value FROM index_cache WHERE project_id = ? AND build_signature = ? AND kind = ?"
			),
			putIndexCache: this.#db.prepare(
				`INSERT OR REPLACE INTO index_cache (project_id, build_signature, kind, value)
				 VALUES (?, ?, ?, ?)`
			),
			getStageMetadata: this.#db.prepare(
				`SELECT value FROM stage_metadata
				 WHERE project_id = ? AND build_signature = ? AND stage_id = ? AND stage_signature = ?`
			),
			putStageMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO stage_metadata
				 (project_id, build_signature, stage_id, stage_signature, value)
				 VALUES (?, ?, ?, ?, ?)`
			),
			getTaskMetadata: this.#db.prepare(
				`SELECT value FROM task_metadata
				 WHERE project_id = ? AND build_signature = ? AND task_name = ? AND type = ?`
			),
			putTaskMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO task_metadata
				 (project_id, build_signature, task_name, type, value)
				 VALUES (?, ?, ?, ?, ?)`
			),
			getResultMetadata: this.#db.prepare(
				`SELECT value FROM result_metadata
				 WHERE project_id = ? AND build_signature = ? AND stage_signature = ?`
			),
			putResultMetadata: this.#db.prepare(
				`INSERT OR REPLACE INTO result_metadata
				 (project_id, build_signature, stage_signature, value)
				 VALUES (?, ?, ?, ?)`
			),
		};
	}

	// --- Build Manifests ---

	getBuildManifest(projectId, buildSignature) {
		const row = this.#stmts.getBuildManifest.get(projectId, buildSignature);
		return row ? JSON.parse(row.value) : null;
	}

	putBuildManifest(projectId, buildSignature, data) {
		this.#stmts.putBuildManifest.run(projectId, buildSignature, JSON.stringify(data));
	}

	// --- Index Cache ---

	getIndexCache(projectId, buildSignature, kind) {
		const row = this.#stmts.getIndexCache.get(projectId, buildSignature, kind);
		return row ? JSON.parse(row.value) : null;
	}

	putIndexCache(projectId, buildSignature, kind, data) {
		this.#stmts.putIndexCache.run(projectId, buildSignature, kind, JSON.stringify(data));
	}

	// --- Stage Metadata ---

	getStageMetadata(projectId, buildSignature, stageId, stageSignature) {
		const row = this.#stmts.getStageMetadata.get(projectId, buildSignature, stageId, stageSignature);
		return row ? JSON.parse(row.value) : null;
	}

	putStageMetadata(projectId, buildSignature, stageId, stageSignature, data) {
		this.#stmts.putStageMetadata.run(
			projectId, buildSignature, stageId, stageSignature, JSON.stringify(data)
		);
	}

	// --- Task Metadata ---

	getTaskMetadata(projectId, buildSignature, taskName, type) {
		const row = this.#stmts.getTaskMetadata.get(projectId, buildSignature, taskName, type);
		return row ? JSON.parse(row.value) : null;
	}

	putTaskMetadata(projectId, buildSignature, taskName, type, data) {
		this.#stmts.putTaskMetadata.run(
			projectId, buildSignature, taskName, type, JSON.stringify(data)
		);
	}

	// --- Result Metadata ---

	getResultMetadata(projectId, buildSignature, stageSignature) {
		const row = this.#stmts.getResultMetadata.get(projectId, buildSignature, stageSignature);
		return row ? JSON.parse(row.value) : null;
	}

	putResultMetadata(projectId, buildSignature, stageSignature, data) {
		this.#stmts.putResultMetadata.run(
			projectId, buildSignature, stageSignature, JSON.stringify(data)
		);
	}

	/**
	 * Run a function inside a SQLite transaction.
	 *
	 * @param {Function} fn Callback executed inside BEGIN/COMMIT
	 * @returns {*} Return value of fn
	 */
	transaction(fn) {
		this.#db.exec("BEGIN");
		try {
			const result = fn();
			this.#db.exec("COMMIT");
			return result;
		} catch (err) {
			this.#db.exec("ROLLBACK");
			throw err;
		}
	}

	/**
	 * Close the database connection.
	 */
	close() {
		this.#db.close();
	}
}

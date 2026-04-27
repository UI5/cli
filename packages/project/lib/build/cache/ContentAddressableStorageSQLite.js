import {DatabaseSync} from "node:sqlite";
import {mkdirSync, existsSync} from "node:fs";
import path from "node:path";
import {gzipSync, gunzipSync} from "node:zlib";
import {getLogger} from "@ui5/logger";

const log = getLogger("build:cache:ContentAddressableStorageSQLite");

/**
 * SQLite-backed content-addressable storage for build cache resources
 *
 * Stores gzip-compressed content as BLOBs keyed by the original resource
 * integrity hash. All reads and writes use synchronous DatabaseSync operations.
 *
 * @class
 */
export default class ContentAddressableStorageSQLite {
	#db;
	#stmts;
	#dbPath;
	#inBatch = false;

	/**
	 * @param {string} dbPath Path to the SQLite database file
	 */
	constructor(dbPath) {
		mkdirSync(path.dirname(dbPath), {recursive: true});
		this.#dbPath = dbPath;
		log.verbose(`Opening content database: ${this.#dbPath}`);

		this.#db = new DatabaseSync(this.#dbPath);
		this.#db.exec("PRAGMA journal_mode=WAL");
		this.#db.exec("PRAGMA synchronous=NORMAL");
		this.#db.exec("PRAGMA busy_timeout=5000");
		this.#db.exec("PRAGMA page_size=8192");

		this.#createTable();
		this.#prepareStatements();
	}

	#createTable() {
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS content (
				integrity TEXT PRIMARY KEY,
				data BLOB NOT NULL
			) WITHOUT ROWID;
		`);
	}

	#prepareStatements() {
		this.#stmts = {
			has: this.#db.prepare(
				"SELECT 1 FROM content WHERE integrity = ?"
			),
			read: this.#db.prepare(
				"SELECT data FROM content WHERE integrity = ?"
			),
			write: this.#db.prepare(
				"INSERT OR IGNORE INTO content (integrity, data) VALUES (?, ?)"
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

	/**
	 * Checks whether content with the given integrity exists in storage
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {boolean} True if content exists
	 */
	has(integrity) {
		return this.#stmts.has.get(integrity) !== undefined;
	}

	/**
	 * Stores resource content in the CAS
	 *
	 * Compresses the buffer with gzip and stores it as a BLOB.
	 * Deduplicates: skips write if content with the same integrity already exists
	 * (via INSERT OR IGNORE).
	 *
	 * @param {string} integrity SRI integrity string of the uncompressed content
	 * @param {Buffer} buffer Uncompressed resource content
	 */
	put(integrity, buffer) {
		const compressedBuffer = gzipSync(buffer);
		this.#stmts.write.run(integrity, compressedBuffer);
	}

	/**
	 * Reads the raw compressed BLOB from the CAS
	 *
	 * Useful when the caller needs synchronous access (e.g., for createStream callbacks).
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {Buffer} Compressed content buffer
	 */
	readContentRaw(integrity) {
		const row = this.#stmts.read.get(integrity);
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
		return gunzipSync(this.readContentRaw(integrity));
	}

	/**
	 * Begins a batch transaction for multiple writes
	 */
	beginBatch() {
		if (!this.#inBatch) {
			this.#db.exec("BEGIN");
			this.#inBatch = true;
		}
	}

	/**
	 * Commits the current batch transaction
	 */
	endBatch() {
		if (this.#inBatch) {
			this.#db.exec("COMMIT");
			this.#inBatch = false;
		}
	}

	/**
	 * Rolls back the current batch transaction
	 */
	rollbackBatch() {
		if (this.#inBatch) {
			this.#db.exec("ROLLBACK");
			this.#inBatch = false;
		}
	}

	/**
	 * Closes the database connection
	 */
	close() {
		if (this.#inBatch) {
			this.rollbackBatch();
		}
		this.#db.close();
	}
}

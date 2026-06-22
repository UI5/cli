import path from "node:path";
import {access} from "node:fs/promises";
import {resolveUi5DataDir} from "../../utils/dataDir.js";
import {getLogger} from "@ui5/logger";
import BuildCacheStorage from "./BuildCacheStorage.js";

const log = getLogger("build:cache:CacheManager");

// Singleton instances mapped by cache directory path
const cacheManagerInstances = new Map();

// Cache version for compatibility management
const CACHE_VERSION = "v0_7";

/**
 * Manages persistence for the build cache using a unified SQLite-backed storage
 * for both metadata and content-addressable resource content
 *
 * CacheManager delegates metadata operations (index caches, stage metadata,
 * task metadata, result metadata) and binary resource content (gzip-compressed
 * BLOBs) to BuildCacheStorage (single SQLite database).
 *
 * The cache is organized by:
 * 1. Project ID (package name)
 * 2. Build signature (hash of build configuration)
 * 3. Stage/task identifiers and signatures
 *
 * Key features:
 * - Content-addressable storage with deduplication
 * - Singleton pattern per cache directory
 * - Configurable cache location via UI5_DATA_DIR or configuration
 * - SQLite-backed storage for fast read/write operations
 *
 * @class
 */
export default class CacheManager {
	#storage;
	#refCount = 0;
	#cacheDir;

	/**
	 * Creates a new CacheManager instance
	 *
	 * @private
	 * @param {string} cacheDir Base directory for the cache
	 */
	constructor(cacheDir) {
		this.#cacheDir = cacheDir;
		const versionedDir = path.join(cacheDir, CACHE_VERSION);
		this.#storage = new BuildCacheStorage(versionedDir);
	}

	#isValid() {
		return this.#storage.isValid;
	}

	/**
	 * Factory method to create or retrieve a CacheManager instance
	 *
	 * Returns a singleton CacheManager for the determined cache directory.
	 * The cache directory is resolved in this order:
	 * 1. Explicit <code>ui5DataDir</code> option (resolved relative to cwd)
	 * 2. UI5_DATA_DIR environment variable (resolved relative to cwd)
	 * 3. ui5DataDir from UI5 configuration file
	 * 4. Default: ~/.ui5/
	 *
	 * @public
	 * @param {string} cwd Current working directory for resolving relative paths
	 * @param {object} [options]
	 * @param {string} [options.ui5DataDir] Explicit UI5 data directory. When provided,
	 *   environment variable, configuration file, and home-directory fallbacks are skipped.
	 * @returns {Promise<CacheManager>} Singleton CacheManager instance for the cache directory
	 */
	static async create(cwd, {ui5DataDir} = {}) {
		if (!ui5DataDir) {
			ui5DataDir = await resolveUi5DataDir({cwd});
		} else {
			ui5DataDir = path.resolve(cwd, ui5DataDir);
		}
		const cacheDir = path.join(ui5DataDir, "buildCache");
		log.verbose(`Using build cache directory: ${cacheDir}`);

		if (!cacheManagerInstances.has(cacheDir) || !cacheManagerInstances.get(cacheDir).#isValid()) {
			cacheManagerInstances.set(cacheDir, new CacheManager(cacheDir));
		}
		const instance = cacheManagerInstances.get(cacheDir);
		instance.#refCount++;
		return instance;
	}

	/**
	 * Reads resource index cache from storage
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @returns {object|null} Parsed index cache object or null if not found
	 */
	readIndexCache(projectId, buildSignature, kind) {
		return this.#storage.readIndexCache(projectId, buildSignature, kind);
	}

	/**
	 * Writes resource index cache to storage
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @param {object} index Index object containing resource tree and task metadata
	 */
	writeIndexCache(projectId, buildSignature, kind, index) {
		this.#storage.writeIndexCache(projectId, buildSignature, kind, index);
	}

	/**
	 * Reads stage metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier
	 * @param {string} stageSignature Stage signature hash
	 * @returns {object|null} Parsed stage metadata or null if not found
	 */
	readStageCache(projectId, buildSignature, stageId, stageSignature) {
		return this.#storage.readStageCache(projectId, buildSignature, stageId, stageSignature);
	}

	/**
	 * Writes stage metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier
	 * @param {string} stageSignature Stage signature hash
	 * @param {object} metadata Stage metadata object to serialize
	 */
	writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata) {
		this.#storage.writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata);
	}

	/**
	 * Reads task metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @returns {object|null} Parsed task metadata or null if not found
	 */
	readTaskMetadata(projectId, buildSignature, taskName, type) {
		return this.#storage.readTaskMetadata(projectId, buildSignature, taskName, type);
	}

	/**
	 * Writes task metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @param {object} metadata Task metadata object to serialize
	 */
	writeTaskMetadata(projectId, buildSignature, taskName, type, metadata) {
		this.#storage.writeTaskMetadata(projectId, buildSignature, taskName, type, metadata);
	}

	/**
	 * Reads result metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash
	 * @returns {object|null} Parsed result metadata or null if not found
	 */
	readResultMetadata(projectId, buildSignature, stageSignature) {
		return this.#storage.readResultMetadata(projectId, buildSignature, stageSignature);
	}

	/**
	 * Writes result metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash
	 * @param {object} metadata Result metadata object to serialize
	 */
	writeResultMetadata(projectId, buildSignature, stageSignature, metadata) {
		this.#storage.writeResultMetadata(projectId, buildSignature, stageSignature, metadata);
	}

	/**
	 * Batch-checks which stage signatures exist in the database
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier
	 * @param {string[]} signatures Array of stage signatures to check
	 * @returns {string[]} Signatures that exist in the database (in input order)
	 */
	findExistingStageSignatures(projectId, buildSignature, stageId, signatures) {
		return this.#storage.findExistingStageSignatures(projectId, buildSignature, stageId, signatures);
	}

	/**
	 * Batch-checks which result signatures exist in the database
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string[]} signatures Array of stage signatures to check
	 * @returns {string[]} Signatures that exist in the database (in input order)
	 */
	findExistingResultSignatures(projectId, buildSignature, signatures) {
		return this.#storage.findExistingResultSignatures(projectId, buildSignature, signatures);
	}

	/**
	 * Batch-checks which content integrities exist in the CAS
	 *
	 * @public
	 * @param {string[]} integrities Array of integrity hashes to check
	 * @returns {Set<string>} Set of integrities that exist in the database
	 */
	findExistingContentIntegrities(integrities) {
		return this.#storage.findExistingContentIntegrities(integrities);
	}

	/**
	 * Checks whether content with the given integrity exists in storage
	 *
	 * @public
	 * @param {string} integrity SRI integrity string (e.g., "sha256-...")
	 * @returns {boolean} True if content exists
	 */
	hasContent(integrity) {
		return this.#storage.hasContent(integrity);
	}

	/**
	 * Reads and decompresses content from the CAS
	 *
	 * @public
	 * @param {string} integrity SRI integrity string
	 * @returns {Buffer} Decompressed content buffer
	 */
	readContent(integrity) {
		return this.#storage.readContent(integrity);
	}

	/**
	 * Reads the raw compressed BLOB from the CAS
	 *
	 * @public
	 * @param {string} integrity SRI integrity string
	 * @returns {Buffer} Compressed content buffer
	 */
	readContentRaw(integrity) {
		return this.#storage.readContentRaw(integrity);
	}

	/**
	 * Checks whether content exists for the given integrity hash
	 *
	 * @public
	 * @param {string} integrity Expected integrity hash (e.g., "sha256-...")
	 * @returns {boolean} True if content exists in storage
	 * @throws {Error} If integrity is not provided
	 */
	hasResourceForStage(integrity) {
		if (!integrity) {
			throw new Error("Integrity hash must be provided to read from cache");
		}
		return this.#storage.hasContent(integrity);
	}

	/**
	 * Writes content directly to the CAS with pre-fetched integrity and buffer
	 *
	 * @public
	 * @param {string} integrity SRI integrity string
	 * @param {Buffer} buffer Uncompressed resource content
	 */
	putContent(integrity, buffer) {
		this.#storage.putContent(integrity, buffer);
	}

	/**
	 * Writes pre-compressed content directly to the CAS
	 *
	 * @public
	 * @param {string} integrity SRI integrity string
	 * @param {Buffer} compressedBuffer Gzip-compressed resource content
	 */
	putCompressedContent(integrity, compressedBuffer) {
		this.#storage.putCompressedContent(integrity, compressedBuffer);
	}

	/**
	 * Runs the given synchronous callback inside a database transaction.
	 *
	 * The transaction is committed when the callback returns and rolled back if it throws.
	 * Callers do not need to manage begin/commit/rollback themselves — any combination of
	 * metadata and content writes performed in the callback is committed atomically.
	 *
	 * @public
	 * @param {Function} fn Synchronous callback performing the writes
	 * @returns {*} Whatever the callback returns
	 */
	transaction(fn) {
		return this.#storage.transaction(fn);
	}

	/**
	 * Releases a reference to this CacheManager. The underlying storage is
	 * closed only when the last consumer releases its reference.
	 */
	close() {
		if (--this.#refCount <= 0) {
			this.#storage.close();
			cacheManagerInstances.delete(this.#cacheDir);
		}
	}

	/**
	 * Get build cache info for the current version.
	 *
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<{path: string, size: number}|null>} Build cache info or null
	 */
	static async getCacheInfo(ui5DataDir) {
		const buildCacheDir = path.join(ui5DataDir, "buildCache");
		const dbDir = path.join(buildCacheDir, CACHE_VERSION);

		const dbPath = path.join(dbDir, "cache.db");
		try {
			await access(dbPath);
		} catch {
			return null;
		}

		try {
			const storage = new BuildCacheStorage(dbDir);
			try {
				if (storage.hasRecords()) {
					const size = storage.getDatabaseSize();
					return {
						path: `buildCache/${CACHE_VERSION}`,
						size,
					};
				}
			} finally {
				storage.close();
			}
		} catch {
			// Skip if database can't be opened
		}
		return null;
	}

	/**
	 * Clean build cache by clearing all records from SQLite database for the current version.
	 *
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<{path: string, size: number}|null>} Removal result or null
	 */
	static async cleanCache(ui5DataDir) {
		const buildCacheDir = path.join(ui5DataDir, "buildCache");
		const dbDir = path.join(buildCacheDir, CACHE_VERSION);

		const dbPath = path.join(dbDir, "cache.db");
		try {
			await access(dbPath);
		} catch {
			return null;
		}

		try {
			const storage = new BuildCacheStorage(dbDir);
			try {
				if (storage.hasRecords()) {
					const freedSize = storage.clearAllRecords();
					return {
						path: `buildCache/${CACHE_VERSION}`,
						size: freedSize,
					};
				}
			} finally {
				storage.close();
			}
		} catch {
			// Skip if database can't be cleared
		}
		return null;
	}
}

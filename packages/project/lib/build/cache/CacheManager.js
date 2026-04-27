import path from "node:path";
import os from "node:os";
import Configuration from "../../config/Configuration.js";
import {getLogger} from "@ui5/logger";
import ContentAddressableStorageSQLite from "./ContentAddressableStorageSQLite.js";
import MetadataStorage from "./MetadataStorage.js";

const log = getLogger("build:cache:CacheManager");

// Singleton instances mapped by cache directory path
const cacheManagerInstances = new Map();

// Cache version for compatibility management
const CACHE_VERSION = "v0_5";

/**
 * Manages persistence for the build cache using SQLite-backed metadata storage
 * and a content-addressable storage (CAS) for resource content
 *
 * CacheManager delegates metadata operations (index caches, stage metadata,
 * task metadata, result metadata) to MetadataStorage (SQLite), and binary
 * resource content to ContentAddressableStorage (file-based, gzip-compressed).
 *
 * The cache is organized by:
 * 1. Project ID (package name)
 * 2. Build signature (hash of build configuration)
 * 3. Stage/task identifiers and signatures
 *
 * Key features:
 * - Content-addressable storage with synchronous path resolution
 * - Singleton pattern per cache directory
 * - Configurable cache location via UI5_DATA_DIR or configuration
 * - Efficient resource deduplication through content-addressable storage
 * - SQLite-backed metadata for fast read/write operations
 *
 * @class
 */
export default class CacheManager {
	#cas;
	#metadataStorage;

	/**
	 * Creates a new CacheManager instance
	 *
	 * @private
	 * @param {string} cacheDir Base directory for the cache
	 */
	constructor(cacheDir) {
		const versionedDir = path.join(cacheDir, CACHE_VERSION);
		this.#cas = new ContentAddressableStorageSQLite(path.join(versionedDir, "content.db"));
		this.#metadataStorage = new MetadataStorage(versionedDir);
	}

	#isValid() {
		return this.#metadataStorage.isValid && this.#cas.isValid;
	}

	/**
	 * Factory method to create or retrieve a CacheManager instance
	 *
	 * Returns a singleton CacheManager for the determined cache directory.
	 * The cache directory is resolved in this order:
	 * 1. UI5_DATA_DIR environment variable (resolved relative to cwd)
	 * 2. ui5DataDir from UI5 configuration file
	 * 3. Default: ~/.ui5/
	 *
	 * @public
	 * @param {string} cwd Current working directory for resolving relative paths
	 * @returns {Promise<CacheManager>} Singleton CacheManager instance for the cache directory
	 */
	static async create(cwd) {
		// ENV var should take precedence over the dataDir from the configuration.
		let ui5DataDir = process.env.UI5_DATA_DIR;
		if (!ui5DataDir) {
			const config = await Configuration.fromFile();
			ui5DataDir = config.getUi5DataDir();
		}
		if (ui5DataDir) {
			ui5DataDir = path.resolve(cwd, ui5DataDir);
		} else {
			ui5DataDir = path.join(os.homedir(), ".ui5");
		}
		const cacheDir = path.join(ui5DataDir, "buildCache");
		log.verbose(`Using build cache directory: ${cacheDir}`);

		if (!cacheManagerInstances.has(cacheDir) || !cacheManagerInstances.get(cacheDir).#isValid()) {
			cacheManagerInstances.set(cacheDir, new CacheManager(cacheDir));
		}
		return cacheManagerInstances.get(cacheDir);
	}

	/**
	 * Reads resource index cache from storage
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @returns {Promise<object|null>} Parsed index cache object or null if not found
	 */
	async readIndexCache(projectId, buildSignature, kind) {
		return this.#metadataStorage.readIndexCache(projectId, buildSignature, kind);
	}

	/**
	 * Writes resource index cache to storage
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @param {object} index Index object containing resource tree and task metadata
	 * @returns {Promise<void>}
	 */
	async writeIndexCache(projectId, buildSignature, kind, index) {
		this.#metadataStorage.writeIndexCache(projectId, buildSignature, kind, index);
	}

	/**
	 * Reads stage metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier
	 * @param {string} stageSignature Stage signature hash
	 * @returns {Promise<object|null>} Parsed stage metadata or null if not found
	 */
	async readStageCache(projectId, buildSignature, stageId, stageSignature) {
		return this.#metadataStorage.readStageCache(projectId, buildSignature, stageId, stageSignature);
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
	 * @returns {Promise<void>}
	 */
	async writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata) {
		this.#metadataStorage.writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata);
	}

	/**
	 * Reads task metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @returns {Promise<object|null>} Parsed task metadata or null if not found
	 */
	async readTaskMetadata(projectId, buildSignature, taskName, type) {
		return this.#metadataStorage.readTaskMetadata(projectId, buildSignature, taskName, type);
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
	 * @returns {Promise<void>}
	 */
	async writeTaskMetadata(projectId, buildSignature, taskName, type, metadata) {
		this.#metadataStorage.writeTaskMetadata(projectId, buildSignature, taskName, type, metadata);
	}

	/**
	 * Reads result metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash
	 * @returns {Promise<object|null>} Parsed result metadata or null if not found
	 */
	async readResultMetadata(projectId, buildSignature, stageSignature) {
		return this.#metadataStorage.readResultMetadata(projectId, buildSignature, stageSignature);
	}

	/**
	 * Writes result metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash
	 * @param {object} metadata Result metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeResultMetadata(projectId, buildSignature, stageSignature, metadata) {
		this.#metadataStorage.writeResultMetadata(projectId, buildSignature, stageSignature, metadata);
	}

	/**
	 * Checks whether content with the given integrity exists in storage
	 *
	 * @public
	 * @param {string} integrity SRI integrity string (e.g., "sha256-...")
	 * @returns {boolean} True if content exists
	 */
	hasContent(integrity) {
		return this.#cas.has(integrity);
	}

	/**
	 * Reads and decompresses content from the CAS
	 *
	 * @public
	 * @param {string} integrity SRI integrity string
	 * @returns {Buffer} Decompressed content buffer
	 */
	readContent(integrity) {
		return this.#cas.readContent(integrity);
	}

	/**
	 * Reads the raw compressed BLOB from the CAS
	 *
	 * @public
	 * @param {string} integrity SRI integrity string
	 * @returns {Buffer} Compressed content buffer
	 */
	readContentRaw(integrity) {
		return this.#cas.readContentRaw(integrity);
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
		return this.#cas.has(integrity);
	}

	/**
	 * Writes a resource to the content-addressable storage
	 *
	 * If the resource content (identified by integrity hash) already exists,
	 * the write is skipped (deduplication).
	 *
	 * @public
	 * @param {@ui5/fs/Resource} resource Resource to cache
	 * @returns {Promise<void>}
	 */
	async writeStageResource(resource) {
		const integrity = await resource.getIntegrity();
		const buffer = await resource.getBuffer();
		this.#cas.put(integrity, buffer);
	}

	/**
	 * Writes content directly to the CAS with pre-fetched integrity and buffer
	 *
	 * @public
	 * @param {string} integrity SRI integrity string
	 * @param {Buffer} buffer Uncompressed resource content
	 */
	putContent(integrity, buffer) {
		this.#cas.put(integrity, buffer);
	}

	/**
	 * Begins a batch transaction for multiple content writes
	 */
	beginContentBatch() {
		this.#cas.beginBatch();
	}

	/**
	 * Commits the current content batch transaction
	 */
	endContentBatch() {
		this.#cas.endBatch();
	}

	/**
	 * Rolls back the current content batch transaction
	 */
	rollbackContentBatch() {
		this.#cas.rollbackBatch();
	}

	/**
	 * Closes the metadata storage
	 */
	close() {
		this.#cas.close();
		this.#metadataStorage.close();
	}
}

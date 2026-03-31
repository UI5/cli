import path from "node:path";
import {promisify} from "node:util";
import {gzip} from "node:zlib";
import os from "node:os";
import Configuration from "../../config/Configuration.js";
import MetadataStore from "./MetadataStore.js";
import {getLogger} from "@ui5/logger";
import BuildTimings from "./BuildTimings.js";

const log = getLogger("build:cache:CacheManager");

// Singleton instances mapped by cache directory path
const chacheManagerInstances = new Map();

// Cache version for compatibility management
const CACHE_VERSION = "v0_3_c";

/**
 * Manages persistence for the build cache using file-based storage and a
 * content-addressable storage (CAS) for resource content
 *
 * CacheManager provides a hierarchical file-based cache structure:
 * - cas/ - Content-addressable storage for resource content (gzip-compressed)
 * - buildManifests/ - Build manifest files containing metadata about builds
 * - stageMetadata/ - Stage-level metadata organized by project, build, and stage
 * - index/ - Resource index files for efficient change detection
 *
 * The cache is organized by:
 * 1. Project ID (sanitized package name)
 * 2. Build signature (hash of build configuration)
 * 3. Stage ID (e.g., "result" or "task/taskName")
 * 4. Stage signature (hash of input resources)
 *
 * Key features:
 * - Content-addressable storage with synchronous path resolution
 * - Singleton pattern per cache directory
 * - Configurable cache location via UI5_DATA_DIR or configuration
 * - Efficient resource deduplication through content-addressable storage
 *
 * @class
 */
export default class CacheManager {
	#casDir;
	#store;

	/**
	 * Creates a new CacheManager instance
	 *
	 * Initializes the SQLite metadata store and CAS directory.
	 * This constructor is private - use CacheManager.create() instead.
	 *
	 * @private
	 * @param {string} cacheDir Base directory for the cache
	 */
	constructor(cacheDir) {
		cacheDir = path.join(cacheDir, CACHE_VERSION);
		this.#casDir = path.join(cacheDir, "cas");
		this.#store = new MetadataStore(cacheDir);
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

		if (!chacheManagerInstances.has(cacheDir)) {
			chacheManagerInstances.set(cacheDir, new CacheManager(cacheDir));
		}
		return chacheManagerInstances.get(cacheDir);
	}

	/**
	 * Reads a build manifest from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @returns {Promise<object|null>} Parsed manifest object or null if not found
	 */
	async readBuildManifest(projectId, buildSignature) {
		const t = BuildTimings.start("readBuildManifest");
		try {
			return this.#store.getBuildManifest(projectId, buildSignature);
		} catch (err) {
			throw new Error(`Failed to read build manifest for ` +
				`${projectId} / ${buildSignature}: ${err.message}`, {
				cause: err,
			});
		} finally {
			BuildTimings.end("readBuildManifest", t);
		}
	
	}

	/**
	 * Writes a build manifest to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {object} manifest Build manifest object to serialize
	 * @returns {Promise<void>}
	 */
	async writeBuildManifest(projectId, buildSignature, manifest) {
		const t = BuildTimings.start("writeBuildManifest");
		try {
			this.#store.putBuildManifest(projectId, buildSignature, manifest);
	
		} finally {
			BuildTimings.end("writeBuildManifest", t);
		}
	
	}

	/**
	 * Reads resource index cache from storage
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @returns {Promise<object|null>} Parsed index cache object or null if not found
	 */
	async readIndexCache(projectId, buildSignature, kind) {
		const t = BuildTimings.start("readIndexCache");
		try {
			return this.#store.getIndexCache(projectId, buildSignature, kind);
		} catch (err) {
			throw new Error(`Failed to read resource index cache for ` +
				`${projectId} / ${buildSignature}: ${err.message}`, {
				cause: err,
			});
		} finally {
			BuildTimings.end("readIndexCache", t);
		}
	
	}

	/**
	 * Writes resource index cache to storage
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @param {object} index Index object containing resource tree and task metadata
	 * @returns {Promise<void>}
	 */
	async writeIndexCache(projectId, buildSignature, kind, index) {
		const t = BuildTimings.start("writeIndexCache");
		try {
			this.#store.putIndexCache(projectId, buildSignature, kind, index);
	
		} finally {
			BuildTimings.end("writeIndexCache", t);
		}
	
	}

	/**
	 * Reads stage metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @returns {Promise<object|null>} Parsed stage metadata or null if not found
	 */
	async readStageCache(projectId, buildSignature, stageId, stageSignature) {
		const t = BuildTimings.start("readStageCache");
		try {
			return this.#store.getStageMetadata(projectId, buildSignature, stageId, stageSignature);
		} catch (err) {
			throw new Error(`Failed to read stage metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${stageId} / ${stageSignature}: ${err.message}`, {
				cause: err,
			});
		} finally {
			BuildTimings.end("readStageCache", t);
		}
	
	}

	/**
	 * Writes stage metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @param {object} metadata Stage metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata) {
		const t = BuildTimings.start("writeStageCache");
		try {
			this.#store.putStageMetadata(projectId, buildSignature, stageId, stageSignature, metadata);
	
		} finally {
			BuildTimings.end("writeStageCache", t);
		}
	
	}

	/**
	 * Reads task metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @returns {Promise<object|null>} Parsed task metadata or null if not found
	 */
	async readTaskMetadata(projectId, buildSignature, taskName, type) {
		const t = BuildTimings.start("readTaskMetadata");
		try {
			return this.#store.getTaskMetadata(projectId, buildSignature, taskName, type);
		} catch (err) {
			throw new Error(`Failed to read task metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${taskName} / ${type}: ${err.message}`, {
				cause: err,
			});
		} finally {
			BuildTimings.end("readTaskMetadata", t);
		}
	
	}

	/**
	 * Writes task metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @param {object} metadata Task metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeTaskMetadata(projectId, buildSignature, taskName, type, metadata) {
		const t = BuildTimings.start("writeTaskMetadata");
		try {
			this.#store.putTaskMetadata(projectId, buildSignature, taskName, type, metadata);
	
		} finally {
			BuildTimings.end("writeTaskMetadata", t);
		}
	
	}

	/**
	 * Reads result metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @returns {Promise<object|null>} Parsed result metadata or null if not found
	 */
	async readResultMetadata(projectId, buildSignature, stageSignature) {
		const t = BuildTimings.start("readResultMetadata");
		try {
			return this.#store.getResultMetadata(projectId, buildSignature, stageSignature);
		} catch (err) {
			throw new Error(`Failed to read stage metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${stageSignature}: ${err.message}`, {
				cause: err,
			});
		} finally {
			BuildTimings.end("readResultMetadata", t);
		}
	
	}

	/**
	 * Writes result metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @param {object} metadata Result metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeResultMetadata(projectId, buildSignature, stageSignature, metadata) {
		const t = BuildTimings.start("writeResultMetadata");
		try {
			this.#store.putResultMetadata(projectId, buildSignature, stageSignature, metadata);
	
		} finally {
			BuildTimings.end("writeResultMetadata", t);
		}
	
	}

	/**
	 * Close the metadata store. Should be called when the build is complete.
	 */
	close() {
		this.#store.close();
	}

	/**
	 * Computes the filesystem path for a CAS resource given its integrity hash
	 *
	 * This is synchronous — no I/O is performed.
	 *
	 * @public
	 * @param {string} integrity SRI integrity string (e.g., "sha256-...")
	 * @returns {string} Absolute filesystem path to the cached content file
	 */
	contentPath(integrity) {
		return this.#cas.contentPath(integrity);
	}

	/**
	 * Retrieves the file system path for a cached resource
	 *
	 * Computes the content path from the integrity hash and verifies the file exists.
	 *
	 * @public
	 * @param {string} integrity Expected integrity hash (e.g., "sha256-...")
	 * @returns {Promise<string|null>} Absolute path to the cached resource file, or null if not found
	 * @throws {Error} If integrity is not provided
	 */
	async getResourcePathForStage(buildSignature, stageId, stageSignature, resourcePath, integrity) {
		const t = BuildTimings.start("getResourcePathForStage");
		try {
			if (!integrity) {
				throw new Error("Integrity hash must be provided to read from cache");
			}
			// const cacheKey = this.#createKeyForStage(buildSignature, stageId, stageSignature, resourcePath, integrity);
			const result = await cacache.get.info(this.#casDir, integrity);
			if (!result) {
				return null;
			}
			return result.path;
	
		} finally {
			BuildTimings.end("getResourcePathForStage", t);
		}
	
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
	async writeStageResource(buildSignature, stageId, stageSignature, resource) {
		const t = BuildTimings.start("writeStageResource");
		try {
			// Check if resource has already been written
			const integrity = await resource.getIntegrity();
			const hasResource = await cacache.get.info(this.#casDir, integrity);
			if (!hasResource) {
				const buffer = await resource.getBuffer();
				// Compress the buffer using gzip before caching
				const compressedBuffer = await promisify(gzip)(buffer);
				await cacache.put(
					this.#casDir,
					integrity,
					compressedBuffer,
					CACACHE_OPTIONS
				);
			}
	
		} finally {
			BuildTimings.end("writeStageResource", t);
		}
	
	}
}

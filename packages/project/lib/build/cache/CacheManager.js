import cacache from "cacache";
import path from "node:path";
import fs from "graceful-fs";
import {promisify} from "node:util";
import {gzip} from "node:zlib";
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
import os from "node:os";
import Configuration from "../../config/Configuration.js";
import {getPathFromPackageName} from "../../utils/sanitizeFileName.js";
import {getLogger} from "@ui5/logger";

const log = getLogger("build:cache:CacheManager");

// Singleton instances mapped by cache directory path
const chacheManagerInstances = new Map();

// Options for cacache operations (using SHA-256 for integrity checks)
const CACACHE_OPTIONS = {algorithms: ["sha256"]};

// Cache version for compatibility management
const CACHE_VERSION = "v0_1";

/**
 * Manages persistence for the build cache using file-based storage and cacache
 *
 * CacheManager provides a hierarchical file-based cache structure:
 * - cas/ - Content-addressable storage (cacache) for resource content
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
 * - Content-addressable storage with integrity verification
 * - Singleton pattern per cache directory
 * - Configurable cache location via UI5_DATA_DIR or configuration
 * - Efficient resource deduplication through cacache
 */
export default class CacheManager {
	#casDir;
	#manifestDir;
	#stageMetadataDir;
	#taskMetadataDir;
	#resultMetadataDir;
	#indexDir;

	/**
	 * Creates a new CacheManager instance
	 *
	 * Initializes the directory structure for the cache. This constructor is private -
	 * use CacheManager.create() instead to get a singleton instance.
	 *
	 * @private
	 * @param {string} cacheDir - Base directory for the cache
	 */
	constructor(cacheDir) {
		cacheDir = path.join(cacheDir, CACHE_VERSION);
		this.#casDir = path.join(cacheDir, "cas");
		this.#manifestDir = path.join(cacheDir, "buildManifests");
		this.#stageMetadataDir = path.join(cacheDir, "stageMetadata");
		this.#taskMetadataDir = path.join(cacheDir, "taskMetadata");
		this.#resultMetadataDir = path.join(cacheDir, "resultMetadata");
		this.#indexDir = path.join(cacheDir, "index");
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
	 * @param {string} cwd - Current working directory for resolving relative paths
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
	 * Generates the file path for a build manifest
	 *
	 * @private
	 * @param {string} packageName - Package/project identifier
	 * @param {string} buildSignature - Build signature hash
	 * @returns {string} Absolute path to the build manifest file
	 */
	#getBuildManifestPath(packageName, buildSignature) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this.#manifestDir, pkgDir, `${buildSignature}.json`);
	}

	/**
	 * Reads a build manifest from cache
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @returns {Promise<object|null>} Parsed manifest object or null if not found
	 * @throws {Error} If file read fails for reasons other than file not existing
	 */
	async readBuildManifest(projectId, buildSignature) {
		try {
			const manifest = await readFile(this.#getBuildManifestPath(projectId, buildSignature), "utf8");
			return JSON.parse(manifest);
		} catch (err) {
			if (err.code === "ENOENT") {
				// Cache miss
				return null;
			}
			throw new Error(`Failed to read build manifest for ` +
				`${projectId} / ${buildSignature}: ${err.message}`, {
				cause: err,
			});
		}
	}

	/**
	 * Writes a build manifest to cache
	 *
	 * Creates parent directories if they don't exist. Manifests are stored as
	 * formatted JSON (2-space indentation) for readability.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {object} manifest - Build manifest object to serialize
	 * @returns {Promise<void>}
	 */
	async writeBuildManifest(projectId, buildSignature, manifest) {
		const manifestPath = this.#getBuildManifestPath(projectId, buildSignature);
		await mkdir(path.dirname(manifestPath), {recursive: true});
		await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
	}

	/**
	 * Generates the file path for resource index metadata
	 *
	 * @private
	 * @param {string} packageName - Package/project identifier
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} kind "source" or "result"
	 * @returns {string} Absolute path to the index metadata file
	 */
	#getIndexCachePath(packageName, buildSignature, kind) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this.#indexDir, pkgDir, `${kind}-${buildSignature}.json`);
	}

	/**
	 * Reads resource index cache from storage
	 *
	 * The index cache contains the resource tree structure and task metadata,
	 * enabling efficient change detection and cache validation.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} kind "source" or "result"
	 * @returns {Promise<object|null>} Parsed index cache object or null if not found
	 * @throws {Error} If file read fails for reasons other than file not existing
	 */
	async readIndexCache(projectId, buildSignature, kind) {
		try {
			const metadata = await readFile(this.#getIndexCachePath(projectId, buildSignature, kind), "utf8");
			return JSON.parse(metadata);
		} catch (err) {
			if (err.code === "ENOENT") {
				// Cache miss
				return null;
			}
			throw new Error(`Failed to read resource index cache for ` +
				`${projectId} / ${buildSignature}: ${err.message}`, {
				cause: err,
			});
		}
	}

	/**
	 * Writes resource index cache to storage
	 *
	 * Persists the resource index and associated task metadata for later retrieval.
	 * Creates parent directories if needed.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} kind "source" or "result"
	 * @param {object} index - Index object containing resource tree and task metadata
	 * @returns {Promise<void>}
	 */
	async writeIndexCache(projectId, buildSignature, kind, index) {
		const indexPath = this.#getIndexCachePath(projectId, buildSignature, kind);
		await mkdir(path.dirname(indexPath), {recursive: true});
		await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
	}

	/**
	 * Generates the file path for stage metadata
	 *
	 * @private
	 * @param {string} packageName - Package/project identifier
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageId - Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature - Stage signature hash (based on input resources)
	 * @returns {string} Absolute path to the stage metadata file
	 */
	#getStageMetadataPath(packageName, buildSignature, stageId, stageSignature) {
		const pkgDir = getPathFromPackageName(packageName);
		stageId = stageId.replace("/", "_");
		return path.join(this.#stageMetadataDir, pkgDir, buildSignature, stageId, `${stageSignature}.json`);
	}

	/**
	 * Reads stage metadata from cache
	 *
	 * Stage metadata contains information about resources produced by a build stage,
	 * including resource paths and their metadata.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageId - Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature - Stage signature hash (based on input resources)
	 * @returns {Promise<object|null>} Parsed stage metadata or null if not found
	 * @throws {Error} If file read fails for reasons other than file not existing
	 */
	async readStageCache(projectId, buildSignature, stageId, stageSignature) {
		try {
			const metadata = await readFile(
				this.#getStageMetadataPath(projectId, buildSignature, stageId, stageSignature
				), "utf8");
			return JSON.parse(metadata);
		} catch (err) {
			if (err.code === "ENOENT") {
				// Cache miss
				return null;
			}
			throw new Error(`Failed to read stage metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${stageId} / ${stageSignature}: ${err.message}`, {
				cause: err,
			});
		}
	}

	/**
	 * Writes stage metadata to cache
	 *
	 * Persists metadata about resources produced by a build stage.
	 * Creates parent directories if needed.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageId - Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature - Stage signature hash (based on input resources)
	 * @param {object} metadata - Stage metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata) {
		const metadataPath = this.#getStageMetadataPath(
			projectId, buildSignature, stageId, stageSignature);
		await mkdir(path.dirname(metadataPath), {recursive: true});
		await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
	}

	/**
	 * Generates the file path for stage metadata
	 *
	 * @private
	 * @param {string} packageName - Package/project identifier
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} taskName
	 * @returns {string} Absolute path to the stage metadata file
	 */
	#getTaskMetadataPath(packageName, buildSignature, taskName) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this.#taskMetadataDir, pkgDir, buildSignature, taskName, `metadata.json`);
	}

	/**
	 * Reads stage metadata from cache
	 *
	 * Stage metadata contains information about resources produced by a build stage,
	 * including resource paths and their metadata.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} taskName
	 * @returns {Promise<object|null>} Parsed stage metadata or null if not found
	 * @throws {Error} If file read fails for reasons other than file not existing
	 */
	async readTaskMetadata(projectId, buildSignature, taskName) {
		try {
			const metadata = await readFile(this.#getTaskMetadataPath(projectId, buildSignature, taskName), "utf8");
			return JSON.parse(metadata);
		} catch (err) {
			if (err.code === "ENOENT") {
				// Cache miss
				return null;
			}
			throw new Error(`Failed to read task metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${taskName}: ${err.message}`, {
				cause: err,
			});
		}
	}

	/**
	 * Writes stage metadata to cache
	 *
	 * Persists metadata about resources produced by a build stage.
	 * Creates parent directories if needed.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} taskName
	 * @param {object} metadata - Stage metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeTaskMetadata(projectId, buildSignature, taskName, metadata) {
		const metadataPath = this.#getTaskMetadataPath(projectId, buildSignature, taskName);
		await mkdir(path.dirname(metadataPath), {recursive: true});
		await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
	}

	/**
	 * Generates the file path for result metadata
	 *
	 * @private
	 * @param {string} packageName - Package/project identifier
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageSignature - Stage signature hash (based on input resources)
	 * @returns {string} Absolute path to the stage metadata file
	 */
	#getResultMetadataPath(packageName, buildSignature, stageSignature) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this.#resultMetadataDir, pkgDir, buildSignature, `${stageSignature}.json`);
	}

	/**
	 * Reads result metadata from cache
	 *
	 * Stage metadata contains information about resources produced by a build stage,
	 * including resource paths and their metadata.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageSignature - Stage signature hash (based on input resources)
	 * @returns {Promise<object|null>} Parsed stage metadata or null if not found
	 * @throws {Error} If file read fails for reasons other than file not existing
	 */
	async readResultMetadata(projectId, buildSignature, stageSignature) {
		try {
			const metadata = await readFile(
				this.#getResultMetadataPath(projectId, buildSignature, stageSignature
				), "utf8");
			return JSON.parse(metadata);
		} catch (err) {
			if (err.code === "ENOENT") {
				// Cache miss
				return null;
			}
			throw new Error(`Failed to read stage metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${stageSignature}: ${err.message}`, {
				cause: err,
			});
		}
	}

	/**
	 * Writes result metadata to cache
	 *
	 * Persists metadata about resources produced by a build stage.
	 * Creates parent directories if needed.
	 *
	 * @param {string} projectId - Project identifier (typically package name)
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageSignature - Stage signature hash (based on input resources)
	 * @param {object} metadata - Stage metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeResultMetadata(projectId, buildSignature, stageSignature, metadata) {
		const metadataPath = this.#getResultMetadataPath(
			projectId, buildSignature, stageSignature);
		await mkdir(path.dirname(metadataPath), {recursive: true});
		await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
	}

	/**
	 * Retrieves the file system path for a cached resource
	 *
	 * Looks up a resource in the content-addressable storage using its cache key
	 * and verifies its integrity. If integrity mismatches, attempts to recover by
	 * looking up the content by digest and updating the index.
	 *
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageId - Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature - Stage signature hash
	 * @param {string} resourcePath - Virtual path of the resource
	 * @param {string} integrity - Expected integrity hash (e.g., "sha256-...")
	 * @returns {Promise<string|null>} Absolute path to the cached resource file, or null if not found
	 * @throws {Error} If integrity is not provided
	 */
	async getResourcePathForStage(buildSignature, stageId, stageSignature, resourcePath, integrity) {
		if (!integrity) {
			throw new Error("Integrity hash must be provided to read from cache");
		}
		// const cacheKey = this.#createKeyForStage(buildSignature, stageId, stageSignature, resourcePath, integrity);
		const result = await cacache.get.info(this.#casDir, integrity);
		if (!result) {
			return null;
		}
		return result.path;
	}

	/**
	 * Writes a resource to the cache for a specific stage
	 *
	 * If the resource content (identified by integrity hash) already exists in the
	 * content-addressable storage, only updates the index with a new cache key.
	 * Otherwise, writes the full content to storage.
	 *
	 * This enables efficient deduplication when the same resource content appears
	 * in multiple stages or builds.
	 *
	 * @param {string} buildSignature - Build signature hash
	 * @param {string} stageId - Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature - Stage signature hash
	 * @param {module:@ui5/fs.Resource} resource - Resource to cache
	 * @returns {Promise<void>}
	 */
	async writeStageResource(buildSignature, stageId, stageSignature, resource) {
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
	}
}

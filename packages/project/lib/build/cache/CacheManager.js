import path from "node:path";
import fs from "graceful-fs";
import {promisify} from "node:util";
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
import os from "node:os";
import Configuration from "../../config/Configuration.js";
import {getPathFromPackageName} from "../../utils/sanitizeFileName.js";
import {getLogger} from "@ui5/logger";
import ContentAddressableStorage from "./ContentAddressableStorage.js";

const log = getLogger("build:cache:CacheManager");

// Singleton instances mapped by cache directory path
const chacheManagerInstances = new Map();

// Cache version for compatibility management
const CACHE_VERSION = "v0_3";

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
	#cas;
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
	 * @param {string} cacheDir Base directory for the cache
	 */
	constructor(cacheDir) {
		cacheDir = path.join(cacheDir, CACHE_VERSION);
		this.#cas = new ContentAddressableStorage(path.join(cacheDir, "cas"));
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
	 * Generates the file path for a build manifest
	 *
	 * @param {string} packageName Package/project identifier
	 * @param {string} buildSignature Build signature hash
	 * @returns {string} Absolute path to the build manifest file
	 */
	#getBuildManifestPath(packageName, buildSignature) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this.#manifestDir, pkgDir, `${buildSignature}.json`);
	}

	/**
	 * Reads a build manifest from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
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
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {object} manifest Build manifest object to serialize
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
	 * @param {string} packageName Package/project identifier
	 * @param {string} buildSignature Build signature hash
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
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
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
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} kind "source" or "result"
	 * @param {object} index Index object containing resource tree and task metadata
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
	 * @param {string} packageName Package/project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature Stage signature hash (based on input resources)
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
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature Stage signature hash (based on input resources)
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
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage identifier (e.g., "result" or "task/taskName")
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @param {object} metadata Stage metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeStageCache(projectId, buildSignature, stageId, stageSignature, metadata) {
		const metadataPath = this.#getStageMetadataPath(
			projectId, buildSignature, stageId, stageSignature);
		await mkdir(path.dirname(metadataPath), {recursive: true});
		await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
	}

	/**
	 * Generates the file path for task metadata
	 *
	 * @param {string} packageName Package/project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @returns {string} Absolute path to the task metadata file
	 */
	#getTaskMetadataPath(packageName, buildSignature, taskName, type) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this.#taskMetadataDir, pkgDir, buildSignature, taskName, `${type}.json`);
	}

	/**
	 * Reads task metadata from cache
	 *
	 * Task metadata contains resource request graphs and indices for tracking
	 * which resources a task accessed during execution.
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} taskName Task name
	 * @param {string} type "project" or "dependency"
	 * @returns {Promise<object|null>} Parsed task metadata or null if not found
	 * @throws {Error} If file read fails for reasons other than file not existing
	 */
	async readTaskMetadata(projectId, buildSignature, taskName, type) {
		try {
			const metadata = await readFile(
				this.#getTaskMetadataPath(projectId, buildSignature, taskName, type), "utf8");
			return JSON.parse(metadata);
		} catch (err) {
			if (err.code === "ENOENT") {
				// Cache miss
				return null;
			}
			throw new Error(`Failed to read task metadata from cache for ` +
				`${projectId} / ${buildSignature} / ${taskName} / ${type}: ${err.message}`, {
				cause: err,
			});
		}
	}

	/**
	 * Writes task metadata to cache
	 *
	 * Persists task-specific metadata including resource request graphs and indices.
	 * Creates parent directories if needed.
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
		const metadataPath = this.#getTaskMetadataPath(projectId, buildSignature, taskName, type);
		await mkdir(path.dirname(metadataPath), {recursive: true});
		await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
	}

	/**
	 * Generates the file path for result metadata
	 *
	 * @param {string} packageName Package/project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @returns {string} Absolute path to the result metadata file
	 */
	#getResultMetadataPath(packageName, buildSignature, stageSignature) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this.#resultMetadataDir, pkgDir, buildSignature, `${stageSignature}.json`);
	}

	/**
	 * Reads result metadata from cache
	 *
	 * Result metadata contains information about the final build output, including
	 * references to all stage signatures that comprise the result.
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @returns {Promise<object|null>} Parsed result metadata or null if not found
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
	 * Persists metadata about the final build result, including stage signature mappings.
	 * Creates parent directories if needed.
	 *
	 * @public
	 * @param {string} projectId Project identifier (typically package name)
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageSignature Stage signature hash (based on input resources)
	 * @param {object} metadata Result metadata object to serialize
	 * @returns {Promise<void>}
	 */
	async writeResultMetadata(projectId, buildSignature, stageSignature, metadata) {
		const metadataPath = this.#getResultMetadataPath(
			projectId, buildSignature, stageSignature);
		await mkdir(path.dirname(metadataPath), {recursive: true});
		await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
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
	async getResourcePathForStage(integrity) {
		if (!integrity) {
			throw new Error("Integrity hash must be provided to read from cache");
		}
		if (await this.#cas.has(integrity)) {
			return this.#cas.contentPath(integrity);
		}
		return null;
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
		await this.#cas.put(integrity, buffer);
	}
}

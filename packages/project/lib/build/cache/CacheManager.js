import path from "node:path";
import os from "node:os";
import Configuration from "../../config/Configuration.js";
import {access, readdir, stat} from "node:fs/promises";
import {classifyVersionDirs} from "./cacheVersions.js";
import {markForRemoval, removePendingDir, scanPendingRemovals} from "../../utils/interruptibleRemoval.js";
import {getLogger} from "@ui5/logger";
import BuildCacheStorage from "./BuildCacheStorage.js";

const log = getLogger("build:cache:CacheManager");

// Singleton instances mapped by cache directory path
const cacheManagerInstances = new Map();

// Cache version — bump when the on-disk DB structure changes (new table/column).
// CPOUI5FOUNDATION-1394 .On each bump: add the old version to KNOWN_DELETABLE_VERSIONS
//   below. For the first post-v5 structural bump, a real DB migration must also be provided
//   instead of the current plain rm-rf approach.
export const CACHE_VERSION = "v0_10";

// Explicit allowlist of older build-cache versions known to have shipped on main.
// Derived from git log of the CACHE_VERSION line in this file on the main branch:
//   v0_7 (2026-05-29) → v0_9 (2026-10-07) → v0_10 (2026-10-12, current)
// v0_8 and v0_0–v0_6 only existed on feature branches and were never released.
// When bumping CACHE_VERSION, add the outgoing version to this array.
export const KNOWN_DELETABLE_VERSIONS = ["v0_7", "v0_9"];

// Prefix for temporary rename-then-delete dirs created during cleanOlderVersions.
// Rooted at buildCache/ so it never collides with the framework cache prefix.
const BUILD_PENDING_PREFIX = "_buildcache_to_delete_";

/**
 * Manages persistence for the build cache using a unified SQLite-backed storage
 * for both metadata and content-addressable resource content
 *
 * CacheManager delegates metadata operations (index caches, stage metadata,
 * stage request metadata, result metadata) and binary resource content (gzip-compressed
 * BLOBs) to BuildCacheStorage (single SQLite database).
 *
 * The cache is organized by:
 * 1. Project ID (package name)
 * 2. Build signature (hash of build configuration)
 * 3. Stage identifiers and signatures
 *
 * Key features:
 * - Content-addressable storage with deduplication
 * - Singleton pattern per cache directory
 * - Configurable cache location via UI5_DATA_DIR or configuration
 * - SQLite-backed storage for fast read/write operations
 *
 * @ignore Do not expose this class in the public API documentation.
 * It is only used internally by the CLI.
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
			// ENV var should take precedence over the dataDir from the configuration.
			ui5DataDir = process.env.UI5_DATA_DIR;
			if (!ui5DataDir) {
				const config = await Configuration.fromFile();
				ui5DataDir = config.getUi5DataDir();
			}
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
	 * @param {object} index Index object containing resource tree and stage list
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
	 * Reads stage request metadata from cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage id
	 * @param {string} type "project" or "dependency"
	 * @returns {object|null} Parsed stage metadata or null if not found
	 */
	readStageRequestMetadata(projectId, buildSignature, stageId, type) {
		return this.#storage.readStageRequestMetadata(projectId, buildSignature, stageId, type);
	}

	/**
	 * Writes stage request metadata to cache
	 *
	 * @public
	 * @param {string} projectId Project identifier
	 * @param {string} buildSignature Build signature hash
	 * @param {string} stageId Stage id
	 * @param {string} type "project" or "dependency"
	 * @param {object} metadata Stage metadata object to serialize
	 */
	writeStageRequestMetadata(projectId, buildSignature, stageId, type, metadata) {
		this.#storage.writeStageRequestMetadata(projectId, buildSignature, stageId, type, metadata);
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
	 * Checks if the cache database exists and is accessible for the given directory.
	 *
	 * @param {string} dbDir Path to DB
	 * @returns {Promise<boolean>} True if the cache database exists and is accessible
	 */
	static async #isCacheDbAvailable(dbDir) {
		const dbPath = path.join(dbDir, "cache.db");
		try {
			await access(dbPath);
		} catch {
			return false;
		}
		return true;
	}

	/**
	 * Opens a BuildCacheStorage for the versioned build cache directory.
	 *
	 * @param {string} ui5DataDir
	 * @param {*} defaultValue Value to return when the database is not available
	 * @param {Function} fn Operation to run against the open storage
	 * @returns {Promise<*>}
	 */
	static async #withStorage(ui5DataDir, defaultValue, fn) {
		const dbDir = path.join(ui5DataDir, "buildCache", CACHE_VERSION);
		if (!await CacheManager.#isCacheDbAvailable(dbDir)) {
			return defaultValue;
		}
		const storage = new BuildCacheStorage(dbDir);
		try {
			return fn(storage);
		} finally {
			storage.close();
		}
	}

	/**
	 * Get build cache info for the current version.
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<{path: string, size: number}|null>} Build cache info or null
	 */
	static getCacheInfo(ui5DataDir) {
		return CacheManager.#withStorage(ui5DataDir, null, (storage) => {
			if (!storage.hasRecords()) {
				return null;
			}
			return {path: `buildCache/${CACHE_VERSION}`, size: storage.getDatabaseSize()};
		});
	}

	/**
	 * Clean build cache by atomically dropping all live tables and recreating fresh
	 * empty ones. The drop is O(1) and completes in milliseconds.
	 * Actual disk reclamation (VACUUM) is deferred to {@link cleanAdditional}.
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<{path: string, size: number}|null>} Removal result (size = bytes pending reclamation) or null
	 */
	static cleanCache(ui5DataDir) {
		return CacheManager.#withStorage(ui5DataDir, null, (storage) => {
			if (!storage.hasRecords()) {
				return null;
			}
			return {path: `buildCache/${CACHE_VERSION}`, size: storage.dropAllRecords()};
		});
	}

	/**
	 * Runs VACUUM to reclaim disk space from a previous {@link cleanCache} call.
	 * Only runs if the database has freelist pages (i.e. cleanup was deferred).
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<Array<{path: string, size: number}>>} Cleaned entries, or empty array if nothing to reclaim
	 */
	static cleanAdditional(ui5DataDir) {
		return CacheManager.#withStorage(ui5DataDir, [], (storage) => {
			if (!storage.hasVacuumPending()) {
				return [];
			}
			return [{path: `buildCache/${CACHE_VERSION}`, size: storage.vacuum()}];
		});
	}

	/**
	 * Returns info about pending disk reclamation — i.e. a previous {@link cleanCache}
	 * whose VACUUM has not yet been run by {@link cleanAdditional}.
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<Array<{path: string, size: number}>>} Pending entries, or empty array if none
	 */
	static getAdditionalCacheInfo(ui5DataDir) {
		return CacheManager.#withStorage(ui5DataDir, [], (storage) => {
			if (!storage.hasVacuumPending()) {
				return [];
			}
			return [{path: `buildCache/${CACHE_VERSION}`, size: storage.getDatabaseSize()}];
		});
	}

	/**
	 * Scans the build-cache directory for pending-removal remnants
	 * (<code>_buildcache_to_delete_*</code>) left behind by a previously interrupted clean —
	 * i.e. a directory that was renamed by {@link markOlderVersionsForRemoval} but whose
	 * recursive delete never completed.
	 *
	 * These remnants have no recoverable version identity (only a hex suffix). They are reported
	 * so the CLI can surface them (under its "Stale Cache" group) and so they count towards the
	 * "is there anything to clean?" decision — without this, a data dir containing only remnants
	 * would be reported as "Nothing to clean" and the remnants would never be removed.
	 *
	 * Size is an O(1) inode stat on <code>cache.db</code>; no file contents are read.
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<Array<{path: string, size: number}>>} One entry per remnant directory
	 */
	static async getPendingRemovalsInfo(ui5DataDir) {
		const buildCacheDir = path.join(ui5DataDir, "buildCache");
		const pendingDirs = await scanPendingRemovals(buildCacheDir, BUILD_PENDING_PREFIX);
		return Promise.all(pendingDirs.map(async (pendingDir) => {
			let size = 0;
			try {
				size = (await stat(path.join(pendingDir, "cache.db"))).size;
			} catch {/* no cache.db — size stays 0 */}
			return {path: `buildCache/${path.basename(pendingDir)}`, size};
		}));
	}

	/**
	 * Enumerates sibling build-cache version directories and partitions them using the
	 * {@link KNOWN_DELETABLE_VERSIONS} allowlist into:
	 * - `removable`: dirs listed in the allowlist (safe to delete)
	 * - `unknown`: dirs that match the version regex but are not in the allowlist and not current
	 *   (e.g. an unshipped feature-branch version or a future newer CLI) — warned about, never deleted
	 *
	 * Older directories are treated as opaque filesystem entries; they are never opened
	 * via BuildCacheStorage (incompatible schema). Size is an O(1) inode stat on
	 * <code>cache.db</code> — no file contents are read.
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<{removable: Array<{name: string, path: string, size: number}>,
	 * 		unknown: Array<{path: string, version: string}>}>}
	 *   Both arrays are unordered (order depends on stat resolution timing).
	 */
	static async getOlderVersionsInfo(ui5DataDir) {
		const buildCacheDir = path.join(ui5DataDir, "buildCache");
		let entries;
		try {
			entries = await readdir(buildCacheDir, {withFileTypes: true});
		} catch {
			return {removable: [], unknown: []};
		}

		const names = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);

		const {deletable, unknown: unknownNames} = classifyVersionDirs(names, {
			known: KNOWN_DELETABLE_VERSIONS,
			current: CACHE_VERSION,
		});

		const removable = await Promise.all(deletable.map(async (name) => {
			let size = 0;
			try {
				size = (await stat(path.join(buildCacheDir, name, "cache.db"))).size;
			} catch {/* no cache.db — size stays 0 */}
			return {name, path: `buildCache/${name}`, size};
		}));

		const unknown = unknownNames.map((name) => ({path: `buildCache/${name}`, version: name}));

		return {removable, unknown};
	}

	/**
	 * Marks all allowlisted older build-cache version directories (those in
	 * {@link KNOWN_DELETABLE_VERSIONS}) for removal by renaming each to
	 * <code>_buildcache_to_delete_&lt;hex&gt;</code> in a single synchronous burst.
	 *
	 * Renaming is the fast, atomic half of the interruptible-removal contract: via
	 * {@link markForRemoval} each directory vanishes from the namespace in one syscall with no
	 * event-loop yield in between. An interrupt after this call therefore leaves every directory
	 * resumable by {@link removePendingVersions} rather than stranded under its live version name,
	 * and shrinks the window in which a concurrently-running older CLI could still write into it
	 * (its open file descriptors stay valid under POSIX unlink semantics).
	 *
	 * Call this BEFORE {@link cleanCache} opens and drops the current-version database, so the
	 * marking is not delayed behind that synchronous work. The slow recursive delete is deferred
	 * to {@link removePendingVersions}.
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @param {Array<{name: string, path: string, size: number}>} [knownRemovable] Pre-computed
	 *   removable list from {@link getOlderVersionsInfo}. When provided the directory scan is
	 *   skipped (avoids TOCTOU and redundant I/O). When omitted the scan runs internally.
	 * @returns {Promise<Array<{name: string, path: string, size: number, pendingPath: string}>>} Entries
	 *   marked for removal, captured before renaming (the version name is unrecoverable afterwards).
	 *   <code>pendingPath</code> is the absolute path the directory was renamed to, so the caller can
	 *   distinguish this run's marks from pre-existing remnants when reporting removals.
	 */
	static async markOlderVersionsForRemoval(ui5DataDir, knownRemovable) {
		const buildCacheDir = path.join(ui5DataDir, "buildCache");
		const removable = knownRemovable ?? (await CacheManager.getOlderVersionsInfo(ui5DataDir)).removable;
		const marked = [];
		for (const entry of removable) {
			const dirPath = path.join(buildCacheDir, entry.name);
			try {
				const pendingPath = markForRemoval(dirPath, BUILD_PENDING_PREFIX);
				if (pendingPath) {
					marked.push({...entry, pendingPath});
				}
			} catch {/* swallow per-dir errors */}
		}
		return marked;
	}

	/**
	 * Deletes every pending build-cache removal directory (<code>_buildcache_to_delete_*</code>),
	 * finishing the removal started by {@link markOlderVersionsForRemoval} and resuming any
	 * remnants left behind by a previously interrupted run. This is the slow, deferred half of
	 * the interruptible-removal contract.
	 *
	 * One stuck directory does not prevent the others from being removed. The caller is
	 * responsible for warning about entries where <code>removed</code> is false.
	 *
	 * @public
	 * @static
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @param {string[]} [thisRunPaths] Absolute pending paths that were marked in this run.
	 *   Used to set <code>fromThisRun: true</code> on the corresponding outcomes so the caller
	 *   can distinguish them from pre-existing stale remnants. Directories are deleted regardless.
	 * @returns {Promise<Array<{path: string, size: number, removed: boolean, pendingPath: string,
	 *   fromThisRun: boolean}>>} Outcome for every pending directory found.
	 *   <code>removed</code> is <code>true</code> only when the recursive delete succeeded.
	 *   <code>fromThisRun</code> is <code>true</code> for paths listed in <code>thisRunPaths</code>.
	 */
	static async removePendingVersions(ui5DataDir, thisRunPaths = []) {
		const buildCacheDir = path.join(ui5DataDir, "buildCache");
		const thisRun = new Set(thisRunPaths);
		const pendingDirs = await scanPendingRemovals(buildCacheDir, BUILD_PENDING_PREFIX);
		const outcomes = [];
		for (const pendingDir of pendingDirs) {
			// Measure size before deletion so it is available regardless of outcome.
			let size = 0;
			try {
				size = (await stat(path.join(pendingDir, "cache.db"))).size;
			} catch {/* no cache.db — size stays 0 */}
			let removed = false;
			try {
				await removePendingDir(pendingDir);
				removed = true;
			} catch {/* one stuck dir must not block the rest */}
			outcomes.push({
				path: `buildCache/${path.basename(pendingDir)}`,
				size,
				removed,
				pendingPath: pendingDir,
				fromThisRun: thisRun.has(pendingDir),
			});
		}
		return outcomes;
	}
}

import {createResource, createProxy} from "@ui5/fs/resourceFactory";
import {getLogger} from "@ui5/logger";
import fs from "graceful-fs";
import {promisify} from "node:util";
const readFile = promisify(fs.readFile);
import BuildTaskCache from "./BuildTaskCache.js";
import {createResourceIndex} from "./utils.js";
const log = getLogger("build:cache:ProjectBuildCache");

export default class ProjectBuildCache {
	#taskCache = new Map();
	#project;
	#buildSignature;
	#cacheManager;

	#invalidatedTasks = new Map();
	#updatedResources = new Set();

	/**
	 * Creates a new ProjectBuildCache instance
	 *
	 * @param {object} project Project instance
	 * @param {string} buildSignature Build signature for the current build
	 * @param {CacheManager} cacheManager Cache manager instance
	 *
	 * @private - Use ProjectBuildCache.create() instead
	 */
	constructor(project, buildSignature, cacheManager) {
		this.#project = project;
		this.#buildSignature = buildSignature;
		this.#cacheManager = cacheManager;
	}

	static async create(project, buildSignature, cacheManager) {
		const cache = new ProjectBuildCache(project, buildSignature, cacheManager);
		await cache.#attemptLoadFromDisk();
		return cache;
	}

	// ===== TASK MANAGEMENT =====

	/**
	 * Records the result of a task execution and updates the cache
	 *
	 * This method:
	 * 1. Stores metadata about resources read/written by the task
	 * 2. Detects which resources have actually changed
	 * 3. Invalidates downstream tasks if necessary
	 *
	 * @param {string} taskName Name of the executed task
	 * @param {Set|undefined} expectedOutput Expected output resource paths
	 * @param {object} workspaceTracker Tracker that monitored workspace reads
	 * @param {object} [dependencyTracker] Tracker that monitored dependency reads
	 * @returns {Promise<void>}
	 */
	async recordTaskResult(taskName, expectedOutput, workspaceTracker, dependencyTracker) {
		const projectTrackingResults = workspaceTracker.getResults();
		const dependencyTrackingResults = dependencyTracker?.getResults();

		const resourcesRead = projectTrackingResults.resourcesRead;
		if (dependencyTrackingResults) {
			for (const [resourcePath, resource] of Object.entries(dependencyTrackingResults.resourcesRead)) {
				resourcesRead[resourcePath] = resource;
			}
		}
		const resourcesWritten = projectTrackingResults.resourcesWritten;

		if (!this.#taskCache.has(taskName)) {
			// Initialize task cache
			this.#taskCache.set(taskName, new BuildTaskCache(this.#project.getName(), taskName));
			// throw new Error(`Cannot record results for unknown task ${taskName} ` +
			// 	`in project ${this.#project.getName()}`);
		}
		log.verbose(`Updating build cache with results of task ${taskName} in project ${this.#project.getName()}`);
		const taskCache = this.#taskCache.get(taskName);

		const writtenResourcePaths = Object.keys(resourcesWritten);
		if (writtenResourcePaths.length) {
			log.verbose(`Task ${taskName} produced ${writtenResourcePaths.length} resources`);

			const changedPaths = new Set((await Promise.all(writtenResourcePaths
				.map(async (resourcePath) => {
					// Check whether resource content actually changed
					if (await taskCache.hasResourceInWriteCache(resourcesWritten[resourcePath])) {
						return undefined;
					}
					return resourcePath;
				}))).filter((resourcePath) => resourcePath !== undefined));

			if (!changedPaths.size) {
				log.verbose(
					`Resources produced by task ${taskName} match with cache from previous executions. ` +
					`This task will not invalidate any other tasks`);
				return;
			}
			log.verbose(
				`Task ${taskName} produced ${changedPaths.size} resources that might invalidate other tasks`);
			for (const resourcePath of changedPaths) {
				this.#updatedResources.add(resourcePath);
			}
			// Check whether other tasks need to be invalidated
			const allTasks = Array.from(this.#taskCache.keys());
			const taskIdx = allTasks.indexOf(taskName);
			const emptySet = new Set();
			for (let i = taskIdx + 1; i < allTasks.length; i++) {
				const nextTaskName = allTasks[i];
				if (!this.#taskCache.get(nextTaskName).matchesChangedResources(changedPaths, emptySet)) {
					continue;
				}
				if (this.#invalidatedTasks.has(taskName)) {
					const {changedDependencyResourcePaths} =
						this.#invalidatedTasks.get(taskName);
					for (const resourcePath of changedPaths) {
						changedDependencyResourcePaths.add(resourcePath);
					}
				} else {
					this.#invalidatedTasks.set(taskName, {
						changedProjectResourcePaths: changedPaths,
						changedDependencyResourcePaths: emptySet
					});
				}
			}
		}
		taskCache.updateMetadata(
			projectTrackingResults.requests,
			dependencyTrackingResults?.requests,
			resourcesRead,
			resourcesWritten
		);

		if (this.#invalidatedTasks.has(taskName)) {
			this.#invalidatedTasks.delete(taskName);
		}
	}

	/**
	 * Returns the task cache for a specific task
	 *
	 * @param {string} taskName - Name of the task
	 * @returns {BuildTaskCache|undefined} The task cache or undefined if not found
	 */
	getTaskCache(taskName) {
		return this.#taskCache.get(taskName);
	}

	// ===== INVALIDATION =====

	/**
	 * Collects all modified resource paths and clears the internal tracking set
	 *
	 * Note: This method has side effects - it clears the internal modified resources set.
	 * Call this only when you're ready to consume and process all accumulated changes.
	 *
	 * @returns {Set<string>} Set of resource paths that have been modified
	 */
	collectAndClearModifiedPaths() {
		const updatedResources = new Set(this.#updatedResources);
		this.#updatedResources.clear();
		return updatedResources;
	}

	resourceChanged(projectResourcePaths, dependencyResourcePaths) {
		let taskInvalidated = false;
		for (const [taskName, taskCache] of this.#taskCache) {
			if (!taskCache.matchesChangedResources(projectResourcePaths, dependencyResourcePaths)) {
				continue;
			}
			taskInvalidated = true;
			if (this.#invalidatedTasks.has(taskName)) {
				const {changedProjectResourcePaths, changedDependencyResourcePaths} =
					this.#invalidatedTasks.get(taskName);
				for (const resourcePath of projectResourcePaths) {
					changedProjectResourcePaths.add(resourcePath);
				}
				for (const resourcePath of dependencyResourcePaths) {
					changedDependencyResourcePaths.add(resourcePath);
				}
			} else {
				this.#invalidatedTasks.set(taskName, {
					changedProjectResourcePaths: new Set(projectResourcePaths),
					changedDependencyResourcePaths: new Set(dependencyResourcePaths)
				});
			}
		}
		return taskInvalidated;
	}

	/**
	 * Validates whether supposedly changed resources have actually changed
	 *
	 * Performs fine-grained validation by comparing resource content (hash/mtime)
	 * and removes false positives from the invalidation set.
	 *
	 * @param {string} taskName - Name of the task to validate
	 * @param {object} workspace - Workspace reader
	 * @param {object} dependencies - Dependencies reader
	 * @returns {Promise<void>}
	 * @throws {Error} If task cache not found for the given taskName
	 */
	async validateChangedResources(taskName, workspace, dependencies) {
		// Check whether the supposedly changed resources for the task have actually changed
		if (!this.#invalidatedTasks.has(taskName)) {
			return;
		}
		const {changedProjectResourcePaths, changedDependencyResourcePaths} = this.#invalidatedTasks.get(taskName);
		await this._validateChangedResources(taskName, workspace, changedProjectResourcePaths);
		await this._validateChangedResources(taskName, dependencies, changedDependencyResourcePaths);

		if (!changedProjectResourcePaths.size && !changedDependencyResourcePaths.size) {
			// Task is no longer invalidated
			this.#invalidatedTasks.delete(taskName);
		}
	}

	async _validateChangedResources(taskName, reader, changedResourcePaths) {
		for (const resourcePath of changedResourcePaths) {
			const resource = await reader.byPath(resourcePath);
			if (!resource) {
				// Resource was deleted, no need to check further
				continue;
			}

			const taskCache = this.#taskCache.get(taskName);
			if (!taskCache) {
				throw new Error(`Failed to validate changed resources for task ${taskName}: Task cache not found`);
			}
			if (await taskCache.hasResourceInReadCache(resource)) {
				log.verbose(`Resource content has not changed for task ${taskName}, ` +
					`removing ${resourcePath} from set of changed resource paths`);
				changedResourcePaths.delete(resourcePath);
			}
		}
	}

	/**
	 * Gets the set of changed project resource paths for a task
	 *
	 * @param {string} taskName - Name of the task
	 * @returns {Set<string>} Set of changed project resource paths
	 */
	getChangedProjectResourcePaths(taskName) {
		return this.#invalidatedTasks.get(taskName)?.changedProjectResourcePaths ?? new Set();
	}

	/**
	 * Gets the set of changed dependency resource paths for a task
	 *
	 * @param {string} taskName - Name of the task
	 * @returns {Set<string>} Set of changed dependency resource paths
	 */
	getChangedDependencyResourcePaths(taskName) {
		return this.#invalidatedTasks.get(taskName)?.changedDependencyResourcePaths ?? new Set();
	}

	// ===== CACHE QUERIES =====

	/**
	 * Checks if any task cache exists
	 *
	 * @returns {boolean} True if at least one task has been cached
	 */
	hasAnyCache() {
		return this.#taskCache.size > 0;
	}

	/**
	 * Checks whether the project's build cache has an entry for the given task
	 *
	 * This means that the cache has been filled with the input and output of the given task.
	 *
	 * @param {string} taskName - Name of the task
	 * @returns {boolean} True if cache exists for this task
	 */
	hasTaskCache(taskName) {
		return this.#taskCache.has(taskName);
	}

	/**
	 * Checks whether the cache for a specific task is currently valid
	 *
	 * @param {string} taskName - Name of the task
	 * @returns {boolean} True if cache exists and is valid for this task
	 */
	isTaskCacheValid(taskName) {
		return this.#taskCache.has(taskName) && !this.#invalidatedTasks.has(taskName);
	}

	/**
	 * Determines whether a rebuild is needed
	 *
	 * @returns {boolean} True if no cache exists or if any tasks have been invalidated
	 */
	needsRebuild() {
		return !this.hasAnyCache() || this.#invalidatedTasks.size > 0;
	}

	async setTasks(taskNames) {
		const stageNames = taskNames.map((taskName) => this.#getStageNameForTask(taskName));
		this.#project.setStages(stageNames);
	}

	async prepareTaskExecution(taskName, dependencyReader) {
		// Check cache exists and ensure it's still valid before using it
		if (this.hasTaskCache(taskName)) {
			// Check whether any of the relevant resources have changed
			await this.validateChangedResources(taskName, this.#project.getReader(), dependencyReader);

			if (this.isTaskCacheValid(taskName)) {
				return false; // No need to execute task, cache is valid
			}
		}

		// Switch project to use cached stage as base layer
		this.#project.useStage(this.#getStageNameForTask(taskName));
		return true; // Task needs to be executed
	}

	// /**
	//  * Gets the current status of the cache for debugging and monitoring
	//  *
	//  * @returns {object} Status information including cache state and statistics
	//  */
	// getStatus() {
	// 	return {
	// 		hasCache: this.hasAnyCache(),
	// 		totalTasks: this.#taskCache.size,
	// 		invalidatedTasks: this.#invalidatedTasks.size,
	// 		modifiedResourceCount: this.#updatedResources.size,
	// 		buildSignature: this.#buildSignature,
	// 		restoreFailed: this.#restoreFailed
	// 	};
	// }

	/**
	 * Gets the names of all invalidated tasks
	 *
	 * @returns {string[]} Array of task names that have been invalidated
	 */
	getInvalidatedTaskNames() {
		return Array.from(this.#invalidatedTasks.keys());
	}

	// ===== SERIALIZATION =====
	async #createCacheManifest() {
		const cache = Object.create(null);
		cache.index = await this.#createIndex(this.#project.getSourceReader(), true);
		cache.indexTimestamp = Date.now(); // TODO: This is way too late if the resource' metadata has been cached

		cache.taskMetadata = Object.create(null);
		for (const [taskName, taskCache] of this.#taskCache) {
			cache.taskMetadata[taskName] = await taskCache.createMetadata();
		}

		cache.stages = await this.#saveCachedStages();
		return cache;
	}

	async #createIndex(reader, includeInode = false) {
		const resources = await reader.byGlob("/**/*");
		return await createResourceIndex(resources, includeInode);
	}

	async #saveBuildManifest(buildManifest) {
		buildManifest.cache = await this.#createCacheManifest();

		await this.#cacheManager.writeBuildManifest(
			this.#project, this.#buildSignature, buildManifest);
	}

	#getStageNameForTask(taskName) {
		return `task/${taskName}`;
	}

	async #saveCachedStages() {
		log.info(`Storing task outputs for project ${this.#project.getName()} in cache...`);

		return await Promise.all(this.#project.getStagesForCache().map(async ({stageId, reader}) => {
			const resources = await reader.byGlob("/**/*");
			const resourceMetadata = Object.create(null);
			await Promise.all(resources.map(async (res) => {
				// Store resource content in cacache via CacheManager
				const integrity = await this.#cacheManager.writeStage(
					this.#buildSignature, stageId,
					res.getOriginalPath(), await res.getBuffer()
				);

				resourceMetadata[res.getOriginalPath()] = {
					size: await res.getSize(),
					lastModified: res.getLastModified(),
					integrity,
				};
			}));
			return [stageId, resourceMetadata];
		}));
		// Optional TODO: Re-import cache as base layer to reduce memory pressure?
	}

	async #checkForIndexChanges(index, indexTimestamp) {
		log.verbose(`Checking for source changes for project ${this.#project.getName()}`);
		const sourceReader = this.#project.getSourceReader();
		const resources = await sourceReader.byGlob("/**/*");
		const changedResources = new Set();
		for (const resource of resources) {
			const currentLastModified = resource.getLastModified();
			const resourcePath = resource.getOriginalPath();
			if (currentLastModified > indexTimestamp) {
				// Resource modified after index was created, no need for further checks
				log.verbose(`Source file created or modified after index creation: ${resourcePath}`);
				changedResources.add(resourcePath);
				continue;
			}
			// Check against index
			if (!Object.hasOwn(index, resourcePath)) {
				// New resource encountered
				log.verbose(`New source file: ${resourcePath}`);
				changedResources.add(resourcePath);
				continue;
			}
			const {lastModified, size, inode, integrity} = index[resourcePath];

			if (lastModified !== currentLastModified) {
				log.verbose(`Source file modified: ${resourcePath} (timestamp change)`);
				changedResources.add(resourcePath);
				continue;
			}

			if (inode !== resource.getInode()) {
				log.verbose(`Source file modified: ${resourcePath} (inode change)`);
				changedResources.add(resourcePath);
				continue;
			}

			if (size !== await resource.getSize()) {
				log.verbose(`Source file modified: ${resourcePath} (size change)`);
				changedResources.add(resourcePath);
				continue;
			}

			if (currentLastModified === indexTimestamp) {
				// If the source modification time is equal to index creation time,
				// it's possible for a race condition to have occurred where the file was modified
				// during index creation without changing its size.
				// In this case, we need to perform an integrity check to determine if the file has changed.
				const currentIntegrity = await resource.getIntegrity();
				if (currentIntegrity !== integrity) {
					log.verbose(`Resource changed: ${resourcePath} (integrity change)`);
					changedResources.add(resourcePath);
				}
			}
		}
		if (changedResources.size) {
			const invalidatedTasks = this.resourceChanged(changedResources, new Set());
			if (invalidatedTasks) {
				log.info(`Invalidating tasks due to changed resources for project ${this.#project.getName()}`);
			}
		}
	}

	async #createReaderForStageCache(stageId, resourceMetadata) {
		const allResourcePaths = Object.keys(resourceMetadata);
		return createProxy({
			name: `Cache reader for task ${stageId} in project ${this.#project.getName()}`,
			listResourcePaths: () => {
				return allResourcePaths;
			},
			getResource: async (virPath) => {
				if (!allResourcePaths.includes(virPath)) {
					return null;
				}
				const {lastModified, size, integrity} = resourceMetadata[virPath];
				if (size === undefined || lastModified === undefined ||
					integrity === undefined) {
					throw new Error(`Incomplete metadata for resource ${virPath} of task ${stageId} ` +
						`in project ${this.#project.getName()}`);
				}
				// Get path to cached file contend stored in cacache via CacheManager
				const cachePath = await this.#cacheManager.getResourcePathForStage(
					this.#buildSignature, stageId, virPath, integrity);
				if (!cachePath) {
					log.warn(`Content of resource ${virPath} of task ${stageId} ` +
						`in project ${this.#project.getName()}`);
					return null;
				}
				return createResource({
					path: virPath,
					sourceMetadata: {
						fsPath: cachePath
					},
					createStream: () => {
						return fs.createReadStream(cachePath);
					},
					createBuffer: async () => {
						return await readFile(cachePath);
					},
					size,
					lastModified,
					integrity,
				});
			}
		});
	}

	async #importCachedTasks(taskMetadata) {
		for (const [taskName, metadata] of Object.entries(taskMetadata)) {
			this.#taskCache.set(taskName,
				new BuildTaskCache(this.#project.getName(), taskName, metadata));
		}
	}

	async #importCachedStages(stages) {
		const readers = await Promise.all(stages.map(async ([stageId, resourceMetadata]) => {
			return await this.#createReaderForStageCache(stageId, resourceMetadata);
		}));
		this.#project.setStages(stages.map(([id]) => id), readers);
	}

	async saveToDisk(buildManifest) {
		await this.#saveBuildManifest(buildManifest);
	}

	/**
	 * Attempts to load the cache from disk
	 *
	 * If a cache file exists, it will be loaded and validated. If any source files
	 * have changed since the cache was created, affected tasks will be invalidated.
	 *
	 * @returns {Promise<void>}
	 * @throws {Error} If cache restoration fails
	 */
	async #attemptLoadFromDisk() {
		const manifest = await this.#cacheManager.readBuildManifest(this.#project, this.#buildSignature);
		if (!manifest) {
			log.verbose(`No build manifest found for project ${this.#project.getName()} ` +
				`with build signature ${this.#buildSignature}`);
			return;
		}

		try {
			// Check build manifest version
			const {buildManifest, cache} = manifest;
			if (buildManifest.manifestVersion !== "1.0") {
				log.verbose(`Incompatible build manifest version ${manifest.version} found for project ` +
				`${this.#project.getName()} with build signature ${this.#buildSignature}. Ignoring cache.`);
				return;
			}
			// TODO: Validate manifest against a schema

			// Validate build signature match
			if (this.#buildSignature !== manifest.buildManifest.signature) {
				throw new Error(
					`Build manifest signature ${manifest.buildManifest.signature} does not match expected ` +
					`build signature ${this.#buildSignature} for project ${this.#project.getName()}`);
			}
			log.info(
				`Restoring build cache for project ${this.#project.getName()} from build manifest ` +
				`with signature ${this.#buildSignature}`);

			// Import task- and stage metadata first and in parallel
			await Promise.all([
				this.#importCachedTasks(cache.taskMetadata),
				this.#importCachedStages(cache.stages),
			]);

			// After tasks have been imported, check for source changes (and potentially invalidate tasks)
			await this.#checkForIndexChanges(cache.index, cache.indexTimestamp);
		} catch (err) {
			throw new Error(
				`Failed to restore cache from disk for project ${this.#project.getName()}: ${err.message}`, {
					cause: err
				});
		}
	}
}

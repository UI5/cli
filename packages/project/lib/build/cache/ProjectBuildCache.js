import path from "node:path";
import {stat} from "node:fs/promises";
import {createResource, createAdapter} from "@ui5/fs/resourceFactory";
import {getLogger} from "@ui5/logger";
import BuildTaskCache from "./BuildTaskCache.js";
const log = getLogger("build:cache:ProjectBuildCache");

/**
 * A project's build cache can have multiple states
 * - Initial build without existing build manifest or cache:
 *   * No build manifest
 *   * Tasks are unknown
 *   * Resources are unknown
 *   * No persistence of workspaces
 * - Build of project with build manifest
 *   * (a valid build manifest implies that the project will not be built initially)
 *   * Tasks are known
 *   * Resources required and produced by tasks are known
 *   * No persistence of workspaces
 *   * => In case of a rebuild, all tasks need to be executed once to restore the workspaces
 * - Build of project with build manifest and cache
 *   * Tasks are known
 *   * Resources required and produced by tasks are known
 *   * Workspaces can be restored from cache
 */

export default class ProjectBuildCache {
	#taskCache = new Map();
	#project;
	#cacheKey;
	#cacheDir;
	#cacheRoot;

	#invalidatedTasks = new Map();
	#updatedResources = new Set();
	#restoreFailed = false;

	/**
	 * Creates a new ProjectBuildCache instance
	 *
	 * @param {object} project - Project instance
	 * @param {string} cacheKey - Cache key identifying this build configuration
	 * @param {string} [cacheDir] - Optional cache directory for persistence
	 */
	constructor(project, cacheKey, cacheDir) {
		this.#project = project;
		this.#cacheKey = cacheKey;
		this.#cacheDir = cacheDir;
		this.#cacheRoot = cacheDir && createAdapter({
			fsBasePath: cacheDir,
			virBasePath: "/"
		});
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
	 * @param {string} taskName - Name of the executed task
	 * @param {object} workspaceTracker - Tracker that monitored workspace reads
	 * @param {object} [dependencyTracker] - Tracker that monitored dependency reads
	 * @returns {Promise<void>}
	 */
	async recordTaskResult(taskName, workspaceTracker, dependencyTracker) {
		const projectTrackingResults = workspaceTracker.getResults();
		const dependencyTrackingResults = dependencyTracker?.getResults();

		const resourcesRead = projectTrackingResults.resourcesRead;
		if (dependencyTrackingResults) {
			for (const [resourcePath, resource] of Object.entries(dependencyTrackingResults.resourcesRead)) {
				resourcesRead[resourcePath] = resource;
			}
		}
		const resourcesWritten = projectTrackingResults.resourcesWritten;

		if (this.#taskCache.has(taskName)) {
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
				const taskIndex = allTasks.indexOf(taskName);
				const emptySet = new Set();
				for (let i = taskIndex + 1; i < allTasks.length; i++) {
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
		} else {
			log.verbose(`Initializing build cache for task ${taskName} in project ${this.#project.getName()}`);
			this.#taskCache.set(taskName,
				new BuildTaskCache(this.#project.getName(), taskName, {
					projectRequests: projectTrackingResults.requests,
					dependencyRequests: dependencyTrackingResults?.requests,
					resourcesRead,
					resourcesWritten
				})
			);
		}

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
			if (!taskCache.checkPossiblyInvalidatesTask(projectResourcePaths, dependencyResourcePaths)) {
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
	getChangedProjectPaths(taskName) {
		return this.#invalidatedTasks.get(taskName)?.changedProjectResourcePaths ?? new Set();
	}

	/**
	 * Gets the set of changed dependency resource paths for a task
	 *
	 * @param {string} taskName - Name of the task
	 * @returns {Set<string>} Set of changed dependency resource paths
	 */
	getChangedDependencyPaths(taskName) {
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

	/**
	 * Gets the current status of the cache for debugging and monitoring
	 *
	 * @returns {object} Status information including cache state and statistics
	 */
	getStatus() {
		return {
			hasCache: this.hasAnyCache(),
			totalTasks: this.#taskCache.size,
			invalidatedTasks: this.#invalidatedTasks.size,
			modifiedResourceCount: this.#updatedResources.size,
			cacheKey: this.#cacheKey,
			restoreFailed: this.#restoreFailed
		};
	}

	/**
	 * Gets the names of all invalidated tasks
	 *
	 * @returns {string[]} Array of task names that have been invalidated
	 */
	getInvalidatedTaskNames() {
		return Array.from(this.#invalidatedTasks.keys());
	}

	async toObject() {
		// const globalResourceIndex = Object.create(null);
		// function addResourcesToIndex(taskName, resourceMap) {
		// 	for (const resourcePath of Object.keys(resourceMap)) {
		// 		const resource = resourceMap[resourcePath];
		// 		const resourceKey = `${resourcePath}:${resource.hash}`;
		// 		if (!globalResourceIndex[resourceKey]) {
		// 			globalResourceIndex[resourceKey] = {
		// 				hash: resource.hash,
		// 				lastModified: resource.lastModified,
		// 				tasks: [taskName]
		// 			};
		// 		} else if (!globalResourceIndex[resourceKey].tasks.includes(taskName)) {
		// 			globalResourceIndex[resourceKey].tasks.push(taskName);
		// 		}
		// 	}
		// }
		const taskCache = [];
		for (const cache of this.#taskCache.values()) {
			const cacheObject = await cache.toJSON();
			taskCache.push(cacheObject);
			// addResourcesToIndex(taskName, cacheObject.resources.project.resourcesRead);
			// addResourcesToIndex(taskName, cacheObject.resources.project.resourcesWritten);
			// addResourcesToIndex(taskName, cacheObject.resources.dependencies.resourcesRead);
		}
		// Collect metadata for all relevant source files
		const sourceReader = this.#project.getSourceReader();
		// const resourceMetadata = await Promise.all(Array.from(relevantSourceFiles).map(async (resourcePath) => {
		const resources = await sourceReader.byGlob("/**/*");
		const sourceMetadata = Object.create(null);
		await Promise.all(resources.map(async (resource) => {
			sourceMetadata[resource.getOriginalPath()] = {
				lastModified: resource.getStatInfo()?.mtimeMs,
				hash: await resource.getHash(),
			};
		}));

		return {
			timestamp: Date.now(),
			cacheKey: this.#cacheKey,
			taskCache,
			sourceMetadata,
			// globalResourceIndex,
		};
	}

	async #serializeMetadata() {
		const serializedCache = await this.toJSON();
		const cacheContent = JSON.stringify(serializedCache, null, 2);
		const res = createResource({
			path: `/cache-info.json`,
			string: cacheContent,
		});
		await this.#cacheRoot.write(res);
	}

	async #serializeTaskOutputs() {
		log.info(`Serializing task outputs for project ${this.#project.getName()}`);
		const stageCache = await Promise.all(Array.from(this.#taskCache.keys()).map(async (taskName, idx) => {
			const reader = this.#project.getDeltaReader(taskName);
			if (!reader) {
				log.verbose(
					`Skipping serialization of empty writer for task ${taskName} in project ${this.#project.getName()}`
				);
				return;
			}
			const resources = await reader.byGlob("/**/*");

			const target = createAdapter({
				fsBasePath: path.join(this.#cacheDir, "taskCache", `${idx}-${taskName}`),
				virBasePath: "/"
			});

			for (const res of resources) {
				await target.write(res);
			}
			return {
				reader: target,
				stage: taskName
			};
		}));
		// Re-import cache as base layer to reduce memory pressure
		this.#project.importCachedStages(stageCache.filter((entry) => entry));
	}

	async #checkSourceChanges(sourceMetadata) {
		log.verbose(`Checking for source changes for project ${this.#project.getName()}`);
		const sourceReader = this.#project.getSourceReader();
		const resources = await sourceReader.byGlob("/**/*");
		const changedResources = new Set();
		for (const resource of resources) {
			const resourcePath = resource.getOriginalPath();
			const resourceMetadata = sourceMetadata[resourcePath];
			if (!resourceMetadata) {
				// New resource
				log.verbose(`New resource: ${resourcePath}`);
				changedResources.add(resourcePath);
				continue;
			}
			if (resourceMetadata.lastModified !== resource.getStatInfo()?.mtimeMs) {
				log.verbose(`Resource changed: ${resourcePath}`);
				changedResources.add(resourcePath);
			}
			// TODO: Hash-based check can be requested by user and per project
			// The performance impact can be quite high for large projects
			/*
			if (someFlag) {
				const currentHash = await resource.getHash();
				if (currentHash !== resourceMetadata.hash) {
					log.verbose(`Resource changed: ${resourcePath}`);
					changedResources.add(resourcePath);
				}
			}*/
		}
		if (changedResources.size) {
			const invalidatedTasks = this.markResourcesChanged(changedResources, new Set());
			if (invalidatedTasks.length > 0) {
				log.info(`Invalidating tasks due to changed resources for project ${this.#project.getName()}`);
			}
		}
	}

	async #deserializeWriter() {
		const cachedStages = await Promise.all(Array.from(this.#taskCache.keys()).map(async (taskName, idx) => {
			const fsBasePath = path.join(this.#cacheDir, "taskCache", `${idx}-${taskName}`);
			let cacheReader;
			if (await exists(fsBasePath)) {
				cacheReader = createAdapter({
					name: `Cache reader for task ${taskName} in project ${this.#project.getName()}`,
					fsBasePath,
					virBasePath: "/",
					project: this.#project,
				});
			}

			return {
				stage: taskName,
				reader: cacheReader
			};
		}));
		this.#project.importCachedStages(cachedStages);
	}

	/**
	 * Saves the cache to disk
	 *
	 * @returns {Promise<void>}
	 * @throws {Error} If cache persistence is not available
	 */
	async saveToDisk() {
		if (!this.#cacheRoot) {
			log.error("Cannot save cache to disk: No cache persistence available");
			return;
		}
		await Promise.all([
			await this.#serializeTaskOutputs(),
			await this.#serializeMetadata()
		]);
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
	async loadFromDisk() {
		if (this.#restoreFailed || !this.#cacheRoot) {
			return;
		}
		const res = await this.#cacheRoot.byPath(`/cache-info.json`);
		if (!res) {
			this.#restoreFailed = true;
			return;
		}
		const cacheContent = JSON.parse(await res.getString());
		try {
			const projectName = this.#project.getName();
			for (const {taskName, resourceMetadata} of cacheContent.taskCache) {
				this.#taskCache.set(taskName, new BuildTaskCache(projectName, taskName, resourceMetadata));
			}
			await Promise.all([
				this.#checkSourceChanges(cacheContent.sourceMetadata),
				this.#deserializeWriter()
			]);
		} catch (err) {
			throw new Error(
				`Failed to restore cache from disk for project ${this.#project.getName()}: ${err.message}`, {
					cause: err
				});
		}
	}
}

async function exists(filePath) {
	try {
		await stat(filePath);
		return true;
	} catch (err) {
		// "File or directory does not exist"
		if (err.code === "ENOENT") {
			return false;
		} else {
			throw err;
		}
	}
}

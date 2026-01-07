import {createResource, createProxy} from "@ui5/fs/resourceFactory";
import {getLogger} from "@ui5/logger";
import fs from "graceful-fs";
import {promisify} from "node:util";
import {gunzip, createGunzip} from "node:zlib";
const readFile = promisify(fs.readFile);
import BuildTaskCache from "./BuildTaskCache.js";
import StageCache from "./StageCache.js";
import ResourceIndex from "./index/ResourceIndex.js";
import {firstTruthy} from "./utils.js";
const log = getLogger("build:cache:ProjectBuildCache");

/**
 * @typedef {object} StageMetadata
 * @property {Object<string, @ui5/project/build/cache/index/HashTree~ResourceMetadata>} resourceMetadata
 */

/**
 * @typedef {object} StageCacheEntry
 * @property {@ui5/fs/AbstractReader} stage - Reader for the cached stage
 * @property {Set<string>} writtenResourcePaths - Set of resource paths written by the task
 */

export default class ProjectBuildCache {
	#taskCache = new Map();
	#stageCache = new StageCache();

	#project;
	#buildSignature;
	#buildManifest;
	#cacheManager;
	#currentProjectReader;
	#dependencyReader;
	#resourceIndex;
	#requiresInitialBuild;

	#invalidatedTasks = new Map();

	/**
	 * Creates a new ProjectBuildCache instance
	 *
	 * @private - Use ProjectBuildCache.create() instead
	 * @param {object} project - Project instance
	 * @param {string} buildSignature - Build signature for the current build
	 * @param {object} cacheManager - Cache manager instance for reading/writing cache data
	 */
	constructor(project, buildSignature, cacheManager) {
		log.verbose(
			`ProjectBuildCache for project ${project.getName()} uses build signature ${buildSignature}`);
		this.#project = project;
		this.#buildSignature = buildSignature;
		this.#cacheManager = cacheManager;
	}

	/**
	 * Factory method to create and initialize a ProjectBuildCache instance
	 *
	 * This is the recommended way to create a ProjectBuildCache as it ensures
	 * proper asynchronous initialization of the resource index and cache loading.
	 *
	 * @param {object} project - Project instance
	 * @param {string} buildSignature - Build signature for the current build
	 * @param {object} cacheManager - Cache manager instance
	 * @returns {Promise<ProjectBuildCache>} Initialized cache instance
	 */
	static async create(project, buildSignature, cacheManager) {
		const cache = new ProjectBuildCache(project, buildSignature, cacheManager);
		await cache.#init();
		return cache;
	}

	/**
	 * Initializes the cache by loading resource index, build manifest, and checking cache validity
	 *
	 * @private
	 * @returns {Promise<void>}
	 */
	async #init() {
		this.#resourceIndex = await this.#initResourceIndex();
		this.#buildManifest = await this.#loadBuildManifest();
		this.#requiresInitialBuild = !(await this.#loadIndexCache());
	}

	/**
	 * Initializes the resource index from cache or creates a new one
	 *
	 * This method attempts to load a cached resource index. If found, it validates
	 * the index against current source files and invalidates affected tasks if
	 * resources have changed. If no cache exists, creates a fresh index.
	 *
	 * @private
	 * @returns {Promise<ResourceIndex>} The initialized resource index
	 * @throws {Error} If cached index signature doesn't match computed signature
	 */
	async #initResourceIndex() {
		const sourceReader = this.#project.getSourceReader();
		const [resources, indexCache] = await Promise.all([
			await sourceReader.byGlob("/**/*"),
			await this.#cacheManager.readIndexCache(this.#project.getId(), this.#buildSignature),
		]);
		if (indexCache) {
			log.verbose(`Using cached resource index for project ${this.#project.getName()}`);
			// Create and diff resource index
			const {resourceIndex, changedPaths} =
				await ResourceIndex.fromCacheWithDelta(indexCache, resources);
			// Import task caches

			for (const taskName of indexCache.taskList) {
				this.#taskCache.set(taskName,
					new BuildTaskCache(taskName, this.#project.getName(),
						this.#createBuildTaskCacheMetadataReader(taskName)));
			}
			if (changedPaths.length) {
				// Invalidate tasks based on changed resources
				// Note: If the changed paths don't affect any task, the index cache still can't be used due to the
				// root hash mismatch.
				// Since no tasks have been invalidated, a rebuild is still necessary in this case, so that
				// each task can find and use its individual stage cache.
				// Hence requiresInitialBuild will be set to true in this case (and others.
				await this.resourceChanged(changedPaths, []);
			} else if (indexCache.indexTree.root.hash !== resourceIndex.getSignature()) {
				// Validate index signature matches with cached signature
				throw new Error(
					`Resource index signature mismatch for project ${this.#project.getName()}: ` +
					`expected ${indexCache.indexTree.root.hash}, got ${resourceIndex.getSignature()}`);
			}
			return resourceIndex;
		}
		// No index cache found, create new index
		return await ResourceIndex.create(resources);
	}

	// ===== TASK MANAGEMENT =====

	/**
	 * Prepares a task for execution by switching to its stage and checking for cached results
	 *
	 * This method:
	 * 1. Switches the project to the task's stage
	 * 2. Updates task indices if the task has been invalidated
	 * 3. Attempts to find a cached stage for the task
	 * 4. Returns whether the task needs to be executed
	 *
	 * @param {string} taskName - Name of the task to prepare
	 * @returns {Promise<boolean|object>} True or object if task can use cache, false otherwise
	 */
	async prepareTaskExecution(taskName) {
		const stageName = this.#getStageNameForTask(taskName);
		const taskCache = this.#taskCache.get(taskName);
		// Switch project to new stage
		this.#project.useStage(stageName);
		log.verbose(`Preparing task execution for task ${taskName} in project ${this.#project.getName()}...`);
		if (taskCache) {
			let deltaInfo;
			if (this.#invalidatedTasks.has(taskName)) {
				log.verbose(`Task cache for task ${taskName} has been invalidated, updating indices...`);
				const invalidationInfo =
					this.#invalidatedTasks.get(taskName);
				deltaInfo = await taskCache.updateIndices(
					invalidationInfo.changedProjectResourcePaths,
					invalidationInfo.changedDependencyResourcePaths,
					this.#project.getReader(), this.#dependencyReader);
			} // else: Index will be created upon task completion

			// After index update, try to find cached stages for the new signatures
			const stageSignatures = await taskCache.getPossibleStageSignatures();
			const stageCache = await this.#findStageCache(stageName, stageSignatures);
			if (stageCache) {
				const stageChanged = this.#project.setStage(stageName, stageCache.stage);

				// Task can be skipped, use cached stage as project reader
				if (this.#invalidatedTasks.has(taskName)) {
					this.#invalidatedTasks.delete(taskName);
				}

				if (!stageChanged && stageCache.writtenResourcePaths.size) {
					// Invalidate following tasks
					this.#invalidateFollowingTasks(taskName, stageCache.writtenResourcePaths);
				}
				return true; // No need to execute the task
			} else if (deltaInfo) {
				log.verbose(`No cached stage found for task ${taskName} in project ${this.#project.getName()}`);

				const deltaStageCache = await this.#findStageCache(stageName, [deltaInfo.originalSignature]);
				if (deltaStageCache) {
					log.verbose(
						`Using delta cached stage for task ${taskName} in project ${this.#project.getName()} ` +
						`with original signature ${deltaInfo.originalSignature} (now ${deltaInfo.newSignature}) ` +
						`and ${deltaInfo.changedProjectResourcePaths.size} changed project resource paths and ` +
						`${deltaInfo.changedDependencyResourcePaths.size} changed dependency resource paths.`);

					// Store current project reader for later use in recordTaskResult
					this.#currentProjectReader = this.#project.getReader();
					return {
						previousStageCache: deltaStageCache,
						newSignature: deltaInfo.newSignature,
						changedProjectResourcePaths: deltaInfo.changedProjectResourcePaths,
						changedDependencyResourcePaths: deltaInfo.changedDependencyResourcePaths
					};
				}
			}
		} else {
			log.verbose(`No task cache found`);
		}
		// Store current project reader for later use in recordTaskResult
		this.#currentProjectReader = this.#project.getReader();

		return false; // Task needs to be executed
	}

	/**
	 * Attempts to find a cached stage for the given task
	 *
	 * Checks both in-memory stage cache and persistent cache storage for a matching
	 * stage signature. Returns the first matching cached stage found.
	 *
	 * @private
	 * @param {string} stageName - Name of the stage to find
	 * @param {string[]} stageSignatures - Possible signatures for the stage
	 * @returns {Promise<StageCacheEntry|null>} Cached stage entry or null if not found
	 */
	async #findStageCache(stageName, stageSignatures) {
		// Check cache exists and ensure it's still valid before using it
		log.verbose(`Looking for cached stage for task ${stageName} in project ${this.#project.getName()} ` +
			`with ${stageSignatures.length} possible signatures:\n - ${stageSignatures.join("\n - ")}`);
		if (stageSignatures.length) {
			for (const stageSignature of stageSignatures) {
				const stageCache = this.#stageCache.getCacheForSignature(stageName, stageSignature);
				if (stageCache) {
					return stageCache;
				}
			}

			const stageCache = await firstTruthy(stageSignatures.map(async (stageSignature) => {
				const stageMetadata = await this.#cacheManager.readStageCache(
					this.#project.getId(), this.#buildSignature, stageName, stageSignature);
				if (stageMetadata) {
					const reader = await this.#createReaderForStageCache(
						stageName, stageSignature, stageMetadata.resourceMetadata);
					return {
						stage: reader,
						writtenResourcePaths: new Set(Object.keys(stageMetadata.resourceMetadata)),
					};
				}
			}));
			return stageCache;
		}
	}

	/**
	 * Records the result of a task execution and updates the cache
	 *
	 * This method:
	 * 1. Creates a signature for the executed task based on its resource requests
	 * 2. Stores the resulting stage in the stage cache using that signature
	 * 3. Invalidates downstream tasks if they depend on written resources
	 * 4. Removes the task from the invalidated tasks list
	 *
	 * @param {string} taskName - Name of the executed task
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests} projectResourceRequests
	 *  Resource requests for project resources
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests} dependencyResourceRequests
	 *  Resource requests for dependency resources
	 * @param {object} cacheInfo
	 * @returns {Promise<void>}
	 */
	async recordTaskResult(taskName, projectResourceRequests, dependencyResourceRequests, cacheInfo) {
		if (!this.#taskCache.has(taskName)) {
			// Initialize task cache
			this.#taskCache.set(taskName, new BuildTaskCache(taskName, this.#project.getName()));
		}
		log.verbose(`Updating build cache with results of task ${taskName} in project ${this.#project.getName()}`);
		const taskCache = this.#taskCache.get(taskName);

		// Identify resources written by task
		const stage = this.#project.getStage();
		const stageWriter = stage.getWriter();
		const writtenResources = await stageWriter.byGlob("/**/*");
		const writtenResourcePaths = writtenResources.map((res) => res.getOriginalPath());

		let stageSignature;
		if (cacheInfo) {
			stageSignature = cacheInfo.newSignature;
			// Add resources from previous stage cache to current stage
			let reader;
			if (cacheInfo.previousStageCache.stage.byGlob) {
				// Reader instance
				reader = cacheInfo.previousStageCache.stage;
			} else {
				// Stage instance
				reader = cacheInfo.previousStageCache.stage.getWriter() ??
					cacheInfo.previousStageCache.stage.getReader();
			}
			const previousWrittenResources = await reader.byGlob("/**/*");
			for (const res of previousWrittenResources) {
				if (!writtenResourcePaths.includes(res.getOriginalPath())) {
					await stageWriter.write(res);
				}
			}
		} else {
			// Calculate signature for executed task
			stageSignature = await taskCache.calculateSignature(
				projectResourceRequests,
				dependencyResourceRequests,
				this.#currentProjectReader,
				this.#dependencyReader
			);
		}

		log.verbose(`Storing stage for task ${taskName} in project ${this.#project.getName()} ` +
			`with signature ${stageSignature}`);
		// Store resulting stage in stage cache
		// TODO: Check whether signature already exists and avoid invalidating following tasks
		this.#stageCache.addSignature(
			this.#getStageNameForTask(taskName), stageSignature, this.#project.getStage(),
			writtenResourcePaths);

		// Task has been successfully executed, remove from invalidated tasks
		if (this.#invalidatedTasks.has(taskName)) {
			this.#invalidatedTasks.delete(taskName);
		}

		// Update task cache with new metadata
		if (writtenResourcePaths.size) {
			log.verbose(`Task ${taskName} produced ${writtenResourcePaths.size} resources`);
			this.#invalidateFollowingTasks(taskName, writtenResourcePaths);
		}
		// Reset current project reader
		this.#currentProjectReader = null;
	}

	/**
	 * Invalidates tasks that follow the given task if they depend on written resources
	 *
	 * Checks all tasks that come after the given task in execution order and
	 * invalidates those that match the written resource paths.
	 *
	 * @private
	 * @param {string} taskName - Name of the task that wrote resources
	 * @param {Set<string>} writtenResourcePaths - Paths of resources written by the task
	 */
	async #invalidateFollowingTasks(taskName, writtenResourcePaths) {
		const writtenPathsArray = Array.from(writtenResourcePaths);

		// Check whether following tasks need to be invalidated
		const allTasks = Array.from(this.#taskCache.keys());
		const taskIdx = allTasks.indexOf(taskName);
		for (let i = taskIdx + 1; i < allTasks.length; i++) {
			const nextTaskName = allTasks[i];
			if (!await this.#taskCache.get(nextTaskName).matchesChangedResources(writtenPathsArray, [])) {
				continue;
			}
			if (this.#invalidatedTasks.has(nextTaskName)) {
				const {changedProjectResourcePaths} =
					this.#invalidatedTasks.get(nextTaskName);
				for (const resourcePath of writtenResourcePaths) {
					changedProjectResourcePaths.add(resourcePath);
				}
			} else {
				this.#invalidatedTasks.set(nextTaskName, {
					changedProjectResourcePaths: new Set(writtenResourcePaths),
					changedDependencyResourcePaths: new Set()
				});
			}
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


	/**
	 * Handles resource changes and invalidates affected tasks
	 *
	 * Iterates through all cached tasks and checks if any match the changed resources.
	 * Matching tasks are marked as invalidated and will need to be re-executed.
	 * Changed resource paths are accumulated if a task is already invalidated.
	 *
	 * @param {string[]} projectResourcePaths - Changed project resource paths
	 * @param {string[]} dependencyResourcePaths - Changed dependency resource paths
	 * @returns {boolean} True if any task was invalidated, false otherwise
	 */
	async resourceChanged(projectResourcePaths, dependencyResourcePaths) {
		let taskInvalidated = false;
		for (const [taskName, taskCache] of this.#taskCache) {
			if (!await taskCache.matchesChangedResources(projectResourcePaths, dependencyResourcePaths)) {
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
		return this.#taskCache.has(taskName) && !this.#invalidatedTasks.has(taskName) && !this.#requiresInitialBuild;
	}

	/**
	 * Determines whether a rebuild is needed
	 *
	 * A rebuild is required if:
	 * - No task cache exists
	 * - Any tasks have been invalidated
	 * - Initial build is required (e.g., cache couldn't be loaded)
	 *
	 * @returns {boolean} True if rebuild is needed, false if cache can be fully utilized
	 */
	requiresBuild() {
		return !this.hasAnyCache() || this.#invalidatedTasks.size > 0 || this.#requiresInitialBuild;
	}

	/**
	 * Initializes project stages for the given tasks
	 *
	 * Creates stage names for each task and initializes them in the project.
	 * This must be called before task execution begins.
	 *
	 * @param {string[]} taskNames - Array of task names to initialize stages for
	 * @returns {Promise<void>}
	 */
	async setTasks(taskNames) {
		const stageNames = taskNames.map((taskName) => this.#getStageNameForTask(taskName));
		this.#project.initStages(stageNames);

		// TODO: Rename function? We simply use it to have a point in time right before the project is built
	}

	/**
	 * Sets the dependency reader for accessing dependency resources
	 *
	 * The dependency reader is used by tasks to access resources from project
	 * dependencies. Must be set before tasks that require dependencies are executed.
	 *
	 * @param {@ui5/fs/AbstractReader} dependencyReader - Reader for dependency resources
	 * @returns {void}
	 */
	setDependencyReader(dependencyReader) {
		this.#dependencyReader = dependencyReader;
	}

	/**
	 * Signals that all tasks have completed and switches to the result stage
	 *
	 * This finalizes the build process by switching the project to use the
	 * final result stage containing all build outputs.
	 *
	 * @returns {void}
	 */
	allTasksCompleted() {
		this.#project.useResultStage();
	}

	/**
	 * Gets the names of all invalidated tasks
	 *
	 * Invalidated tasks are those that need to be re-executed because their
	 * input resources have changed.
	 *
	 * @returns {string[]} Array of task names that have been invalidated
	 */
	getInvalidatedTaskNames() {
		return Array.from(this.#invalidatedTasks.keys());
	}

	/**
	 * Generates the stage name for a given task
	 *
	 * @private
	 * @param {string} taskName - Name of the task
	 * @returns {string} Stage name in the format "task/{taskName}"
	 */
	#getStageNameForTask(taskName) {
		return `task/${taskName}`;
	}

	// ===== SERIALIZATION =====

	/**
	 * Loads the cached result stage from persistent storage
	 *
	 * Attempts to load a cached result stage using the resource index signature.
	 * If found, creates a reader for the cached stage and sets it as the project's
	 * result stage.
	 *
	 * @private
	 * @returns {Promise<boolean>} True if cache was loaded successfully, false otherwise
	 */
	async #loadIndexCache() {
		const stageSignature = this.#resourceIndex.getSignature();
		const stageId = "result";
		log.verbose(`Project ${this.#project.getName()} resource index signature: ${stageSignature}`);
		const stageCache = await this.#cacheManager.readStageCache(
			this.#project.getId(), this.#buildSignature, stageId, stageSignature);

		if (!stageCache) {
			log.verbose(
				`No cached stage found for project ${this.#project.getName()} with index signature ${stageSignature}`);
			return false;
		}
		log.verbose(
			`Using cached result stage for project ${this.#project.getName()} with index signature ${stageSignature}`);
		const reader = await this.#createReaderForStageCache(
			stageId, stageSignature, stageCache.resourceMetadata);
		this.#project.setResultStage(reader);
		this.#project.useResultStage();
		return true;
	}

	/**
	 * Writes the result stage to persistent cache storage
	 *
	 * Collects all resources from the result stage (excluding source reader),
	 * stores their content via the cache manager, and writes stage metadata
	 * including resource information.
	 *
	 * @private
	 * @returns {Promise<void>}
	 */
	async #writeResultStage() {
		const stageSignature = this.#resourceIndex.getSignature();
		const stageId = "result";

		const deltaReader = this.#project.getReader({excludeSourceReader: true});
		const resources = await deltaReader.byGlob("/**/*");
		const resourceMetadata = Object.create(null);
		log.verbose(`Project ${this.#project.getName()} resource index signature: ${stageSignature}`);
		log.verbose(`Caching result stage with ${resources.length} resources`);

		await Promise.all(resources.map(async (res) => {
			// Store resource content in cacache via CacheManager
			await this.#cacheManager.writeStageResource(this.#buildSignature, stageId, stageSignature, res);

			resourceMetadata[res.getOriginalPath()] = {
				inode: res.getInode(),
				lastModified: res.getLastModified(),
				size: await res.getSize(),
				integrity: await res.getIntegrity(),
			};
		}));

		const metadata = {
			resourceMetadata,
		};
		await this.#cacheManager.writeStageCache(
			this.#project.getId(), this.#buildSignature, stageId, stageSignature, metadata);
	}

	/**
	 * Creates a proxy reader for accessing cached stage resources
	 *
	 * The reader provides virtual access to cached resources by loading them from
	 * the cache storage on demand. Resource metadata is used to validate cache entries.
	 *
	 * @private
	 * @param {string} stageId - Identifier for the stage (e.g., "result" or "task/{taskName}")
	 * @param {string} stageSignature - Signature hash of the stage
	 * @param {Object<string, ResourceMetadata>} resourceMetadata - Metadata for all cached resources
	 * @returns {Promise<@ui5/fs/AbstractReader>} Proxy reader for cached resources
	 */
	async #createReaderForStageCache(stageId, stageSignature, resourceMetadata) {
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
				const {lastModified, size, integrity, inode} = resourceMetadata[virPath];
				if (size === undefined || lastModified === undefined ||
					integrity === undefined) {
					throw new Error(`Incomplete metadata for resource ${virPath} of task ${stageId} ` +
						`in project ${this.#project.getName()}`);
				}
				// Get path to cached file contend stored in cacache via CacheManager
				const cachePath = await this.#cacheManager.getResourcePathForStage(
					this.#buildSignature, stageId, stageSignature, virPath, integrity);
				if (!cachePath) {
					throw new Error(`Unexpected cache miss for resource ${virPath} of task ${stageId} ` +
						`in project ${this.#project.getName()}`);
				}
				return createResource({
					path: virPath,
					sourceMetadata: {
						fsPath: cachePath
					},
					createStream: () => {
						// Decompress the gzip-compressed stream
						return fs.createReadStream(cachePath).pipe(createGunzip());
					},
					createBuffer: async () => {
						// Decompress the gzip-compressed buffer
						const compressedBuffer = await readFile(cachePath);
						return await promisify(gunzip)(compressedBuffer);
					},
					size,
					lastModified,
					integrity,
					inode,
				});
			}
		});
	}

	/**
	 * Stores all cache data to persistent storage
	 *
	 * This method:
	 * 1. Writes the build manifest (if not already written)
	 * 2. Stores the result stage with all resources
	 * 3. Writes the resource index and task metadata
	 * 4. Stores all stage caches from the queue
	 *
	 * @param {object} buildManifest - Build manifest containing metadata about the build
	 * @param {string} buildManifest.manifestVersion - Version of the manifest format
	 * @param {string} buildManifest.signature - Build signature
	 * @returns {Promise<void>}
	 */
	async storeCache(buildManifest) {
		log.verbose(`Storing build cache for project ${this.#project.getName()} ` +
			`with build signature ${this.#buildSignature}`);
		if (!this.#buildManifest) {
			this.#buildManifest = buildManifest;
			await this.#cacheManager.writeBuildManifest(this.#project.getId(), this.#buildSignature, buildManifest);
		}

		// Store result stage
		await this.#writeResultStage();

		// Store task caches
		for (const [taskName, taskCache] of this.#taskCache) {
			await this.#cacheManager.writeTaskMetadata(this.#project.getId(), this.#buildSignature, taskName,
				taskCache.toCacheObject());
		}

		// Store stage caches
		const stageQueue = this.#stageCache.flushCacheQueue();
		await Promise.all(stageQueue.map(async ([stageId, stageSignature]) => {
			const {stage} = this.#stageCache.getCacheForSignature(stageId, stageSignature);
			const writer = stage.getWriter();
			const reader = writer.collection ? writer.collection : writer;
			const resources = await reader.byGlob("/**/*");
			const resourceMetadata = Object.create(null);
			await Promise.all(resources.map(async (res) => {
				// Store resource content in cacache via CacheManager
				await this.#cacheManager.writeStageResource(this.#buildSignature, stageId, stageSignature, res);

				resourceMetadata[res.getOriginalPath()] = {
					inode: res.getInode(),
					lastModified: res.getLastModified(),
					size: await res.getSize(),
					integrity: await res.getIntegrity(),
				};
			}));

			const metadata = {
				resourceMetadata,
			};
			await this.#cacheManager.writeStageCache(
				this.#project.getId(), this.#buildSignature, stageId, stageSignature, metadata);
		}));

		// Finally store index cache
		const indexMetadata = this.#resourceIndex.toCacheObject();
		await this.#cacheManager.writeIndexCache(this.#project.getId(), this.#buildSignature, {
			...indexMetadata,
			taskList: Array.from(this.#taskCache.keys()),
		});
	}

	/**
	 * Loads and validates the build manifest from persistent storage
	 *
	 * Attempts to load the build manifest and performs validation:
	 * - Checks manifest version compatibility (must be "1.0")
	 * - Validates build signature matches the expected signature
	 *
	 * If validation fails, the cache is considered invalid and will be ignored.
	 *
	 * @private
	 * @returns {Promise<object|undefined>} Build manifest object or undefined if not found/invalid
	 * @throws {Error} If build signature mismatch or cache restoration fails
	 */
	async #loadBuildManifest() {
		const manifest = await this.#cacheManager.readBuildManifest(this.#project.getId(), this.#buildSignature);
		if (!manifest) {
			log.verbose(`No build manifest found for project ${this.#project.getName()} ` +
				`with build signature ${this.#buildSignature}`);
			return;
		}

		try {
			// Check build manifest version
			const {buildManifest} = manifest;
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
			return buildManifest;
		} catch (err) {
			throw new Error(
				`Failed to restore cache from disk for project ${this.#project.getName()}: ${err.message}`, {
					cause: err
				});
		}
	}

	#createBuildTaskCacheMetadataReader(taskName) {
		return () => {
			return this.#cacheManager.readTaskMetadata(this.#project.getId(), this.#buildSignature, taskName);
		};
	}
}

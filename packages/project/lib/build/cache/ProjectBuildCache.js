import {createResource, createProxy, createWriterCollection} from "@ui5/fs/resourceFactory";
import {getLogger} from "@ui5/logger";
import fs from "graceful-fs";
import {promisify} from "node:util";
import crypto from "node:crypto";
import {gunzip, createGunzip} from "node:zlib";
const readFile = promisify(fs.readFile);
import BuildTaskCache from "./BuildTaskCache.js";
import StageCache from "./StageCache.js";
import ResourceIndex from "./index/ResourceIndex.js";
import {firstTruthy} from "./utils.js";
const log = getLogger("build:cache:ProjectBuildCache");

export const INDEX_STATES = Object.freeze({
	RESTORING_PROJECT_INDICES: "restoring_project_indices",
	RESTORING_DEPENDENCY_INDICES: "restoring_dependency_indices",
	INITIAL: "initial",
	FRESH: "fresh",
	REQUIRES_UPDATE: "requires_update",
});

export const RESULT_CACHE_STATES = Object.freeze({
	PENDING_VALIDATION: "pending_validation",
	NO_CACHE: "no_cache",
	FRESH_AND_IN_USE: "fresh_and_in_use",
});

/**
 * @typedef {object} StageMetadata
 * @property {Object<string, @ui5/project/build/cache/index/HashTree~ResourceMetadata>} resourceMetadata
 *   Resource metadata indexed by resource path
 */

/**
 * @typedef {object} StageCacheEntry
 * @property {string} signature Signature of the cached stage
 * @property {@ui5/fs/AbstractReader} stage Reader for the cached stage
 * @property {string[]} writtenResourcePaths Array of resource paths written by the task
 */

export default class ProjectBuildCache {
	#taskCache = new Map();
	#stageCache = new StageCache();

	#project;
	#buildSignature;
	#cacheManager;
	#currentProjectReader;
	#currentDependencyReader;
	#sourceIndex;
	#cachedSourceSignature;
	#currentStageSignatures = new Map();
	#cachedResultSignature;
	#currentResultSignature;

	// Pending changes
	#changedProjectSourcePaths = [];
	#changedDependencyResourcePaths = [];
	#writtenResultResourcePaths = [];

	#combinedIndexState = INDEX_STATES.RESTORING_PROJECT_INDICES;
	#resultCacheState = RESULT_CACHE_STATES.PENDING_VALIDATION;
	// #dependencyIndicesInitialized = false;

	/**
	 * Creates a new ProjectBuildCache instance
	 * Use ProjectBuildCache.create() instead
	 *
	 * @param {@ui5/project/specifications/Project} project Project instance
	 * @param {string} buildSignature Build signature for the current build
	 * @param {object} cacheManager Cache manager instance for reading/writing cache data
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
	 * @public
	 * @param {@ui5/project/specifications/Project} project Project instance
	 * @param {string} buildSignature Build signature for the current build
	 * @param {object} cacheManager Cache manager instance
	 * @returns {Promise<@ui5/project/build/cache/ProjectBuildCache>} Initialized cache instance
	 */
	static async create(project, buildSignature, cacheManager) {
		const cache = new ProjectBuildCache(project, buildSignature, cacheManager);
		const initStart = performance.now();
		await cache.#initSourceIndex();
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`Initialized source index for project ${project.getName()} ` +
				`in ${(performance.now() - initStart).toFixed(2)} ms`);
		}
		return cache;
	}

	/**
	 * Sets the dependency reader for accessing dependency resources
	 *
	 * The dependency reader is used by tasks to access resources from project
	 * dependencies. Must be set before tasks that require dependencies are executed.
	 *
	 * @public
	 * @param {@ui5/fs/AbstractReader} dependencyReader Reader for dependency resources
	 * @returns {Promise<string[]|boolean>}
	 *  Array of changed resource paths since last build, true if cache is fresh, false
	 *  if cache is empty
	 */
	async prepareProjectBuildAndValidateCache(dependencyReader) {
		this.#currentProjectReader = this.#project.getReader();
		this.#currentDependencyReader = dependencyReader;

		if (this.#combinedIndexState === INDEX_STATES.INITIAL) {
			log.verbose(`Project ${this.#project.getName()} has an empty index cache, skipping change processing.`);
			return false;
		}

		if (this.#combinedIndexState === INDEX_STATES.RESTORING_DEPENDENCY_INDICES) {
			const updateStart = performance.now();
			await this._refreshDependencyIndices(dependencyReader);
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`Initialized dependency indices for project ${this.#project.getName()} ` +
					`in ${(performance.now() - updateStart).toFixed(2)} ms`);
			}
			this.#combinedIndexState = INDEX_STATES.FRESH;

			// After initializing dependency indices, the result cache must be validated
			// This should be it's initial state anyways, so we just verify it here
			if (this.#resultCacheState !== RESULT_CACHE_STATES.PENDING_VALIDATION) {
				throw new Error(`Unexpected result cache state after restoring dependency indices ` +
					`for project ${this.#project.getName()}: ${this.#resultCacheState}`);
			}
		}

		if (this.#combinedIndexState === INDEX_STATES.REQUIRES_UPDATE) {
			const flushStart = performance.now();
			const changesDetected = await this.#flushPendingChanges();
			if (changesDetected) {
				this.#resultCacheState = RESULT_CACHE_STATES.PENDING_VALIDATION;
			}
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`Flushed pending changes for project ${this.#project.getName()} ` +
						`in ${(performance.now() - flushStart).toFixed(2)} ms`);
			}
			this.#combinedIndexState = INDEX_STATES.FRESH;
		}

		if (this.#resultCacheState === RESULT_CACHE_STATES.PENDING_VALIDATION) {
			log.verbose(`Project ${this.#project.getName()} cache requires validation due to detected changes.`);
			const findStart = performance.now();
			const changedResourcesOrFalse = await this.#findResultCache();
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`Validated result cache for project ${this.#project.getName()} ` +
					`in ${(performance.now() - findStart).toFixed(2)} ms`);
			}
			if (changedResourcesOrFalse) {
				this.#resultCacheState = RESULT_CACHE_STATES.FRESH_AND_IN_USE;
			} else {
				this.#resultCacheState = RESULT_CACHE_STATES.NO_CACHE;
			}
			return changedResourcesOrFalse;
		}
		return this.isFresh();
	}

	/**
	 * Processes changed resources since last build, updating indices and invalidating tasks as needed
	 *
	 * @returns {Promise<boolean>}
	 */
	async #flushPendingChanges() {
		if (this.#changedProjectSourcePaths.length === 0 &&
			this.#changedDependencyResourcePaths.length === 0) {
			return;
		}
		let sourceIndexChanged = false;
		if (this.#changedProjectSourcePaths.length) {
			// Update source index so we can use the signature later as part of the result stage signature
			sourceIndexChanged = await this.#updateSourceIndex(this.#changedProjectSourcePaths);
		}

		let depIndicesChanged = false;
		if (this.#changedDependencyResourcePaths.length) {
			await Promise.all(Array.from(this.#taskCache.values()).map(async (taskCache) => {
				const changed = await taskCache
					.updateDependencyIndices(this.#currentDependencyReader, this.#changedDependencyResourcePaths);
				if (changed) {
					depIndicesChanged = true;
				}
			}));
		}

		// Reset pending changes
		this.#changedProjectSourcePaths = [];
		this.#changedDependencyResourcePaths = [];

		if (sourceIndexChanged || depIndicesChanged) {
			// Relevant resources have changed, mark the cache as invalidated
			return true;
		} else {
			log.verbose(`No relevant resource changes detected for project ${this.#project.getName()}`);
		}
	}

	/**
	 * Initialize dependency indices for all tasks. This only needs to be called once per build.
	 * Later builds of the same project during the same overall build can reuse the existing indices
	 * (they will be updated based on input via dependencyResourcesChanged)
	 *
	 * @param {@ui5/fs/AbstractReader} dependencyReader Reader for dependency resources
	 * @returns {Promise<void>}
	 */
	async _refreshDependencyIndices(dependencyReader) {
		await Promise.all(Array.from(this.#taskCache.values()).map(async (taskCache) => {
			await taskCache.refreshDependencyIndices(dependencyReader);
		}));
		// Reset pending dependency changes since indices are fresh now anyways
		this.#changedDependencyResourcePaths = [];
	}

	/**
	 * Checks whether the cache is in a fresh state
	 *
	 * @public
	 * @returns {boolean} True if the cache is fresh
	 */
	isFresh() {
		return this.#combinedIndexState === INDEX_STATES.FRESH &&
			this.#resultCacheState === RESULT_CACHE_STATES.FRESH_AND_IN_USE;
	}

	/**
	 * Loads a cached result stage from persistent storage if available
	 *
	 * Attempts to load a cached result stage using the resource index signature.
	 * If found, creates a reader for the cached stage and sets it as the project's
	 * result stage.
	 *
	 * @returns {Promise<string[]|false>}
	 *   Array of resource paths written by the cached result stage (empty if the result stage remains unchanged),
	 *   or false if no cache found
	 */
	async #findResultCache() {
		const resultSignatures = this.#getPossibleResultStageSignatures();
		if (resultSignatures.includes(this.#currentResultSignature)) {
			log.verbose(
				`Project ${this.#project.getName()} result stage signature unchanged: ${this.#currentResultSignature}`);
			return [];
		}

		const res = await firstTruthy(resultSignatures.map(async (resultSignature) => {
			const metadata = await this.#cacheManager.readResultMetadata(
				this.#project.getId(), this.#buildSignature, resultSignature);
			if (!metadata) {
				return;
			}
			return [resultSignature, metadata];
		}));

		if (!res) {
			log.verbose(
				`No cached stage found for project ${this.#project.getName()}. Searched with ` +
				`${resultSignatures.length} possible signatures.`);
			return false;
		}
		const [resultSignature, resultMetadata] = res;
		log.verbose(`Found result cache with signature ${resultSignature}`);
		const {stageSignatures} = resultMetadata;

		const writtenResourcePaths = await this.#importStages(stageSignatures);

		log.verbose(
			`Using cached result stage for project ${this.#project.getName()} with index signature ${resultSignature}`);
		this.#currentResultSignature = resultSignature;
		this.#cachedResultSignature = resultSignature;
		return writtenResourcePaths;
	}

	/**
	 * Imports cached stages and sets them in the project
	 *
	 * @param {Object<string, string>} stageSignatures Map of stage names to their signatures
	 * @returns {Promise<string[]>} Array of resource paths written by all imported stages
	 */
	async #importStages(stageSignatures) {
		const stageNames = Object.keys(stageSignatures);
		if (this.#project.getStage()?.getId() === "initial") {
			// Only initialize stages once
			this.#project.initStages(stageNames);
		}
		const importedStages = await Promise.all(stageNames.map(async (stageName) => {
			const stageSignature = stageSignatures[stageName];
			const stageCache = await this.#findStageCache(stageName, [stageSignature]);
			if (!stageCache) {
				throw new Error(`Inconsistent result cache: Could not find cached stage ` +
					`${stageName} with signature ${stageSignature} for project ${this.#project.getName()}`);
			}
			return [stageName, stageCache];
		}));
		this.#project.useResultStage();
		const writtenResourcePaths = new Set();
		for (const [stageName, stageCache] of importedStages) {
			// Check whether the stage differs form the one currently in use
			if (this.#currentStageSignatures.get(stageName)?.join("-") !== stageCache.signature) {
				// Set stage
				this.#project.setStage(stageName, stageCache.stage);

				// Store signature for later use in result stage signature calculation
				this.#currentStageSignatures.set(stageName, stageCache.signature.split("-"));

				// Cached stage likely differs from the previous one (if any)
				// Add all resources written by the cached stage to the set of written/potentially changed resources
				for (const resourcePath of stageCache.writtenResourcePaths) {
					writtenResourcePaths.add(resourcePath);
				}
			}
		}
		return Array.from(writtenResourcePaths);
	}

	/**
	 * Calculates all possible result stage signatures based on current state
	 *
	 * @returns {string[]} Array of possible result stage signatures
	 */
	#getPossibleResultStageSignatures() {
		const projectSourceSignature = this.#sourceIndex.getSignature();

		const taskDependencySignatures = [];
		for (const taskCache of this.#taskCache.values()) {
			taskDependencySignatures.push(taskCache.getDependencyIndexSignatures());
		}
		const dependencySignaturesCombinations = cartesianProduct(taskDependencySignatures);

		return dependencySignaturesCombinations.map((dependencySignatures) => {
			const combinedDepSignature = createDependencySignature(dependencySignatures);
			return createStageSignature(projectSourceSignature, combinedDepSignature);
		});
	}

	/**
	 * Gets the current result stage signature
	 *
	 * @returns {string} Current result stage signature
	 */
	#getResultStageSignature() {
		const projectSourceSignature = this.#sourceIndex.getSignature();
		const dependencySignatures = [];
		for (const [, depSignature] of this.#currentStageSignatures.values()) {
			dependencySignatures.push(depSignature);
		}
		const combinedDepSignature = createDependencySignature(dependencySignatures);
		return createStageSignature(projectSourceSignature, combinedDepSignature);
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
	 * @public
	 * @param {string} taskName Name of the task to prepare
	 * @returns {Promise<boolean|object>}
	 *   True if task can use cache, false if task needs execution,
	 *   or an object with cache information for differential updates
	 */
	async prepareTaskExecutionAndValidateCache(taskName) {
		const stageName = this.#getStageNameForTask(taskName);
		const taskCache = this.#taskCache.get(taskName);
		// Store current project reader (= state of the previous stage) for later use (e.g. in recordTaskResult)
		this.#currentProjectReader = this.#project.getReader();
		// Switch project to new stage
		this.#project.useStage(stageName);
		log.verbose(`Preparing task execution for task ${taskName} in project ${this.#project.getName()}...`);
		if (!taskCache) {
			log.verbose(`No task cache found`);
			return false;
		}
		if (this.#writtenResultResourcePaths.length) {
			// Update task indices based on source changes and changes from by previous tasks
			const updateProjectIndicesStart = performance.now();
			await taskCache.updateProjectIndices(this.#currentProjectReader, this.#writtenResultResourcePaths);
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`Updated project indices for task ${taskName} in project ${this.#project.getName()} ` +
					`in ${(performance.now() - updateProjectIndicesStart).toFixed(2)} ms`);
			}
		}

		// TODO: Implement:
		// After index update, try to find cached stages for the new signatures
		// let stageSignatures = taskCache.getAffiliatedSignaturePairs();

		const projectSignatures = taskCache.getProjectIndexSignatures();
		const dependencySignatures = taskCache.getDependencyIndexSignatures();
		const stageSignatures = combineTwoArraysFast(
			projectSignatures,
			dependencySignatures,
		).map((signaturePair) => {
			return createStageSignature(...signaturePair);
		});

		const stageCache = await this.#findStageCache(stageName, stageSignatures);
		const oldStageSig = this.#currentStageSignatures.get(stageName)?.join("-");
		if (stageCache) {
			this.#project.setStage(stageName, stageCache.stage);

			// Check whether the stage actually changed
			if (stageCache.signature !== oldStageSig) {
				// Store new stage signature for later use in result stage signature calculation
				this.#currentStageSignatures.set(stageName, stageCache.signature.split("-"));

				// Cached stage likely differs from the previous one (if any)
				// Add all resources written by the cached stage to the set of written/potentially changed resources
				for (const resourcePath of stageCache.writtenResourcePaths) {
					if (!this.#writtenResultResourcePaths.includes(resourcePath)) {
						this.#writtenResultResourcePaths.push(resourcePath);
					}
				}
			}
			return true; // No need to execute the task
		} else {
			log.verbose(`No cached stage found for task ${taskName} in project ${this.#project.getName()}`);
			// TODO: Optimize this crazy thing
			const projectDeltas = taskCache.getProjectIndexDeltas();
			const depDeltas = taskCache.getDependencyIndexDeltas();

			// Combine deltas of project stages with cached dependency signatures
			const projDeltaSignatures = combineTwoArraysFast(
				Array.from(projectDeltas.keys()),
				dependencySignatures,
			).map((signaturePair) => {
				return createStageSignature(...signaturePair);
			});
			// Combine deltas of dependency stages with cached project signatures
			const depDeltaSignatures = combineTwoArraysFast(
				projectSignatures,
				Array.from(projectDeltas.keys()),
			).map((signaturePair) => {
				return createStageSignature(...signaturePair);
			});
			// Combine deltas of both project and dependency stages
			const deltaDeltaSignatures = combineTwoArraysFast(
				Array.from(projectDeltas.keys()),
				Array.from(depDeltas.keys()),
			).map((signaturePair) => {
				return createStageSignature(...signaturePair);
			});
			const deltaSignatures = [...projDeltaSignatures, ...depDeltaSignatures, ...deltaDeltaSignatures];
			const deltaStageCache = await this.#findStageCache(stageName, deltaSignatures);
			if (deltaStageCache) {
				// Store dependency signature for later use in result stage signature calculation
				const [foundProjectSig, foundDepSig] = deltaStageCache.signature.split("-");

				// Check whether the stage actually changed
				if (oldStageSig !== deltaStageCache.signature) {
					this.#currentStageSignatures.set(stageName, [foundProjectSig, foundDepSig]);

					// Cached stage likely differs from the previous one (if any)
					// Add all resources written by the cached stage to the set of written/potentially changed resources
					for (const resourcePath of deltaStageCache.writtenResourcePaths) {
						if (!this.#writtenResultResourcePaths.includes(resourcePath)) {
							this.#writtenResultResourcePaths.push(resourcePath);
						}
					}
				}

				// Create new signature and determine changed resource paths
				const projectDeltaInfo = projectDeltas.get(foundProjectSig);
				const dependencyDeltaInfo = depDeltas.get(foundDepSig);

				const newSignature = createStageSignature(
					projectDeltaInfo?.newSignature ?? foundProjectSig,
					dependencyDeltaInfo?.newSignature ?? foundDepSig);

				log.verbose(
					`Using delta cached stage for task ${taskName} in project ${this.#project.getName()} ` +
					`with original signature ${deltaStageCache.signature} (now ${newSignature}) ` +
					`and ${projectDeltaInfo?.changedPaths.length ?? "unknown"} changed project resource paths and ` +
					`${dependencyDeltaInfo?.changedPaths.length ?? "unknown"} changed dependency resource paths.`);

				return {
					previousStageCache: deltaStageCache,
					newSignature: newSignature,
					changedProjectResourcePaths: projectDeltaInfo?.changedPaths ?? [],
					changedDependencyResourcePaths: dependencyDeltaInfo?.changedPaths ?? []
				};
			}
		}
		return false; // Task needs to be executed
	}

	/**
	 * Attempts to find a cached stage for the given task
	 *
	 * Checks both in-memory stage cache and persistent cache storage for a matching
	 * stage signature. Returns the first matching cached stage found.
	 *
	 * @param {string} stageName Name of the stage to find
	 * @param {string[]} stageSignatures Possible signatures for the stage
	 * @returns {Promise<@ui5/project/build/cache/ProjectBuildCache~StageCacheEntry|undefined>}
	 *   Cached stage entry or undefined if not found
	 */
	async #findStageCache(stageName, stageSignatures) {
		if (!stageSignatures.length) {
			return;
		}
		// Check cache exists and ensure it's still valid before using it
		log.verbose(`Looking for cached stage for task ${stageName} in project ${this.#project.getName()} ` +
			`with ${stageSignatures.length} possible signatures:\n - ${stageSignatures.join("\n - ")}`);
		for (const stageSignature of stageSignatures) {
			const stageCache = this.#stageCache.getCacheForSignature(stageName, stageSignature);
			if (stageCache) {
				return stageCache;
			}
		}
		// TODO: If list of signatures is longer than N,
		// retrieve all available signatures from cache manager first.
		// Later maybe add a bloom filter for even larger sets
		const stageCache = await firstTruthy(stageSignatures.map(async (stageSignature) => {
			const stageMetadata = await this.#cacheManager.readStageCache(
				this.#project.getId(), this.#buildSignature, stageName, stageSignature);
			if (!stageMetadata) {
				return;
			}
			log.verbose(`Found cached stage with signature ${stageSignature}`);
			const {resourceMapping, resourceMetadata} = stageMetadata;
			let writtenResourcePaths;
			let stageReader;
			if (resourceMapping) {
				writtenResourcePaths = [];
				// Restore writer collection
				const readers = resourceMetadata.map((metadata) => {
					writtenResourcePaths.push(...Object.keys(metadata));
					return this.#createReaderForStageCache(
						stageName, stageSignature, metadata);
				});

				const writerMapping = Object.create(null);
				for (const [resourcePath, metadataIndex] of Object.entries(resourceMapping)) {
					if (!readers[metadataIndex]) {
						throw new Error(`Inconsistent stage cache: No resource metadata ` +
							`found at index ${metadataIndex} for resource ${resourcePath}`);
					}
					writerMapping[resourcePath] = readers[metadataIndex];
				}

				stageReader = createWriterCollection({
					name: `Restored cached stage ${stageName} for project ${this.#project.getName()}`,
					writerMapping,
				});
			} else {
				writtenResourcePaths = Object.keys(resourceMetadata);
				stageReader = this.#createReaderForStageCache(stageName, stageSignature, resourceMetadata);
			}
			return {
				signature: stageSignature,
				stage: stageReader,
				writtenResourcePaths,
			};
		}));
		return stageCache;
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
	 * @public
	 * @param {string} taskName Name of the executed task
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests} projectResourceRequests
	 *   Resource requests for project resources
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests|undefined} dependencyResourceRequests
	 *   Resource requests for dependency resources
	 * @param {object} cacheInfo Cache information for differential updates
	 * @param {boolean} supportsDifferentialBuilds Whether the task supports differential updates
	 * @returns {Promise<void>}
	 */
	async recordTaskResult(
		taskName, projectResourceRequests, dependencyResourceRequests, cacheInfo, supportsDifferentialBuilds
	) {
		if (!this.#taskCache.has(taskName)) {
			// Initialize task cache
			this.#taskCache.set(taskName,
				new BuildTaskCache(this.#project.getName(), taskName, supportsDifferentialBuilds));
		}
		log.verbose(`Recording results of task ${taskName} in project ${this.#project.getName()}...`);
		const taskCache = this.#taskCache.get(taskName);

		// Identify resources written by task
		const stage = this.#project.getStage();
		const stageWriter = stage.getWriter();
		const writtenResources = await stageWriter.byGlob("/**/*");
		const writtenResourcePaths = writtenResources.map((res) => res.getOriginalPath());

		let stageSignature;
		if (cacheInfo) {
			// TODO: Update
			stageSignature = cacheInfo.newSignature;
			// Add resources from previous stage cache to current stage
			let reader;
			if (cacheInfo.previousStageCache.stage.byGlob) {
				// Reader instance
				reader = cacheInfo.previousStageCache.stage;
			} else {
				// Stage instance
				reader = cacheInfo.previousStageCache.stage.getWriter() ??
					cacheInfo.previousStageCache.stage.getCachedWriter();
			}
			const previousWrittenResources = await reader.byGlob("/**/*");
			for (const res of previousWrittenResources) {
				if (!writtenResourcePaths.includes(res.getOriginalPath())) {
					await stageWriter.write(res);
				}
			}
		} else {
			// Calculate signature for executed task
			const currentSignaturePair = await taskCache.recordRequests(
				projectResourceRequests,
				dependencyResourceRequests,
				this.#currentProjectReader,
				this.#currentDependencyReader
			);
			// If provided, set dependency signature for later use in result stage signature calculation
			const stageName = this.#getStageNameForTask(taskName);
			this.#currentStageSignatures.set(stageName, currentSignaturePair);
			stageSignature = createStageSignature(...currentSignaturePair);
		}

		log.verbose(`Caching stage for task ${taskName} in project ${this.#project.getName()} ` +
			`with signature ${stageSignature}`);

		// Store resulting stage in stage cache
		this.#stageCache.addSignature(
			this.#getStageNameForTask(taskName), stageSignature, this.#project.getStage(),
			writtenResourcePaths);

		// Update task cache with new metadata
		log.verbose(`Task ${taskName} produced ${writtenResourcePaths.length} resources`);

		for (const resourcePath of writtenResourcePaths) {
			if (!this.#writtenResultResourcePaths.includes(resourcePath)) {
				this.#writtenResultResourcePaths.push(resourcePath);
			}
		}
		// Reset current project reader
		this.#currentProjectReader = null;
	}

	/**
	 * Returns the task cache for a specific task
	 *
	 * @public
	 * @param {string} taskName Name of the task
	 * @returns {@ui5/project/build/cache/BuildTaskCache|undefined}
	 *   The task cache or undefined if not found
	 */
	getTaskCache(taskName) {
		return this.#taskCache.get(taskName);
	}

	/**
	 * Records changed source files of the project and marks cache as requiring validation.
	 * This method must not be called during creation of the ProjectBuildCache or while the project is being built to
	 * avoid inconsistent result and cache corruption.
	 *
	 * @public
	 * @param {string[]} changedPaths Changed project source file paths
	 */
	projectSourcesChanged(changedPaths) {
		for (const resourcePath of changedPaths) {
			if (!this.#changedProjectSourcePaths.includes(resourcePath)) {
				this.#changedProjectSourcePaths.push(resourcePath);
			}
		}
		if (this.#combinedIndexState !== INDEX_STATES.INITIAL) {
			// If there is an index cache, mark it as requiring update
			this.#combinedIndexState = INDEX_STATES.REQUIRES_UPDATE;
		}
	}

	/**
	 * Records changed dependency resources and marks cache as requiring validation.
	 * This method must not be called during creation of the ProjectBuildCache or while the project is being built to
	 * avoid inconsistent result and cache corruption.
	 *
	 * @public
	 * @param {string[]} changedPaths Changed dependency resource paths
	 */
	dependencyResourcesChanged(changedPaths) {
		for (const resourcePath of changedPaths) {
			if (!this.#changedDependencyResourcePaths.includes(resourcePath)) {
				this.#changedDependencyResourcePaths.push(resourcePath);
			}
		}
		if (this.#combinedIndexState !== INDEX_STATES.INITIAL) {
			// If there is an index cache, mark it as requiring update
			this.#combinedIndexState = INDEX_STATES.REQUIRES_UPDATE;
		}
	}

	/**
	 * Initializes project stages for the given tasks
	 *
	 * Creates stage names for each task and initializes them in the project.
	 * This must be called before task execution begins.
	 *
	 * @public
	 * @param {string[]} taskNames Array of task names to initialize stages for
	 * @returns {Promise<void>}
	 */
	async setTasks(taskNames) {
		const stageNames = taskNames.map((taskName) => this.#getStageNameForTask(taskName));
		this.#project.initStages(stageNames);

		// TODO: Rename function? We simply use it to have a point in time right before the project is built
	}

	/**
	 * Signals that all tasks have completed and switches to the result stage
	 *
	 * This finalizes the build process by switching the project to use the
	 * final result stage containing all build outputs.
	 * Also updates the result resource index accordingly.
	 *
	 * @public
	 * @returns {Promise<string[]>} Array of changed resource paths since the last build
	 */
	async allTasksCompleted() {
		this.#project.useResultStage();
		if (this.#combinedIndexState === INDEX_STATES.INITIAL) {
			this.#combinedIndexState = INDEX_STATES.FRESH;
		}
		this.#resultCacheState = RESULT_CACHE_STATES.FRESH_AND_IN_USE;
		const changedPaths = this.#writtenResultResourcePaths;

		this.#currentResultSignature = this.#getResultStageSignature();

		// Reset updated resource paths
		this.#writtenResultResourcePaths = [];
		return changedPaths;
	}

	/**
	 * Generates the stage name for a given task
	 *
	 * @param {string} taskName Name of the task
	 * @returns {string} Stage name in the format "task/{taskName}"
	 */
	#getStageNameForTask(taskName) {
		return `task/${taskName}`;
	}

	/**
	 * Initializes the resource index from cache or creates a new one
	 *
	 * This method attempts to load a cached resource index. If found, it validates
	 * the index against current source files and invalidates affected tasks if
	 * resources have changed. If no cache exists, creates a fresh index.
	 *
	 * @returns {Promise<void>}
	 * @throws {Error} If cached index signature doesn't match computed signature
	 */
	async #initSourceIndex() {
		const sourceReader = this.#project.getSourceReader();
		const [resources, indexCache] = await Promise.all([
			await sourceReader.byGlob("/**/*"),
			await this.#cacheManager.readIndexCache(this.#project.getId(), this.#buildSignature, "source"),
		]);
		if (indexCache) {
			log.verbose(`Using cached resource index for project ${this.#project.getName()}`);
			// Create and diff resource index
			const {resourceIndex, changedPaths} =
				await ResourceIndex.fromCacheWithDelta(indexCache, resources, Date.now());

			// Import task caches
			const buildTaskCaches = await Promise.all(
				indexCache.tasks.map(async ([taskName, supportsDifferentialBuilds]) => {
					const projectRequests = await this.#cacheManager.readTaskMetadata(
						this.#project.getId(), this.#buildSignature, taskName, "project");
					if (!projectRequests) {
						throw new Error(`Failed to load project request cache for task ` +
							`${taskName} in project ${this.#project.getName()}`);
					}
					const dependencyRequests = await this.#cacheManager.readTaskMetadata(
						this.#project.getId(), this.#buildSignature, taskName, "dependencies");
					if (!dependencyRequests) {
						throw new Error(`Failed to load dependency request cache for task ` +
							`${taskName} in project ${this.#project.getName()}`);
					}
					return BuildTaskCache.fromCache(this.#project.getName(), taskName, !!supportsDifferentialBuilds,
						projectRequests, dependencyRequests);
				})
			);
			// Ensure taskCache is filled in the order of task execution
			for (const buildTaskCache of buildTaskCaches) {
				this.#taskCache.set(buildTaskCache.getTaskName(), buildTaskCache);
			}

			if (changedPaths.length) {
				// Relevant resources have changed, mark the cache as invalidated
				// this.#resultCacheState = RESULT_CACHE_STATES.INVALIDATED;
			} else {
				// Source index is up-to-date, awaiting dependency indices validation
				// Status remains at initializing
				// this.#resultCacheState = RESULT_CACHE_STATES.INITIALIZING;
				this.#cachedSourceSignature = resourceIndex.getSignature();
			}
			this.#sourceIndex = resourceIndex;
			// Since all source files are part of the result, declare any detected changes as newly written resources
			this.#writtenResultResourcePaths = changedPaths;
			// Now awaiting initialization of dependency indices
			this.#combinedIndexState = INDEX_STATES.RESTORING_DEPENDENCY_INDICES;
		} else {
			// No index cache found, create new index
			this.#sourceIndex = await ResourceIndex.create(resources, Date.now());
			this.#combinedIndexState = INDEX_STATES.INITIAL;
		}
	}

	/**
	 * Updates the source index with changed resource paths
	 *
	 * @param {string[]} changedResourcePaths Array of changed resource paths
	 * @returns {Promise<boolean>} True if changes were detected, false otherwise
	 */
	async #updateSourceIndex(changedResourcePaths) {
		const sourceReader = this.#project.getSourceReader();

		const resources = [];
		const removedResourcePaths = [];
		await Promise.all(changedResourcePaths.map(async (resourcePath) => {
			const resource = await sourceReader.byPath(resourcePath);
			if (resource) {
				resources.push(resource);
			} else {
				removedResourcePaths.push(resourcePath);
			}
		}));
		const {removed} = await this.#sourceIndex.removeResources(removedResourcePaths);
		const {added, updated} = await this.#sourceIndex.upsertResources(resources, Date.now());

		if (removed.length || added.length || updated.length) {
			log.verbose(`Source resource index for project ${this.#project.getName()} updated: ` +
				`${removed.length} removed, ${added.length} added, ${updated.length} updated resources.`);
			const changedPaths = [...removed, ...added, ...updated];
			// Since all source files are part of the result, declare any detected changes as newly written resources
			for (const resourcePath of changedPaths) {
				if (!this.#writtenResultResourcePaths.includes(resourcePath)) {
					this.#writtenResultResourcePaths.push(resourcePath);
				}
			}
			return true;
		}
		return false;
	}

	// ===== CACHE SERIALIZATION =====

	/**
	 * Stores all cache data to persistent storage
	 *
	 * This method:
	 * 1. Stores the signatures of all stages that lead to the current build result
	 * 2. Writes all pending task stage caches to persistent storage
	 * 3. Writes task request metadata to persistent storage
	 * 4. Writes the source resource index to persistent storage
	 *
	 * @public
	 * @returns {Promise<void>}
	 */
	async writeCache() {
		const cacheWriteStart = performance.now();
		await Promise.all([
			this.#writeResultCache(),

			this.#writeTaskStageCache(),
			this.#writeTaskRequestCache(),

			this.#writeSourceIndex(),
		]);
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`Wrote build cache for project ${this.#project.getName()} in ` +
				`${(performance.now() - cacheWriteStart).toFixed(2)} ms`);
		}
	}

	/**
	 * Stores the signatures of all stages that lead to the current build result. This can be used to
	 * recreate the build result
	 *
	 * @returns {Promise<void>}
	 */
	async #writeResultCache() {
		const stageSignature = this.#currentResultSignature;
		if (stageSignature === this.#cachedResultSignature) {
			// No changes to already cached result stage
			return;
		}
		log.verbose(`Storing result metadata for project ${this.#project.getName()}`);
		const stageSignatures = Object.create(null);
		for (const [stageName, stageSigs] of this.#currentStageSignatures.entries()) {
			stageSignatures[stageName] = stageSigs.join("-");
		}

		const metadata = {
			stageSignatures,
		};
		await this.#cacheManager.writeResultMetadata(
			this.#project.getId(), this.#buildSignature, stageSignature, metadata);
	}

	/**
	 * Writes all pending task stage caches to persistent storage
	 *
	 * @returns {Promise<void>}
	 */
	async #writeTaskStageCache() {
		if (!this.#stageCache.hasPendingCacheQueue()) {
			return;
		}
		// Store stage caches
		log.verbose(`Storing stage caches for project ${this.#project.getName()} ` +
			`with build signature ${this.#buildSignature}`);
		const stageQueue = this.#stageCache.flushCacheQueue();
		await Promise.all(stageQueue.map(async ([stageId, stageSignature]) => {
			const {stage} = this.#stageCache.getCacheForSignature(stageId, stageSignature);
			const writer = stage.getWriter();

			let metadata;
			if (writer.getMapping) {
				const writerMapping = writer.getMapping();
				// Ensure unique readers are used
				const readers = Array.from(new Set(Object.values(writerMapping)));
				// Map mapping entries to reader indices
				const resourceMapping = Object.create(null);
				for (const [virPath, reader] of Object.entries(writerMapping)) {
					const readerIdx = readers.indexOf(reader);
					resourceMapping[virPath] = readerIdx;
				}

				const resourceMetadata = await Promise.all(readers.map(async (reader, idx) => {
					const resources = await reader.byGlob("/**/*");

					return await this.#writeStageResources(resources, stageId, stageSignature);
				}));

				metadata = {resourceMapping, resourceMetadata};
			} else {
				const resources = await writer.byGlob("/**/*");
				const resourceMetadata = await this.#writeStageResources(resources, stageId, stageSignature);
				metadata = {resourceMetadata};
			}

			await this.#cacheManager.writeStageCache(
				this.#project.getId(), this.#buildSignature, stageId, stageSignature, metadata);
		}));
	}

	/**
	 * Writes stage resources to persistent storage and returns their metadata
	 *
	 * @param {@ui5/fs/Resource[]} resources Array of resources to write
	 * @param {string} stageId Stage identifier
	 * @param {string} stageSignature Stage signature
	 * @returns {Promise<Object<string, object>>} Resource metadata indexed by path
	 */
	async #writeStageResources(resources, stageId, stageSignature) {
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
		return resourceMetadata;
	}

	/**
	 * Writes task request metadata to persistent storage
	 *
	 * @returns {Promise<void>}
	 */
	async #writeTaskRequestCache() {
		// Store task caches
		for (const [taskName, taskCache] of this.#taskCache) {
			if (taskCache.hasNewOrModifiedCacheEntries()) {
				const [projectRequests, dependencyRequests] = taskCache.toCacheObjects();
				log.verbose(`Storing task cache metadata for task ${taskName} in project ${this.#project.getName()} ` +
					`with build signature ${this.#buildSignature}`);
				const writes = [];
				if (projectRequests) {
					writes.push(this.#cacheManager.writeTaskMetadata(
						this.#project.getId(), this.#buildSignature, taskName, "project", projectRequests));
				}
				if (dependencyRequests) {
					writes.push(this.#cacheManager.writeTaskMetadata(
						this.#project.getId(), this.#buildSignature, taskName, "dependencies", dependencyRequests));
				}
				await Promise.all(writes);
			}
		}
	}

	/**
	 * Writes the source index cache to persistent storage
	 *
	 * @returns {Promise<void>}
	 */
	async #writeSourceIndex() {
		if (this.#cachedSourceSignature === this.#sourceIndex.getSignature()) {
			// No changes to already cached result index
			return;
		}
		log.verbose(`Storing resource index cache for project ${this.#project.getName()} ` +
			`with build signature ${this.#buildSignature}`);
		const sourceIndexObject = this.#sourceIndex.toCacheObject();
		const tasks = [];
		for (const [taskName, taskCache] of this.#taskCache) {
			tasks.push([taskName, taskCache.getSupportsDifferentialBuilds() ? 1 : 0]);
		}
		await this.#cacheManager.writeIndexCache(this.#project.getId(), this.#buildSignature, "source", {
			...sourceIndexObject,
			tasks,
		});
	}

	/**
	 * Creates a proxy reader for accessing cached stage resources
	 *
	 * The reader provides virtual access to cached resources by loading them from
	 * the cache storage on demand. Resource metadata is used to validate cache entries.
	 *
	 * @param {string} stageId Identifier for the stage (e.g., "result" or "task/{taskName}")
	 * @param {string} stageSignature Signature hash of the stage
	 * @param {Object<string, object>} resourceMetadata Metadata for all cached resources
	 * @returns {@ui5/fs/AbstractReader} Proxy reader for cached resources
	 */
	#createReaderForStageCache(stageId, stageSignature, resourceMetadata) {
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
					project: this.#project,
				});
			}
		});
	}
}

/**
 * Computes the cartesian product of an array of arrays
 *
 * @param {Array<Array>} arrays Array of arrays to compute the product of
 * @returns {Array<Array>} Array of all possible combinations
 */
function cartesianProduct(arrays) {
	if (arrays.length === 0) return [[]];
	if (arrays.some((arr) => arr.length === 0)) return [];

	let result = [[]];

	for (const array of arrays) {
		const temp = [];
		for (const resultItem of result) {
			for (const item of array) {
				temp.push([...resultItem, item]);
			}
		}
		result = temp;
	}

	return result;
}

/**
 * Fast combination of two arrays into pairs
 *
 * Creates all possible pairs by combining each element from the first array
 * with each element from the second array.
 *
 * @param {Array} array1 First array
 * @param {Array} array2 Second array
 * @returns {Array<Array>} Array of two-element pairs
 */
function combineTwoArraysFast(array1, array2) {
	const len1 = array1.length;
	const len2 = array2.length;
	const result = new Array(len1 * len2);

	let idx = 0;
	for (let i = 0; i < len1; i++) {
		for (let j = 0; j < len2; j++) {
			result[idx++] = [array1[i], array2[j]];
		}
	}

	return result;
}

/**
 * Creates a combined stage signature from project and dependency signatures
 *
 * @param {string} projectSignature Project resource signature
 * @param {string} dependencySignature Dependency resource signature
 * @returns {string} Combined stage signature in format "projectSignature-dependencySignature"
 */
function createStageSignature(projectSignature, dependencySignature) {
	return `${projectSignature}-${dependencySignature}`;
}

/**
 * Creates a combined signature hash from multiple stage dependency signatures
 *
 * @param {string[]} stageDependencySignatures Array of dependency signatures to combine
 * @returns {string} SHA-256 hash of the combined signatures
 */
function createDependencySignature(stageDependencySignatures) {
	return crypto.createHash("sha256").update(stageDependencySignatures.join("")).digest("hex");
}

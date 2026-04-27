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
import {firstTruthy, matchResourceMetadataStrict} from "./utils.js";
const log = getLogger("build:cache:ProjectBuildCache");
import Cache from "./Cache.js";

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
 * @property {Map<string, Map<string, {string|number|boolean|undefined}>>} projectTagOperations
 * Map of resource paths to their tags that were set or cleared during this stage's execution, for project tags
 * @property {Map<string, Map<string, {string|number|boolean|undefined}>>} buildTagOperations
 * Map of resource paths to their tags that were set or cleared during this stage's execution, for build tags
 */

export default class ProjectBuildCache {
	#taskCache = new Map();
	#stageCache = new StageCache();
	#prefetchedStageReads;

	#project;
	#buildSignature;
	#cacheManager;
	#cacheMode;
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

	// Set of integrity hashes known to already exist in CAS from restored stage metadata.
	// Populated during the restore phase, consulted during writes to skip redundant CAS lookups.
	#knownCasIntegrities = new Set();

	// Previous build's frozen source resourceMetadata, loaded from cache during #initSourceIndex().
	// Used in #freezeUntransformedSources() to skip re-reading unchanged untransformed source files.
	// Updated after each freeze for reuse in subsequent BuildServer builds.
	#cachedFrozenSourceMetadata = null;

	#combinedIndexState = INDEX_STATES.RESTORING_PROJECT_INDICES;
	#resultCacheState = RESULT_CACHE_STATES.PENDING_VALIDATION;

	/**
	 * Creates a new ProjectBuildCache instance
	 * Use ProjectBuildCache.create() instead
	 *
	 * @param {@ui5/project/specifications/Project} project Project instance
	 * @param {string} buildSignature Build signature for the current build
	 * @param {object} cacheManager Cache manager instance for reading/writing cache data
	 * @param {string} cacheMode Cache mode to use for building UI5 projects
	 */
	constructor(project, buildSignature, cacheManager, cacheMode) {
		log.verbose(
			`ProjectBuildCache for project ${project.getName()} uses build signature ${buildSignature}`);
		this.#project = project;
		this.#buildSignature = buildSignature;
		this.#cacheManager = cacheManager;
		this.#cacheMode = cacheMode;
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
	 * @param {string} cacheMode Cache mode to use for building UI5 projects
	 * @returns {Promise<@ui5/project/build/cache/ProjectBuildCache>} Initialized cache instance
	 */
	static async create(project, buildSignature, cacheManager, cacheMode) {
		return new ProjectBuildCache(project, buildSignature, cacheManager, cacheMode);
	}

	/**
	 * Initializes the source index for this project's build cache
	 *
	 * This must be called after create() and before any cache operations that depend on the source index.
	 * Separated from create() to allow parallel initialization of multiple project caches.
	 *
	 * @public
	 * @returns {Promise<void>}
	 */
	async initSourceIndex() {
		// When cache=Off, always reinitialize to clear cached state
		if (this.#cacheMode === Cache.Off && this.#combinedIndexState !== INDEX_STATES.RESTORING_PROJECT_INDICES) {
			this.#combinedIndexState = INDEX_STATES.RESTORING_PROJECT_INDICES;
		}
		if (this.#combinedIndexState !== INDEX_STATES.RESTORING_PROJECT_INDICES) {
			// Already initialized (e.g. reused across builds)
			return;
		}
		const initStart = performance.now();
		await this.#initSourceIndex();
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`Initialized source index for project ${this.#project.getName()} ` +
				`in ${(performance.now() - initStart).toFixed(2)} ms`);
		}
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
			if (this.#changedDependencyResourcePaths.length) {
				const updateStart = performance.now();
				await this._refreshDependencyIndices(dependencyReader);
				if (log.isLevelEnabled("perf")) {
					log.perf(
						`Initialized dependency indices for project ${this.#project.getName()} ` +
						`in ${(performance.now() - updateStart).toFixed(2)} ms`);
				}
			} else if (log.isLevelEnabled("perf")) {
				log.perf(
					`Skipping dependency index refresh for project ${this.#project.getName()} ` +
					`(no dependency changes propagated)`);
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
				// Force mode: Fail immediately if changes were detected
				if (this.#cacheMode === Cache.Force) {
					throw new Error(
						`Cache is in "Force" mode but cache is stale for project ${this.#project.getName()} ` +
						`due to detected source file changes. ` +
						`Use "Default" or "ReadOnly" to trigger a rebuild.`
					);
				}
			}
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`Flushed pending changes for project ${this.#project.getName()} ` +
						`in ${(performance.now() - flushStart).toFixed(2)} ms`);
			}
			this.#combinedIndexState = INDEX_STATES.FRESH;
		}

		// When cache=Off, don't validate or use result cache
		if (this.#cacheMode === Cache.Off) {
			log.verbose(`Cache is in "Off" mode for project ${this.#project.getName()}. ` +
				`Skipping result cache validation`);
			this.#resultCacheState = RESULT_CACHE_STATES.NO_CACHE;
			return false;
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
			const sourceStart = performance.now();
			sourceIndexChanged = await this.#updateSourceIndex(this.#changedProjectSourcePaths);
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`#flushPendingChanges updateSourceIndex for project ${this.#project.getName()} ` +
					`completed in ${(performance.now() - sourceStart).toFixed(2)} ms ` +
					`(${this.#changedProjectSourcePaths.length} changed paths, changed=${sourceIndexChanged})`);
			}
		}

		let depIndicesChanged = false;
		if (this.#changedDependencyResourcePaths.length) {
			const depStart = performance.now();
			const tasksWithDepRequests = Array.from(this.#taskCache.values())
				.filter((taskCache) => taskCache.hasDependencyRequests());
			await Promise.all(tasksWithDepRequests.map(async (taskCache) => {
				const changed = await taskCache
					.updateDependencyIndices(this.#currentDependencyReader, this.#changedDependencyResourcePaths);
				if (changed) {
					depIndicesChanged = true;
				}
			}));
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`#flushPendingChanges updateDependencyIndices for project ${this.#project.getName()} ` +
					`completed in ${(performance.now() - depStart).toFixed(2)} ms ` +
					`(${this.#changedDependencyResourcePaths.length} changed paths, ` +
					`${tasksWithDepRequests.length}/${this.#taskCache.size} tasks, changed=${depIndicesChanged})`);
			}
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
		const tasksWithDepRequests = Array.from(this.#taskCache.values())
			.filter((taskCache) => taskCache.hasDependencyRequests());
		await Promise.all(tasksWithDepRequests.map(async (taskCache) => {
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
		// When cache=Off, always return false to force rebuilds
		if (this.#cacheMode === Cache.Off) {
			return false;
		}
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
		const {stageSignatures, sourceStageSignature} = resultMetadata;

		const importStagesStart = log.isLevelEnabled("perf") ? performance.now() : 0;
		const writtenResourcePaths = await this.#importStages(stageSignatures);
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`#findResultCache importStages for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - importStagesStart).toFixed(2)} ms ` +
				`with ${Object.keys(stageSignatures).length} stages`);
		}

		// Restore CAS-backed source reader from the stored source stage
		const restoreSourcesStart = log.isLevelEnabled("perf") ? performance.now() : 0;
		await this.#restoreFrozenSources(sourceStageSignature);
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`#findResultCache restoreFrozenSources for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - restoreSourcesStart).toFixed(2)} ms`);
		}

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
		if (this.#project.getProjectResources().getStage()?.getId() === "initial") {
			// Only initialize stages once
			this.#project.getProjectResources().initStages(stageNames);
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
		this.#project.getProjectResources().useResultStage();

		// When #currentStageSignatures is empty, this is the initial import from persistent cache.
		// The imported stages represent the already-cached state, not actual changes.
		// Dependents' dependency indices were restored from the same cache and already reflect these outputs.
		// Skip change propagation to avoid redundant dependency index updates in dependents.
		const isInitialImport = this.#currentStageSignatures.size === 0;

		const writtenResourcePaths = new Set();
		for (const [stageName, stageCache] of importedStages) {
			// Check whether the stage differs form the one currently in use
			if (this.#currentStageSignatures.get(stageName)?.join("-") !== stageCache.signature) {
				// Set stage
				this.#project.getProjectResources().setStage(stageName, stageCache.stage,
					stageCache.projectTagOperations, stageCache.buildTagOperations);

				// Store signature for later use in result stage signature calculation
				this.#currentStageSignatures.set(stageName, stageCache.signature.split("-"));

				if (!isInitialImport) {
					// Cached stage differs from the previous one
					// Add all resources written by the cached stage to the set of
					// written/potentially changed resources
					for (const resourcePath of stageCache.writtenResourcePaths) {
						writtenResourcePaths.add(resourcePath);
					}
				}
			}
		}

		if (log.isLevelEnabled("perf") && isInitialImport) {
			const totalPaths = importedStages.reduce((sum, [, sc]) => sum + sc.writtenResourcePaths.length, 0);
			log.perf(
				`#importStages: Initial import for project ${this.#project.getName()}, ` +
				`suppressed ${totalPaths} resource path propagations`);
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
		this.#project.getProjectResources().useStage(stageName);
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
			this.#project.getProjectResources().setStage(stageName, stageCache.stage,
				stageCache.projectTagOperations, stageCache.buildTagOperations);

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
			log.verbose(`No cached stage found for task ${taskName} in project ${this.#project.getName()}. ` +
				`Attempting to find delta cached stage...`);
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
				Array.from(depDeltas.keys()),
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

				const newProjSig = projectDeltaInfo?.newSignature ?? foundProjectSig;
				const newDepSig = dependencyDeltaInfo?.newSignature ?? foundDepSig;
				const newSignature = createStageSignature(newProjSig, newDepSig);
				this.#currentStageSignatures.set(stageName, [newProjSig, newDepSig]);

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
	 * Pre-fetches stage cache metadata from persistent storage for the given task.
	 * Results are stored internally and consumed by #findStageCache when called later.
	 *
	 * @public
	 * @param {string} taskName Task name to prefetch cache for
	 */
	prefetchStageCache(taskName) {
		const taskCache = this.#taskCache.get(taskName);
		if (!taskCache) {
			return;
		}
		const stageName = this.#getStageNameForTask(taskName);

		// Compute possible signatures from current index state
		const projectSignatures = taskCache.getProjectIndexSignatures();
		const dependencySignatures = taskCache.getDependencyIndexSignatures();
		const stageSignatures = combineTwoArraysFast(
			projectSignatures,
			dependencySignatures,
		).map((signaturePair) => {
			return createStageSignature(...signaturePair);
		});

		if (!stageSignatures.length) {
			return;
		}

		// Filter out signatures already in memory
		const uncachedSignatures = stageSignatures.filter((sig) =>
			!this.#stageCache.getCacheForSignature(stageName, sig));

		if (!uncachedSignatures.length) {
			return;
		}

		// Start reading from disk — store promises, don't await
		const prefetchMap = new Map();
		for (const sig of uncachedSignatures) {
			prefetchMap.set(sig, this.#cacheManager.readStageCache(
				this.#project.getId(), this.#buildSignature, stageName, sig));
		}
		this.#prefetchedStageReads = this.#prefetchedStageReads ?? new Map();
		this.#prefetchedStageReads.set(stageName, prefetchMap);
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

		// Check prefetched data
		const prefetchMap = this.#prefetchedStageReads?.get(stageName);
		if (prefetchMap) {
			this.#prefetchedStageReads.delete(stageName);
			for (const stageSignature of stageSignatures) {
				const promise = prefetchMap.get(stageSignature);
				if (promise) {
					const stageMetadata = await promise;
					if (stageMetadata) {
						log.verbose(`Found prefetched cached stage for task ${stageName} ` +
							`with signature ${stageSignature}`);
						return this.#processStageCacheMetadata(stageName, stageSignature, stageMetadata);
					}
				}
			}
			// Filter out already-checked signatures from disk lookup
			stageSignatures = stageSignatures.filter((sig) => !prefetchMap.has(sig));
			if (!stageSignatures.length) {
				return;
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
			log.verbose(`Found cached stage for task ${stageName} with signature ${stageSignature}`);
			return this.#processStageCacheMetadata(stageName, stageSignature, stageMetadata);
		}));
		return stageCache;
	}

	/**
	 * Processes stage cache metadata into a stage cache entry
	 *
	 * @param {string} stageName Name of the stage
	 * @param {string} stageSignature Signature of the stage
	 * @param {object} stageMetadata Raw metadata from cache
	 * @returns {object} Stage cache entry
	 */
	#processStageCacheMetadata(stageName, stageSignature, stageMetadata) {
		const {resourceMapping, resourceMetadata, projectTagOperations, buildTagOperations} = stageMetadata;
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

		this.#collectKnownIntegrities(resourceMetadata);

		return {
			signature: stageSignature,
			stage: stageReader,
			writtenResourcePaths,
			projectTagOperations: tagOpsToMap(projectTagOperations),
			buildTagOperations: tagOpsToMap(buildTagOperations),
		};
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
		const recordStart = performance.now();
		if (!this.#taskCache.has(taskName)) {
			// Initialize task cache
			this.#taskCache.set(taskName,
				new BuildTaskCache(this.#project.getName(), taskName, supportsDifferentialBuilds));
		}
		log.verbose(`Recording results of task ${taskName} in project ${this.#project.getName()}...`);
		const taskCache = this.#taskCache.get(taskName);

		// Identify resources written by task
		const stage = this.#project.getProjectResources().getStage();
		const stageWriter = stage.getWriter();
		const writtenResources = await stageWriter.byGlob("/**/*");
		const writtenResourcePaths = writtenResources.map((res) => res.getOriginalPath());
		let {projectTagOperations, buildTagOperations} =
			this.#project.getProjectResources().getResourceTagOperations();

		let stageSignature;
		if (cacheInfo) {
			// Merge tag operations from the previous stage cache with the current delta's tag operations.
			// Delta builds only record tags set during the delta execution, so we need to include
			// tags from the original full build. Current delta ops take precedence over previous ops.
			if (cacheInfo.previousStageCache.projectTagOperations) {
				projectTagOperations = new Map([
					...cacheInfo.previousStageCache.projectTagOperations,
					...projectTagOperations,
				]);
			}
			if (cacheInfo.previousStageCache.buildTagOperations) {
				buildTagOperations = new Map([
					...cacheInfo.previousStageCache.buildTagOperations,
					...buildTagOperations,
				]);
			}

			// Import the previous stage cache's tag operations into the tag collections so that
			// subsequent tasks can access them. Delta builds only record tags set during delta
			// execution, so the previous build's tags must be imported explicitly.
			this.#project.getProjectResources().importTagOperations(
				cacheInfo.previousStageCache.projectTagOperations,
				cacheInfo.previousStageCache.buildTagOperations);

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
			const mergeStart = performance.now();
			const previousWrittenResources = await reader.byGlob("/**/*");
			let mergedCount = 0;
			for (const res of previousWrittenResources) {
				if (!writtenResourcePaths.includes(res.getOriginalPath())) {
					await stageWriter.write(res);
					mergedCount++;
				}
			}
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`recordTaskResult delta merge for task ${taskName} ` +
					`in project ${this.#project.getName()} completed in ` +
					`${(performance.now() - mergeStart).toFixed(2)} ms ` +
					`(${previousWrittenResources.length} previous, ${mergedCount} merged)`);
			}
		} else {
			// Calculate signature for executed task
			const recordReqStart = performance.now();
			const currentSignaturePair = await taskCache.recordRequests(
				projectResourceRequests,
				dependencyResourceRequests,
				this.#currentProjectReader,
				this.#currentDependencyReader
			);
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`recordTaskResult recordRequests for task ${taskName} ` +
					`in project ${this.#project.getName()} completed in ` +
					`${(performance.now() - recordReqStart).toFixed(2)} ms`);
			}
			// If provided, set dependency signature for later use in result stage signature calculation
			const stageName = this.#getStageNameForTask(taskName);
			this.#currentStageSignatures.set(stageName, currentSignaturePair);
			stageSignature = createStageSignature(...currentSignaturePair);
		}

		log.verbose(`Caching stage for task ${taskName} in project ${this.#project.getName()} ` +
			`with signature ${stageSignature}`);

		// Store resulting stage in stage cache
		this.#stageCache.addSignature(
			this.#getStageNameForTask(taskName), stageSignature, this.#project.getProjectResources().getStage(),
			writtenResourcePaths, projectTagOperations, buildTagOperations);

		// Update task cache with new metadata
		log.verbose(`Task ${taskName} produced ${writtenResourcePaths.length} resources`);

		for (const resourcePath of writtenResourcePaths) {
			if (!this.#writtenResultResourcePaths.includes(resourcePath)) {
				this.#writtenResultResourcePaths.push(resourcePath);
			}
		}
		// Reset current project reader
		this.#currentProjectReader = null;
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`recordTaskResult for task ${taskName} in project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - recordStart).toFixed(2)} ms ` +
				`(${writtenResourcePaths.length} written resources, delta=${!!cacheInfo})`);
		}
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
		this.#project.getProjectResources().initStages(stageNames);

		// TODO: Rename function? We simply use it to have a point in time right before the project is built
	}

	/**
	 * Re-reads all source files from disk and compares them against the source index
	 * to detect whether any source files were modified, added, or deleted during the build.
	 *
	 * Uses metadata-only comparison via matchResourceMetadataStrict (skipping tags,
	 * since tags are build artifacts that always differ from fresh disk reads).
	 *
	 * @returns {Promise<boolean>} True if source changes were detected during the build
	 */
	async #revalidateSourceIndex() {
		const sourceReader = this.#project.getSourceReader();
		const globStart = performance.now();
		const currentResources = await sourceReader.byGlob("/**/*");
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`#revalidateSourceIndex byGlob for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - globStart).toFixed(2)} ms ` +
				`(${currentResources.length} resources)`);
		}

		const tree = this.#sourceIndex.getTree();
		const indexedPaths = new Set(this.#sourceIndex.getResourcePaths());
		const currentPaths = new Set();

		for (const resource of currentResources) {
			const resourcePath = resource.getPath();
			currentPaths.add(resourcePath);

			const node = tree.getResourceByPath(resourcePath);
			if (!node) {
				// File was added during the build
				log.verbose(`Source file added during build: ${resourcePath}`);
				return true;
			}

			const cachedMetadata = {
				integrity: node.integrity,
				lastModified: node.lastModified,
				size: node.size,
				inode: node.inode,
			};
			const isUnchanged = await matchResourceMetadataStrict(
				resource, cachedMetadata, tree.getIndexTimestamp()
			);
			if (!isUnchanged) {
				// File was modified during the build
				log.verbose(`Source file modified during build: ${resourcePath}`);
				return true;
			}
		}

		// Check for removed files
		for (const indexedPath of indexedPaths) {
			if (!currentPaths.has(indexedPath)) {
				log.verbose(`Source file removed during build: ${indexedPath}`);
				return true;
			}
		}

		return false;
	}

	/**
	 * Write untransformed source files (not overlayed by any build task) to the CAS
	 * and persist their metadata in the stage cache.
	 *
	 * This enables downstream projects to read dependency source files from the CAS
	 * snapshot instead of the live filesystem, preventing race conditions from source
	 * changes between project builds.
	 *
	 * In subsequent builds where the source index signature hasn't changed, the stored
	 * metadata can be used to recreate a CAS-backed reader without rebuilding the dependency.
	 */
	async #freezeUntransformedSources() {
		const transformedPaths = new Set(this.#writtenResultResourcePaths);
		const untransformedPaths = this.#sourceIndex.getResourcePaths()
			.filter((p) => !transformedPaths.has(p));

		if (untransformedPaths.length === 0) {
			log.verbose(
				`All source files of project ${this.#project.getName()} are overlayed by build tasks`);
			this.#cachedFrozenSourceMetadata = null;
			return;
		}

		const sourceSignature = this.#sourceIndex.getSignature();
		const previousMetadata = this.#cachedFrozenSourceMetadata;

		let resourceMetadata;
		if (previousMetadata) {
			// Delta path: reuse previous metadata for unchanged untransformed paths
			const pathsToRead = [];
			const reusedMetadata = Object.create(null);
			for (const p of untransformedPaths) {
				if (previousMetadata[p]) {
					reusedMetadata[p] = previousMetadata[p];
				} else {
					pathsToRead.push(p);
				}
			}

			if (pathsToRead.length === 0) {
				// Fast path: all metadata reused from previous build
				resourceMetadata = reusedMetadata;
				if (log.isLevelEnabled("perf")) {
					log.perf(
						`#freezeUntransformedSources for project ${this.#project.getName()}: ` +
						`reused all ${untransformedPaths.length} entries from previous metadata`);
				}
			} else {
				// Delta path: read only new/newly-untransformed paths
				const sourceReader = this.#project.getSourceReader();
				const readStart = log.isLevelEnabled("perf") ? performance.now() : 0;
				const resources = await Promise.all(pathsToRead.map(async (resourcePath) => {
					const resource = await sourceReader.byPath(resourcePath);
					if (!resource) {
						throw new Error(
							`Source file ${resourcePath} not found during CAS freeze ` +
							`for project ${this.#project.getName()}`);
					}
					return resource;
				}));
				if (log.isLevelEnabled("perf")) {
					log.perf(
						`#freezeUntransformedSources byPath reads for project ${this.#project.getName()} ` +
						`completed in ${(performance.now() - readStart).toFixed(2)} ms ` +
						`(${resources.length} of ${untransformedPaths.length} resources)`);
				}

				const writeStart = log.isLevelEnabled("perf") ? performance.now() : 0;
				const deltaMetadata = await this.#writeStageResources(
					resources, "source", sourceSignature, this.#knownCasIntegrities);
				if (log.isLevelEnabled("perf")) {
					log.perf(
						`#freezeUntransformedSources writeStageResources for project ` +
						`${this.#project.getName()} ` +
						`completed in ${(performance.now() - writeStart).toFixed(2)} ms`);
				}

				// Merge: reused entries + delta entries
				resourceMetadata = reusedMetadata;
				for (const [path, meta] of Object.entries(deltaMetadata)) {
					resourceMetadata[path] = meta;
				}
			}
		} else {
			// Cold cache: read all untransformed sources (no previous metadata available)
			const sourceReader = this.#project.getSourceReader();
			const readStart = log.isLevelEnabled("perf") ? performance.now() : 0;
			const resources = await Promise.all(untransformedPaths.map(async (resourcePath) => {
				const resource = await sourceReader.byPath(resourcePath);
				if (!resource) {
					throw new Error(
						`Source file ${resourcePath} not found during CAS freeze ` +
						`for project ${this.#project.getName()}`);
				}
				return resource;
			}));
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`#freezeUntransformedSources byPath reads for project ${this.#project.getName()} ` +
					`completed in ${(performance.now() - readStart).toFixed(2)} ms ` +
					`(${resources.length} resources)`);
			}

			const writeStart = log.isLevelEnabled("perf") ? performance.now() : 0;
			resourceMetadata = await this.#writeStageResources(
				resources, "source", sourceSignature, this.#knownCasIntegrities);
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`#freezeUntransformedSources writeStageResources for project ` +
					`${this.#project.getName()} ` +
					`completed in ${(performance.now() - writeStart).toFixed(2)} ms`);
			}
		}

		this.#collectKnownIntegrities(resourceMetadata);

		// Persist source stage metadata in the stage cache
		await this.#cacheManager.writeStageCache(
			this.#project.getId(), this.#buildSignature, "source", sourceSignature,
			{resourceMetadata});

		log.verbose(
			`Stored ${untransformedPaths.length} untransformed source files of project ` +
			`${this.#project.getName()} in CAS with signature ${sourceSignature}`);

		// Create CAS-backed proxy reader for the untransformed source files
		const casSourceReader = this.#createReaderForStageCache("source", sourceSignature, resourceMetadata);
		this.#project.getProjectResources().setFrozenSourceReader(casSourceReader);

		// Retain for potential reuse in subsequent BuildServer builds
		this.#cachedFrozenSourceMetadata = resourceMetadata;
	}

	/**
	 * Restores the CAS-backed reader for untransformed source files from a previous build's
	 * cached stage metadata.
	 *
	 * @param {string} sourceStageSignature The source index signature used when the source
	 *   stage was persisted
	 */
	async #restoreFrozenSources(sourceStageSignature) {
		const stageMetadata = await this.#cacheManager.readStageCache(
			this.#project.getId(), this.#buildSignature, "source", sourceStageSignature);

		if (!stageMetadata) {
			log.verbose(
				`No cached source stage metadata found for project ${this.#project.getName()} ` +
				`with signature ${sourceStageSignature}. Skipping frozen source restore.`);
			return;
		}

		const {resourceMetadata} = stageMetadata;
		this.#collectKnownIntegrities(resourceMetadata);
		log.verbose(
			`Restored frozen source files for project ${this.#project.getName()} from CAS`);

		const casSourceReader = this.#createReaderForStageCache(
			"source", sourceStageSignature, resourceMetadata);

		this.#project.getProjectResources().setFrozenSourceReader(casSourceReader);
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
	 * @throws {Error} If source files were modified during the build
	 */
	async allTasksCompleted() {
		const allTasksStart = performance.now();
		this.#project.getProjectResources().useResultStage();

		const revalidateStart = performance.now();
		const sourceChangedDuringBuild = await this.#revalidateSourceIndex();
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`allTasksCompleted #revalidateSourceIndex for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - revalidateStart).toFixed(2)} ms ` +
				`(changed=${sourceChangedDuringBuild})`);
		}
		if (sourceChangedDuringBuild) {
			throw new Error(
				`Detected changes to source files of project ${this.#project.getName()} during the build. ` +
				`The build result may be inconsistent and will not be used. ` +
				`Build cache has not been updated.`);
		}

		// Write untransformed source files to CAS for downstream consumer protection
		const freezeStart = performance.now();
		await this.#freezeUntransformedSources();
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`allTasksCompleted #freezeUntransformedSources for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - freezeStart).toFixed(2)} ms`);
		}

		if (this.#combinedIndexState === INDEX_STATES.INITIAL) {
			this.#combinedIndexState = INDEX_STATES.FRESH;
		}
		this.#resultCacheState = RESULT_CACHE_STATES.FRESH_AND_IN_USE;
		const changedPaths = this.#writtenResultResourcePaths;

		this.#currentResultSignature = this.#getResultStageSignature();

		// Reset updated resource paths
		this.#writtenResultResourcePaths = [];
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`allTasksCompleted for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - allTasksStart).toFixed(2)} ms ` +
				`(${changedPaths.length} changed paths)`);
		}
		return changedPaths;
	}

	buildFinished() {
		this.#project.getProjectResources().buildFinished();
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

		if (this.#cacheMode === Cache.Off) {
			// Caching disabled: Create fresh index
			log.verbose(`Cache is in "Off" mode. ` +
				`Initializing fresh source index for project ${this.#project.getName()}`);
			this.#sourceIndex = await ResourceIndex.create(await sourceReader.byGlob("/**/*"),
				Date.now());
			this.#combinedIndexState = INDEX_STATES.INITIAL;
			// Clear any existing task cache from previous builds
			this.#taskCache.clear();
			this.#stageCache = new StageCache();
			// Reset ProjectResources to initial stage if it exists (clear any cached result stage)
			const currentStage = this.#project.getProjectResources().getStage();
			if (currentStage && currentStage.getId() !== "initial") {
				this.#project.getProjectResources().useStage("initial");

				// try {
				// 	this.#project.getProjectResources().useStage("initial");
				// } catch (err) {
				// 	console.log(`[DEBUG ProjectBuildCache] Could not reset to initial stage: ${err.message}`);
				// }
			}
			return;
		}

		const [resources, indexCache] = await Promise.all([
			await sourceReader.byGlob("/**/*"),
			await this.#cacheManager.readIndexCache(this.#project.getId(), this.#buildSignature, "source"),
		]);
		if (indexCache) {
			log.verbose(`Using cached resource index for project ${this.#project.getName()}`);
			// Create and diff resource index
			const {resourceIndex, changedPaths} =
				await ResourceIndex.fromCacheWithDelta(indexCache, resources, Date.now());

			// Pre-populate knownCasIntegrities from the previous build's frozen source stage.
			// The source stage metadata records which resources were actually written to CAS
			// by the previous build's #freezeUntransformedSources. Using this instead of the
			// source index tree ensures we only skip CAS writes for resources that genuinely
			// exist in CAS (the tree may contain integrities from newly added or modified files
			// that were never written to CAS).
			const cachedSourceSignature = indexCache.indexTree.root.hash;
			if (cachedSourceSignature) {
				const sourceStageMetadata = await this.#cacheManager.readStageCache(
					this.#project.getId(), this.#buildSignature, "source", cachedSourceSignature);
				if (sourceStageMetadata?.resourceMetadata) {
					this.#collectKnownIntegrities(sourceStageMetadata.resourceMetadata);
					this.#cachedFrozenSourceMetadata = sourceStageMetadata.resourceMetadata;
				}
			}

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

			// Force mode: Fail if cache is stale (source files changed OR pending changes exist)
			if (this.#cacheMode === Cache.Force &&
				(changedPaths.length > 0 || this.#changedProjectSourcePaths.length > 0)) {
				const totalChanges = changedPaths.length + this.#changedProjectSourcePaths.length;
				throw new Error(
					`Cache is in "Force" mode but cache is stale for project ${this.#project.getName()} ` +
					`due to ${totalChanges} changed source file(s). ` +
					`Use "Default" or "ReadOnly" to trigger a rebuild.`
				);
			}

			if (!changedPaths.length) {
				// Source index is up-to-date with no changes
				this.#cachedSourceSignature = resourceIndex.getSignature();
			}
			this.#sourceIndex = resourceIndex;
			// Since all source files are part of the result, declare any detected changes as newly written resources
			this.#writtenResultResourcePaths = changedPaths;
			// Now awaiting initialization of dependency indices
			this.#combinedIndexState = INDEX_STATES.RESTORING_DEPENDENCY_INDICES;
		} else {
			if (this.#cacheMode === Cache.Force) {
				throw new Error(`Cache is in "Force" mode but no cache found for project ${this.#project.getName()}. ` +
					`Use "Default" or "ReadOnly" to trigger a rebuild.`);
			}
			// No index cache found, create new index
			this.#sourceIndex = await ResourceIndex.create(resources, Date.now());
			this.#combinedIndexState = INDEX_STATES.INITIAL;
		}
		log.verbose(
			`Initialized source index for project ${this.#project.getName()} ` +
			`with signature ${this.#sourceIndex.getSignature()}`);
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
				`${removed.length} removed, ${added.length} added, ${updated.length} updated resources. ` +
				`New signature: ${this.#sourceIndex.getSignature()}`);
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
		// OFF or ReadOnly modes: Skip all cache writes
		if (this.#cacheMode === Cache.Off || this.#cacheMode === Cache.ReadOnly) {
			log.verbose(
				`Skipping cache write for project ${this.#project.getName()} ` +
				`(cache mode: ${this.#cacheMode})`
			);
			return;
		}

		// Default and Force modes: Write cache normally
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
		log.verbose(`Storing result metadata for project ${this.#project.getName()} ` +
			`using result stage signature ${stageSignature}`);
		const stageSignatures = Object.create(null);
		for (const [stageName, stageSigs] of this.#currentStageSignatures.entries()) {
			stageSignatures[stageName] = stageSigs.join("-");
		}

		const metadata = {
			stageSignatures,
			sourceStageSignature: this.#sourceIndex.getSignature(),
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
			const {stage, projectTagOperations, buildTagOperations} =
				this.#stageCache.getCacheForSignature(stageId, stageSignature);
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

					return await this.#writeStageResources(
						resources, stageId, stageSignature, this.#knownCasIntegrities);
				}));
				this.#collectKnownIntegrities(resourceMetadata);

				metadata = {resourceMapping, resourceMetadata};
			} else {
				const resources = await writer.byGlob("/**/*");
				const resourceMetadata = await this.#writeStageResources(
					resources, stageId, stageSignature, this.#knownCasIntegrities);
				this.#collectKnownIntegrities(resourceMetadata);
				metadata = {resourceMetadata};
			}
			metadata.projectTagOperations = tagOpsToObject(projectTagOperations);
			metadata.buildTagOperations = tagOpsToObject(buildTagOperations);
			await this.#cacheManager.writeStageCache(
				this.#project.getId(), this.#buildSignature, stageId, stageSignature, metadata);
		}));
	}

	/**
	 * Extracts integrity hashes from resource metadata and adds them to the known CAS set.
	 * Handles both the array form (WriterCollection stages) and the plain object form.
	 *
	 * @param {Object<string, object>|Array<Object<string, object>>} resourceMetadata
	 */
	#collectKnownIntegrities(resourceMetadata) {
		const metadataObjects = Array.isArray(resourceMetadata) ?
			resourceMetadata : [resourceMetadata];
		for (const metadataObj of metadataObjects) {
			for (const meta of Object.values(metadataObj)) {
				if (meta.integrity) {
					this.#knownCasIntegrities.add(meta.integrity);
				}
			}
		}
	}

	/**
	 * Writes stage resources to persistent storage and returns their metadata
	 *
	 * @param {@ui5/fs/Resource[]} resources Array of resources to write
	 * @param {string} stageId Stage identifier
	 * @param {string} stageSignature Stage signature
	 * @param {Set<string>} [knownCasIntegrities] Set of integrity hashes known to exist in CAS
	 * @returns {Promise<Object<string, object>>} Resource metadata indexed by path
	 */
	async #writeStageResources(resources, stageId, stageSignature, knownCasIntegrities) {
		const resourceMetadata = Object.create(null);
		let casSkipped = 0;
		await Promise.all(resources.map(async (res) => {
			const integrity = await res.getIntegrity();

			// Skip CAS write if integrity is known to already exist from restored stage metadata
			if (knownCasIntegrities?.has(integrity)) {
				casSkipped++;
			} else {
				await this.#cacheManager.writeStageResource(res);
			}

			resourceMetadata[res.getOriginalPath()] = {
				inode: res.getInode(),
				lastModified: res.getLastModified(),
				size: await res.getSize(),
				integrity,
			};
		}));
		if (log.isLevelEnabled("perf") && casSkipped > 0) {
			log.perf(
				`#writeStageResources for stage ${stageId}: ` +
				`${casSkipped} CAS skipped, ${resources.length - casSkipped} CAS written`);
		}
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
				log.verbose(`Storing task cache metadata for task ${taskName} in project ${this.#project.getName()}`);
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
				if (!(virPath in resourceMetadata)) {
					return null;
				}
				const {lastModified, size, integrity, inode} = resourceMetadata[virPath];
				if (size === undefined || lastModified === undefined ||
					integrity === undefined) {
					throw new Error(`Incomplete metadata for resource ${virPath} of task ${stageId} ` +
						`in project ${this.#project.getName()}`);
				}

				// Compute the CAS content path synchronously from the integrity hash.
				// No I/O needed — the path is a pure function of the integrity.
				const cachePath = this.#cacheManager.contentPath(integrity);

				return createResource({
					path: virPath,
					sourceMetadata: {
						adapter: "CAS",
						fsPath: cachePath,
						contentModified: false,
					},
					createStream: () => {
						return fs.createReadStream(cachePath).pipe(createGunzip());
					},
					createBuffer: async () => {
						const compressedBuffer = await readFile(cachePath);
						return await promisify(gunzip)(compressedBuffer);
					},
					byteSize: size,
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

function tagOpsToMap(tagOps) {
	const map = new Map();
	for (const [resourcePath, tags] of Object.entries(tagOps)) {
		map.set(resourcePath, new Map(Object.entries(tags)));
	}
	return map;
}

/**
 * @param {Map<string, Map<string, {string|number|boolean|undefined}>>} tagOps
 * Map of resource paths to their tag operations
 */
function tagOpsToObject(tagOps) {
	const obj = Object.create(null);
	for (const [resourcePath, tags] of tagOps.entries()) {
		obj[resourcePath] = Object.fromEntries(tags.entries());
	}
	return obj;
}

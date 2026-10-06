import {createResource, createProxy, createWriterCollection} from "@ui5/fs/resourceFactory";
import {getLogger} from "@ui5/logger";
import {gzip} from "node:zlib";
import {Readable} from "node:stream";
import crypto from "node:crypto";
import os from "node:os";
import BuildStageCache from "./BuildStageCache.js";
import StageCache from "./StageCache.js";
import ResourceIndex from "./index/ResourceIndex.js";
import {createStageSignature, splitStageSignature, STAGE_SIG_DEPENDENCY_INDEX} from "./stageSignature.js";
import {isResourceUnchanged} from "./utils.js";
const log = getLogger("build:cache:ProjectBuildCache");
import Cache from "./Cache.js";

export class SourceChangedDuringBuildError extends Error {
	constructor(projectName) {
		super(
			`Detected changes to source files of project ${projectName} during the build. ` +
			`The build result may be inconsistent and will not be used. ` +
			`Build cache has not been updated.`);
		this.name = "SourceChangedDuringBuildError";
	}
}

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
 * @property {Map<string, Map<string, *>>} projectTagOperations
 * Map of resource paths to their tags that were set or cleared during this stage's execution, for project tags
 * @property {Map<string, Map<string, *>>} buildTagOperations
 * Map of resource paths to their tags that were set or cleared during this stage's execution, for build tags
 * @property {Map<string, object>} [stepInvocationData] A step-based stage's per-key invocation data,
 * restored from the same cache row as the stage output so the two stay paired under one signature
 */

export default class ProjectBuildCache {
	#stageCaches = new Map();
	#stageCache = new StageCache();
	// Stage ids in execution order, as established by setTasks.
	#stageOrder = [];

	#project;
	#buildSignature;
	#cacheManager;
	#cacheMode;
	#resolveInputValue;
	#currentProjectReader;
	#currentDependencyReader;
	#sourceIndex;
	#cachedSourceSignature;
	#currentStageSignatures = new Map();
	#cachedResultSignature;
	#currentResultSignature;

	// Aggregated root resource signature established when the cache was last validated or built in this
	// session. A mismatch on the next validateCache means a root file (a tsconfig.json, a bundled
	// node_modules package) changed since, forcing result-cache revalidation even when no source or
	// dependency resource changed (root files are not reported through the incremental change signal).
	#cachedRootAggregateSignature;

	// Dependency-set identity: a hash over the project's transitive dependency ids, computed by the
	// caller from the graph and passed into validateCache. #cachedDependencySetIdentity is restored
	// from the persisted source index, #currentDependencySetIdentity reflects the current graph. A
	// mismatch means a dependency was added to or removed from the set since the last build even
	// though no dependency resource changed, and forces a full dependency-index refresh.
	#cachedDependencySetIdentity;
	#currentDependencySetIdentity;

	// Pending changes
	#changedProjectSourcePaths = [];
	#changedDependencyResourcePaths = [];
	// Written result paths, consumed in insertion order by updateProjectIndices. The parallel Set is
	// the membership index: the list grows to the project's full written-resource count and is appended
	// to once per written resource per stage, so an Array.includes membership test would be O(n squared).
	#writtenResultResourcePaths = [];
	#writtenResultResourcePathSet = new Set();

	// Set of integrity hashes known to already exist in CAS from restored stage metadata.
	// Populated during the restore phase, consulted during writes to skip redundant CAS lookups.
	#knownCasIntegrities = new Set();

	// Previous build's frozen source resourceMetadata, loaded from cache during #initSourceIndex().
	// Used in #freezeUntransformedSources() to skip re-reading unchanged untransformed source files.
	// Updated after each freeze for reuse in subsequent BuildServer builds.
	#cachedFrozenSourceMetadata = null;

	#combinedIndexState = INDEX_STATES.RESTORING_PROJECT_INDICES;
	#resultCacheState = RESULT_CACHE_STATES.PENDING_VALIDATION;

	// Per-stage step-runner invocation data (see lib/build/helpers/StepRunner.js), keyed by stage id.
	// Each value is a Map of key identity -> {reads, dependencyReads, writes, inputs, needsInputs,
	// tagOperations, returns} recorded during the stage's last run. It lets a delta build map a changed
	// input back to the key that read it, fold newly-observed reads into the stage's request graph, drop
	// outputs a key no longer produces, and rebuild a cached key's returned resource(s) from the CAS.
	//
	// The persisted copy travels inside the stage's own stage_metadata row (keyed by stage signature,
	// see #prepareStageCache / #processStageCacheMetadata), so the per-key map can never pair with a
	// different run's stage output. This map is the per-build working copy: a cache lookup stashes the
	// matched stage's map here (prepareStageExecutionAndValidateCache) so getStepInvocationData returns
	// the signature-matched "previous" data, and a stage that re-records overwrites it via
	// setStepInvocationData.
	#stepInvocationData = new Map();

	// Compressed CAS rows for resources returned by the step runner, buffered per unit and flushed in
	// one transaction per step via the return value store's flush() (see #flushStepReturns).
	#pendingStepReturnCasRows = [];

	/**
	 * Creates a new ProjectBuildCache instance
	 *
	 * After construction, call {@link #initSourceIndex} before any cache operations that depend on
	 * the source index.
	 *
	 * @public
	 * @param {@ui5/project/specifications/Project} project Project instance
	 * @param {string} buildSignature Build signature for the current build
	 * @param {object|null} cacheManager Cache manager instance for reading/writing cache data
	 * @param {string} cacheMode Cache mode to use for building UI5 projects
	 * @param {function(string, string): (string|undefined)} [resolveInputValue]
	 *   Resolver for the current value of a recorded non-resource task input, given its type and
	 *   name. Provided by the ProjectBuildContext (which can reach the project graph). When omitted,
	 *   only environment-variable inputs are re-read (from <code>process.env</code>).
	 */
	constructor(project, buildSignature, cacheManager, cacheMode, resolveInputValue) {
		log.verbose(
			`ProjectBuildCache for project ${project.getName()} uses build signature ${buildSignature}`);
		this.#project = project;
		this.#buildSignature = buildSignature;
		this.#cacheManager = cacheManager;
		this.#cacheMode = cacheMode;
		this.#resolveInputValue = resolveInputValue;
	}

	/**
	 * Initializes the source index for this project's build cache
	 *
	 * This must be called after construction and before any cache operations that depend on the
	 * source index. Separated from the constructor to allow parallel initialization of multiple
	 * project caches.
	 *
	 * @public
	 * @returns {Promise<void>}
	 */
	async initSourceIndex() {
		// When cache=Off, always reinitialize to clear cached state
		if (this.#cacheMode === Cache.Off) {
			return;
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
	 * Validates the current build cache state.
	 *
	 * Flushes any pending source/dependency changes, refreshes dependency indices on first use,
	 * and attempts to locate a cached result stage. Safe to call independently of a build attempt
	 * (e.g. to check whether the cache is stale).
	 *
	 * When `prepareForBuild` is true, additionally performs the side effects required before a
	 * project build: discards any in-memory StageCache entries left over from a prior aborted
	 * build (successful builds flush the queue in writeCache, so this is a no-op in the common
	 * case) and captures the current project and dependency readers for later use by
	 * recordStageResult.
	 *
	 * @public
	 * @param {@ui5/fs/AbstractReader} dependencyReader Reader for dependency resources, used to
	 *   refresh dependency indices when required
	 * @param {object} [options]
	 * @param {boolean} [options.prepareForBuild=false] Run the pre-build side effects before
	 *   validating (see method description)
	 * @param {string} [options.dependencySetIdentity] Hash identifying the current dependency set
	 *   (see {@link @ui5/project/build/helpers/ProjectBuildContext#getDependencySetIdentity}).
	 *   Compared against the identity persisted with the previous build's source index; a mismatch
	 *   forces a dependency-index refresh even when no dependency resource change was propagated.
	 * @returns {Promise<string[]|boolean>}
	 *  Array of changed resource paths since last build, true if cache is fresh, false
	 *  if cache is empty
	 */
	async validateCache(dependencyReader, {prepareForBuild = false, dependencySetIdentity} = {}) {
		this.#currentDependencySetIdentity = dependencySetIdentity;
		if (prepareForBuild) {
			this.#stageCache.discardPending();
			this.#currentProjectReader = this.#project.getReader();
			this.#currentDependencyReader = dependencyReader;
		}
		// When cache=Off, don't validate or use result cache
		if (this.#cacheMode === Cache.Off) {
			log.verbose(`Cache is in "Off" mode for project ${this.#project.getName()}. ` +
				`Skipping result cache validation`);
			this.#resultCacheState = RESULT_CACHE_STATES.NO_CACHE;
			return false;
		}

		if (this.#combinedIndexState === INDEX_STATES.INITIAL) {
			log.verbose(`Project ${this.#project.getName()} has an empty index cache, skipping change processing.`);
			return false;
		}

		if (this.#combinedIndexState === INDEX_STATES.RESTORING_DEPENDENCY_INDICES) {
			// A refresh is required when a dependency resource changed (accumulator non-empty) or
			// when the dependency set itself changed since the last build. The latter is not
			// reported through dependencyResourcesChanged(), so it would otherwise be missed and the
			// restored indices would keep reflecting the previous build's dependency set.
			const dependencySetChanged =
				this.#currentDependencySetIdentity !== this.#cachedDependencySetIdentity;
			if (this.#changedDependencyResourcePaths.length || dependencySetChanged) {
				const updateStart = performance.now();
				await this._refreshDependencyIndices(dependencyReader);
				if (log.isLevelEnabled("perf")) {
					log.perf(
						`Initialized dependency indices for project ${this.#project.getName()} ` +
						`in ${(performance.now() - updateStart).toFixed(2)} ms ` +
						`(dependencySetChanged=${dependencySetChanged})`);
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
			const changesDetected = await this.#flushPendingChanges(dependencyReader);
			if (changesDetected) {
				this.#resultCacheState = RESULT_CACHE_STATES.PENDING_VALIDATION;
				// Force mode: Fail immediately if changes were detected
				if (this.#cacheMode === Cache.Force) {
					throw new Error(
						`Cache is in "Force" mode but cache is stale for project ${this.#project.getName()} ` +
						`due to detected source file changes. ` +
						`Use "Default", "ReadOnly" or "Off" to rebuild.`
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

		// Root resources (a tsconfig.json, third-party packages a task bundles from node_modules) live
		// outside the source and dependency readers and are not reported through the incremental change
		// signal. Refresh their indices against the current project root and, if their aggregate
		// signature moved since the cache was last validated, force result-cache revalidation so a root
		// change is not skipped when no source or dependency resource changed.
		if (this.#combinedIndexState === INDEX_STATES.FRESH && this.#anyTaskHasRootRequests()) {
			const rootStart = performance.now();
			await this.#refreshRootIndices();
			const rootAggregate = this.#getAggregatedRootSignature();
			if (this.#cachedRootAggregateSignature !== undefined &&
				rootAggregate !== this.#cachedRootAggregateSignature) {
				log.verbose(`Root resources changed for project ${this.#project.getName()}, ` +
					`revalidating result cache`);
				this.#resultCacheState = RESULT_CACHE_STATES.PENDING_VALIDATION;
			}
			this.#cachedRootAggregateSignature = rootAggregate;
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`Refreshed root indices for project ${this.#project.getName()} ` +
					`in ${(performance.now() - rootStart).toFixed(2)} ms`);
			}
		}

		if (this.#resultCacheState === RESULT_CACHE_STATES.PENDING_VALIDATION) {
			log.verbose(`Project ${this.#project.getName()} cache requires validation due to detected changes.`);
			const findStart = performance.now();
			const changedResourcesOrFalse = this.#findResultCache();
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
	 * @param {@ui5/fs/AbstractReader} dependencyReader Reader for dependency resources
	 * @returns {Promise<boolean>}
	 */
	async #flushPendingChanges(dependencyReader) {
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
			const tasksWithDepRequests = Array.from(this.#stageCaches.values())
				.filter((stageCache) => stageCache.hasDependencyRequests());
			await Promise.all(tasksWithDepRequests.map(async (stageCache) => {
				const changed = await stageCache
					.updateDependencyIndices(dependencyReader, this.#changedDependencyResourcePaths);
				if (changed) {
					depIndicesChanged = true;
				}
			}));
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`#flushPendingChanges updateDependencyIndices for project ${this.#project.getName()} ` +
					`completed in ${(performance.now() - depStart).toFixed(2)} ms ` +
					`(${this.#changedDependencyResourcePaths.length} changed paths, ` +
					`${tasksWithDepRequests.length}/${this.#stageCaches.size} tasks, changed=${depIndicesChanged})`);
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
		const tasksWithDepRequests = Array.from(this.#stageCaches.values())
			.filter((stageCache) => stageCache.hasDependencyRequests());
		await Promise.all(tasksWithDepRequests.map(async (stageCache) => {
			await stageCache.refreshDependencyIndices(dependencyReader);
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
	 * @returns {string[]|false}
	 *   Array of resource paths written by the cached result stage (empty if the result stage remains unchanged),
	 *   or false if no cache found
	 */
	#findResultCache() {
		const resultSignatures = this.#getPossibleResultStageSignatures();
		if (resultSignatures.includes(this.#currentResultSignature)) {
			log.verbose(
				`Project ${this.#project.getName()} result stage signature unchanged: ${this.#currentResultSignature}`);
			return [];
		}

		// Batch-check which result signatures exist, then read only the first match
		const existingSignatures = this.#cacheManager.findExistingResultSignatures(
			this.#project.getId(), this.#buildSignature, resultSignatures);

		if (!existingSignatures.length) {
			log.verbose(
				`No cached stage found for project ${this.#project.getName()}. Searched with ` +
				`${resultSignatures.length} possible signatures.`);
			return false;
		}

		const resultSignature = existingSignatures[0];
		const resultMetadata = this.#cacheManager.readResultMetadata(
			this.#project.getId(), this.#buildSignature, resultSignature);

		if (!resultMetadata) {
			log.verbose(
				`No cached stage found for project ${this.#project.getName()}. Searched with ` +
				`${resultSignatures.length} possible signatures.`);
			return false;
		}
		log.verbose(`Found result cache with signature ${resultSignature}`);
		const {stageSignatures, sourceStageSignature} = resultMetadata;

		const importStagesStart = log.isLevelEnabled("perf") ? performance.now() : 0;
		const writtenResourcePaths = this.#importStages(stageSignatures);
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`#findResultCache importStages for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - importStagesStart).toFixed(2)} ms ` +
				`with ${Object.keys(stageSignatures).length} stages`);
		}

		// Restore CAS-backed source reader from the stored source stage
		const restoreSourcesStart = log.isLevelEnabled("perf") ? performance.now() : 0;
		this.#restoreFrozenSources(sourceStageSignature);
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
	 * @param {Object<string, string>} stageSignatures Map of stage ids to their signatures
	 * @returns {string[]} Array of resource paths written by all imported stages
	 */
	#importStages(stageSignatures) {
		const stageIds = Object.keys(stageSignatures);
		if (this.#project.getProjectResources().getStage()?.getId() === "initial") {
			// Only initialize stages once
			this.#project.getProjectResources().initStages(stageIds);
		}
		const importedStages = stageIds.map((stageId) => {
			const stageSignature = stageSignatures[stageId];
			const stageCache = this.#findStageCache(stageId, [stageSignature]);
			if (!stageCache) {
				throw new Error(`Inconsistent result cache: Could not find cached stage ` +
					`${stageId} with signature ${stageSignature} for project ${this.#project.getName()}`);
			}
			return [stageId, stageCache];
		});
		this.#project.getProjectResources().useResultStage();

		// When #currentStageSignatures is empty, this is the initial import from persistent cache.
		// The imported stages represent the already-cached state, not actual changes.
		// Dependents' dependency indices were restored from the same cache and already reflect these outputs.
		// Skip change propagation to avoid redundant dependency index updates in dependents.
		const isInitialImport = this.#currentStageSignatures.size === 0;

		const writtenResourcePaths = new Set();
		for (const [stageId, stageCache] of importedStages) {
			// Check whether the stage differs form the one currently in use
			const currentStageTuple = this.#currentStageSignatures.get(stageId);
			if ((currentStageTuple && createStageSignature(currentStageTuple)) !== stageCache.signature) {
				// Set stage
				this.#project.getProjectResources().setStage(stageId, stageCache.stage,
					stageCache.projectTagOperations, stageCache.buildTagOperations);

				// Store signature for later use in result stage signature calculation
				this.#currentStageSignatures.set(stageId, splitStageSignature(stageCache.signature));

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
	 * Calculates all possible result stage signatures based on current state.
	 *
	 * A result signature is the tuple [source, combinedDependency, aggregatedInput, aggregatedRoot]. The
	 * dependency component is a cartesian product over the per-stage dependency-signature lists, so there
	 * is one candidate per combination.
	 *
	 * @returns {string[]} Array of possible result stage signatures
	 */
	#getPossibleResultStageSignatures() {
		const projectSourceSignature = this.#sourceIndex.getSignature();

		// Derive the per-stage dependency-signature lists from the single stage order, so this lookup and
		// #getResultStageSignature (the store side) always walk the same stages in the same order.
		// createDependencySignature is positional and length-sensitive, so a divergence here would store
		// a result signature no later lookup could reproduce (F2).
		const taskDependencySignatures = this.#stageOrder.map((stageId) => {
			const stageCache = this.#stageCaches.get(stageId);
			if (!stageCache) {
				throw new Error(
					`Inconsistent stage state in project ${this.#project.getName()}: stage ${stageId} is ` +
					`in the stage order but has no task cache`);
			}
			return stageCache.getDependencyIndexSignatures();
		});
		const dependencySignaturesCombinations = cartesianProduct(taskDependencySignatures);

		// The aggregated input and root signatures are single current values (not sets of cached
		// alternatives), so they apply to every dependency combination as constants. Each is its own slot
		// of the result-signature tuple, so a changed input or root file invalidates the project-level
		// result cache and the per-project build is not skipped wholesale (the result-cache check runs
		// before the per-stage cache checks).
		const aggregatedInputSignature = this.#getAggregatedInputSignature();
		const aggregatedRootSignature = this.#getAggregatedRootSignature();

		return dependencySignaturesCombinations.map((dependencySignatures) => {
			const combinedDepSignature = createDependencySignature(dependencySignatures);
			return createStageSignature(
				[projectSourceSignature, combinedDepSignature, aggregatedInputSignature, aggregatedRootSignature]);
		});
	}

	/**
	 * Gets the current result stage signature
	 *
	 * @returns {string} Current result stage signature
	 */
	#getResultStageSignature() {
		const projectSourceSignature = this.#sourceIndex.getSignature();
		// Walk #stageOrder (not #currentStageSignatures insertion order) so this stored signature's
		// dependency component matches the candidate list #getPossibleResultStageSignatures computes on
		// the next build. A stage missing from #currentStageSignatures is a clear invariant violation
		// rather than a silently shortened, never-matching dependency list (F2).
		const dependencySignatures = this.#stageOrder.map((stageId) => {
			const stageTuple = this.#currentStageSignatures.get(stageId);
			if (!stageTuple) {
				throw new Error(
					`Inconsistent stage state in project ${this.#project.getName()}: stage ${stageId} has ` +
					`no current stage signature`);
			}
			return stageTuple[STAGE_SIG_DEPENDENCY_INDEX];
		});
		const combinedDepSignature = createDependencySignature(dependencySignatures);
		const aggregatedInputSignature = this.#getAggregatedInputSignature();
		const aggregatedRootSignature = this.#getAggregatedRootSignature();
		return createStageSignature(
			[projectSourceSignature, combinedDepSignature, aggregatedInputSignature, aggregatedRootSignature]);
	}

	/**
	 * Aggregates the current non-resource input signatures (e.g. recorded env-var usage) across all task
	 * caches into a single signature, re-evaluated against the current environment and graph.
	 *
	 * It is one slot of the result stage signature (root resources are a sibling slot via
	 * {@link #getAggregatedRootSignature}), so a changed input invalidates the project-level result cache
	 * and the per-project build is not skipped wholesale (the result-cache check runs before the
	 * per-stage cache checks). Order-independent: the per-stage signatures are sorted before hashing.
	 *
	 * @returns {string} Aggregated input signature
	 */
	#getAggregatedInputSignature() {
		const inputSignatures = [];
		for (const stageCache of this.#stageCaches.values()) {
			inputSignatures.push(stageCache.getInputSignature(this.#resolveInputValue));
		}
		return crypto.createHash("sha256").update(inputSignatures.sort().join("\0")).digest("hex");
	}

	/**
	 * Returns a factory for project root readers, used to re-materialize recorded root resource
	 * requests. The useGitignore flag must match the one the request was recorded with, since it
	 * changes which resources a glob matches.
	 *
	 * @returns {function(boolean): @ui5/fs/AbstractReader} Root reader factory
	 */
	#getRootReaderFactory() {
		return (useGitignore) => this.#project.getRootReader({useGitignore});
	}

	/**
	 * Whether any task cache recorded root resource requests.
	 *
	 * @returns {boolean}
	 */
	#anyTaskHasRootRequests() {
		for (const stageCache of this.#stageCaches.values()) {
			if (stageCache.hasRootRequests()) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Refreshes the root resource indices of every task cache that recorded root requests, resolving
	 * them against the current project root. Bounded by what the tasks requested.
	 *
	 * @returns {Promise<void>}
	 */
	async #refreshRootIndices() {
		const getRootReader = this.#getRootReaderFactory();
		await Promise.all(Array.from(this.#stageCaches.values())
			.filter((stageCache) => stageCache.hasRootRequests())
			.map((stageCache) => stageCache.refreshRootIndices(getRootReader)));
	}

	/**
	 * Aggregates the current root signatures across all task caches into one signature, used to detect
	 * whether any recorded root file changed since the cache was last validated.
	 *
	 * @returns {string} Aggregated root signature
	 */
	#getAggregatedRootSignature() {
		const rootSignatures = [];
		for (const stageCache of this.#stageCaches.values()) {
			rootSignatures.push(stageCache.getRootSignature());
		}
		return crypto.createHash("sha256").update(rootSignatures.sort().join("\0")).digest("hex");
	}

	// ===== TASK MANAGEMENT =====

	/**
	 * Prepares a stage for execution by switching to it and checking for cached results
	 *
	 * This method:
	 * 1. Switches the project to the stage
	 * 2. Updates the stage's indices if it has been invalidated
	 * 3. Attempts to find a cached stage
	 * 4. Returns whether the stage needs to be (re-)executed
	 *
	 * A legacy task has a single stage (<code>stepName</code> omitted); a step-based task calls this once
	 * per step, each step being its own stage.
	 *
	 * @public
	 * @param {string} taskName Name of the task to prepare
	 * @param {string} [stepName] Name of the step, for a step-based task's per-step stage
	 * @returns {Promise<boolean|object>}
	 *   True if the stage can use cache, false if it needs execution,
	 *   or an object with cache information for differential updates
	 */
	async prepareStageExecutionAndValidateCache(taskName, stepName) {
		const stageId = this.#stageIdFor(taskName, stepName);
		const stageCache = this.#stageCaches.get(stageId);
		// Store current project reader (= state of the previous stage) for later use (e.g. in recordStageResult)
		this.#currentProjectReader = this.#project.getReader();
		// Switch project to new stage
		this.#project.getProjectResources().useStage(stageId);
		log.verbose(`Preparing execution for stage ${stageId} in project ${this.#project.getName()}...`);
		if (!stageCache) {
			log.verbose(`No stage cache found`);
			// No cached stage to restore from: this build has no "previous" per-key data for the stage.
			this.#stepInvocationData.set(stageId, undefined);
			return false;
		}
		if (this.#writtenResultResourcePaths.length) {
			// Update stage indices based on source changes and changes from previous stages.
			//
			// The list passed here is the paths accumulated so far this build (source changes plus every
			// earlier stage's writes), not the whole build's final written set: it grows as stages run,
			// so stage N receives exactly the changes from stages 0..N-1. A finer per-stage delta (only
			// the increment since the previous stage) is not safely derivable, because this stage's cached
			// index baseline is the previous build's final state, so it must see every change since then,
			// not only the last stage's. updateIndices early-exits when the stage recorded no requests and
			// otherwise matches only the paths its recorded requests cover, so the accumulated list is not
			// re-scanned in full for stages that read little.
			const updateProjectIndicesStart = performance.now();
			await stageCache.updateProjectIndices(this.#currentProjectReader, this.#writtenResultResourcePaths);
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`Updated project indices for stage ${stageId} in project ${this.#project.getName()} ` +
					`in ${(performance.now() - updateProjectIndicesStart).toFixed(2)} ms`);
			}
		}

		// TODO: Implement:
		// After index update, try to find cached stages for the new signatures
		// let stageSignatures = stageCache.getAffiliatedSignaturePairs();

		// A stage signature is the [project, dependency, input, root] tuple. The exact-match candidates
		// are the cartesian product of the recorded project and dependency index signatures, each paired
		// with the current input and root signatures (BuildStageCache.getStageSignatures). The input and
		// root signatures are re-evaluated against the current environment, graph, and project root, so a
		// changed input or root file misses the cached stage. Root indices were refreshed in validateCache
		// before this build's tasks run.
		const inputSignature = stageCache.getInputSignature(this.#resolveInputValue);
		const rootSignature = stageCache.getRootSignature();
		const stageSignatures = stageCache.getStageSignatures(this.#resolveInputValue);

		const cachedStage = this.#findStageCache(stageId, stageSignatures);
		const oldStageTuple = this.#currentStageSignatures.get(stageId);
		const oldStageSig = oldStageTuple && createStageSignature(oldStageTuple);
		if (cachedStage) {
			this.#project.getProjectResources().setStage(stageId, cachedStage.stage,
				cachedStage.projectTagOperations, cachedStage.buildTagOperations);

			// Stash the matched stage's per-key map as this build's "previous" data, so
			// getStepInvocationData returns the map recorded under exactly this signature rather than the
			// most-recently-written one (see the stepInvocationData field note).
			this.#stepInvocationData.set(stageId, cachedStage.stepInvocationData);

			// Skip propagation when the cached stage matches the previous one
			if (cachedStage.signature !== oldStageSig) {
				// Store new stage signature for later use in result stage signature calculation
				this.#currentStageSignatures.set(stageId, splitStageSignature(cachedStage.signature));

				// Cached stage likely differs from the previous one (if any)
				// Add all resources written by the cached stage to the set of written/potentially changed resources
				for (const resourcePath of cachedStage.writtenResourcePaths) {
					this.#addWrittenResultResourcePath(resourcePath);
				}
			}
			return true; // No need to execute the stage
		} else {
			log.verbose(`No cached stage found for stage ${stageId} in project ${this.#project.getName()}. ` +
				`Attempting to find delta cached stage...`);
			const projectDeltas = stageCache.getProjectIndexDeltas();
			const depDeltas = stageCache.getDependencyIndexDeltas();
			const projectSignatures = stageCache.getProjectIndexSignatures();
			const dependencySignatures = stageCache.getDependencyIndexSignatures();

			// Build the delta candidates and carry each one's provenance alongside it: the resolved new
			// project and dependency components and the changed-path lists. The winner is looked up by its
			// full signature, so no component is ever reverse-mapped out of the tuple (reverse mapping is
			// how a dependency-only delta used to combine the unchanged project component a second time).
			// Three candidate families, keeping the order the single lookup list had before:
			//   - project deltas x current dependency signatures (project changed, dependency unchanged)
			//   - current project signatures x dependency deltas (dependency changed, project unchanged)
			//   - project deltas x dependency deltas (both changed)
			const deltaSignatures = [];
			const provenanceBySignature = new Map();
			const addDeltaCandidate = (projectSig, projectDeltaInfo, dependencySig, dependencyDeltaInfo) => {
				const signature = createStageSignature(
					[projectSig, dependencySig, inputSignature, rootSignature]);
				deltaSignatures.push(signature);
				provenanceBySignature.set(signature, {
					newProjectSig: projectDeltaInfo?.newSignature ?? projectSig,
					newDependencySig: dependencyDeltaInfo?.newSignature ?? dependencySig,
					changedProjectResourcePaths: projectDeltaInfo?.changedPaths ?? [],
					changedDependencyResourcePaths: dependencyDeltaInfo?.changedPaths ?? [],
				});
			};
			for (const [projectSig, projectDeltaInfo] of projectDeltas) {
				for (const dependencySig of dependencySignatures) {
					addDeltaCandidate(projectSig, projectDeltaInfo, dependencySig, undefined);
				}
			}
			for (const projectSig of projectSignatures) {
				for (const [dependencySig, dependencyDeltaInfo] of depDeltas) {
					addDeltaCandidate(projectSig, undefined, dependencySig, dependencyDeltaInfo);
				}
			}
			for (const [projectSig, projectDeltaInfo] of projectDeltas) {
				for (const [dependencySig, dependencyDeltaInfo] of depDeltas) {
					addDeltaCandidate(projectSig, projectDeltaInfo, dependencySig, dependencyDeltaInfo);
				}
			}

			const deltaStageCache = this.#findStageCache(stageId, deltaSignatures);
			if (deltaStageCache) {
				const provenance = provenanceBySignature.get(deltaStageCache.signature);

				// Stash the matched (previous-signature) stage's per-key map so #selectStepsToRun and
				// #computeStaleOutputs run against the data recorded under the restored signature.
				this.#stepInvocationData.set(stageId, deltaStageCache.stepInvocationData);

				// Skip propagation when the cached stage matches the previous one
				if (oldStageSig !== deltaStageCache.signature) {
					// Cached stage likely differs from the previous one (if any)
					// Add all resources written by the cached stage to the set of written/potentially changed resources
					for (const resourcePath of deltaStageCache.writtenResourcePaths) {
						this.#addWrittenResultResourcePath(resourcePath);
					}
				}

				// Pair the delta's resolved project and dependency components with the current input and
				// root signatures. For a dependency-only delta the project component is the one the stage
				// was recorded under, carried through unchanged.
				const newStageTuple =
					[provenance.newProjectSig, provenance.newDependencySig, inputSignature, rootSignature];
				const newSignature = createStageSignature(newStageTuple);
				this.#currentStageSignatures.set(stageId, newStageTuple);

				log.verbose(
					`Using delta cached stage for stage ${stageId} in project ${this.#project.getName()} ` +
					`with original signature ${deltaStageCache.signature} (now ${newSignature}) ` +
					`and ${provenance.changedProjectResourcePaths.length} changed project resource paths and ` +
					`${provenance.changedDependencyResourcePaths.length} changed dependency resource paths.`);

				return {
					previousStageCache: deltaStageCache,
					newSignature: newSignature,
					changedProjectResourcePaths: provenance.changedProjectResourcePaths,
					changedDependencyResourcePaths: provenance.changedDependencyResourcePaths
				};
			}
		}
		// No cached stage matched (neither an exact signature nor a delta): the stage runs in full against
		// a fresh writer, so it has no restorable "previous" per-key map.
		this.#stepInvocationData.set(stageId, undefined);
		return false; // Task needs to be executed
	}

	/**
	 * Reopens a step's stage with a fresh live writer so it can be re-run after a full cache hit that the
	 * {@link StepRunner} determined must re-execute (a consumed <code>needs</code> return changed). The
	 * full hit had installed the cached read-only stage via {@link #findStageCache} +
	 * <code>setStage</code>; this swaps in a writable stage. The re-run records through the normal
	 * {@link #recordStageResult} full path, which recomputes the stage signature and overwrites the
	 * eagerly-stored full-hit signature.
	 *
	 * @public
	 * @param {string} taskName Name of the task
	 * @param {string} [stepName] Name of the step, for a step-based task's per-step stage
	 */
	reopenStageForRerun(taskName, stepName) {
		const stageId = this.#stageIdFor(taskName, stepName);
		this.#project.getProjectResources().reopenStage(stageId);
	}

	/**
	 * Attempts to find a cached stage for the given task
	 *
	 * Checks both in-memory stage cache and persistent cache storage for a matching
	 * stage signature. Returns the first matching cached stage found.
	 *
	 * @param {string} stageId Name of the stage to find
	 * @param {string[]} stageSignatures Possible signatures for the stage
	 * @returns {@ui5/project/build/cache/ProjectBuildCache~StageCacheEntry|undefined}
	 *   Cached stage entry or undefined if not found
	 */
	#findStageCache(stageId, stageSignatures) {
		if (!stageSignatures.length) {
			return;
		}
		// Check cache exists and ensure it's still valid before using it
		log.verbose(`Looking for cached stage for stage  in project ${this.#project.getName()} ` +
			`with ${stageSignatures.length} possible signatures:\n - ${stageSignatures.join("\n - ")}`);
		for (const stageSignature of stageSignatures) {
			const stageCache = this.#stageCache.getCacheForSignature(stageId, stageSignature);
			if (stageCache) {
				return stageCache;
			}
		}

		// Batch-check which signatures exist, then read only the first match
		const existingSignatures = this.#cacheManager.findExistingStageSignatures(
			this.#project.getId(), this.#buildSignature, stageId, stageSignatures);
		if (!existingSignatures.length) {
			return;
		}
		const stageSignature = existingSignatures[0];
		const stageMetadata = this.#cacheManager.readStageCache(
			this.#project.getId(), this.#buildSignature, stageId, stageSignature);
		if (!stageMetadata) {
			return;
		}
		log.verbose(`Found cached stage for stage  with signature ${stageSignature}`);
		return this.#processStageCacheMetadata(stageId, stageSignature, stageMetadata);
	}

	/**
	 * Processes stage cache metadata into a stage cache entry
	 *
	 * @param {string} stageId Name of the stage
	 * @param {string} stageSignature Signature of the stage
	 * @param {object} stageMetadata Raw metadata from cache
	 * @returns {object} Stage cache entry
	 */
	#processStageCacheMetadata(stageId, stageSignature, stageMetadata) {
		const {resourceMapping, resourceMetadata, projectTagOperations, buildTagOperations,
			stepInvocationData} = stageMetadata;
		let writtenResourcePaths;
		let stageReader;
		if (resourceMapping) {
			writtenResourcePaths = [];
			// Restore writer collection
			const readers = resourceMetadata.map((metadata) => {
				writtenResourcePaths.push(...Object.keys(metadata));
				return this.#createReaderForStageCache(
					stageId, stageSignature, metadata);
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
				name: `Restored cached stage ${stageId} for project ${this.#project.getName()}`,
				writerMapping,
			});
		} else {
			writtenResourcePaths = Object.keys(resourceMetadata);
			stageReader = this.#createReaderForStageCache(stageId, stageSignature, resourceMetadata);
		}

		this.#collectKnownIntegrities(resourceMetadata);

		return {
			signature: stageSignature,
			stage: stageReader,
			writtenResourcePaths,
			projectTagOperations: tagOpsToMap(projectTagOperations),
			buildTagOperations: tagOpsToMap(buildTagOperations),
			// Persisted as [[keyId, entry], ...] pairs (JSON has no Map); undefined for a legacy stage.
			stepInvocationData: stepInvocationData ? new Map(stepInvocationData) : undefined,
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
	 * @param {@ui5/project/build/cache/BuildStageCache~ResourceRequests} projectResourceRequests
	 *   Resource requests for project resources
	 * @param {@ui5/project/build/cache/BuildStageCache~ResourceRequests|undefined} dependencyResourceRequests
	 *   Resource requests for dependency resources
	 * @param {object} cacheInfo Cache information for differential updates
	 * @param {Array<{type: string, name: string, value: string|undefined}>} [inputRecording]
	 *   Non-resource inputs (environment variables, TaskUtil interface reads) recorded during task
	 *   execution
	 * @param {{gitignore: @ui5/project/build/cache/BuildStageCache~ResourceRequests,
	 *   noGitignore: @ui5/project/build/cache/BuildStageCache~ResourceRequests}} [rootResourceRequests]
	 *   Resource requests read through the project's root reader, keyed by useGitignore
	 * @returns {Promise<string[]|undefined>} The resource paths written by the task,
	 *   or <code>undefined</code> if caching is disabled
	 */
	/**
	 * Returns the step-runner invocation data for a step's stage on its previous run, or
	 * <code>undefined</code> if the stage has none (first build, a stage that ran no keys, or a full miss
	 * with no cached stage to restore from). The value is the per-key map of the stage that
	 * {@link #prepareStageExecutionAndValidateCache} matched for this build (stashed there under the exact
	 * signature it was recorded under), or the map a running stage recorded via
	 * {@link #setStepInvocationData}. Keyed by stage id: each step-based task's step is its own stage, so
	 * the data is that step's per-key map alone.
	 *
	 * @param {string} stageId Stage id
	 * @returns {Map<string, object>|undefined} That stage's per-key data
	 *   <code>{reads, dependencyReads, writes, inputs, needsInputs, tagOperations, returns}</code>
	 */
	getStepInvocationData(stageId) {
		return this.#stepInvocationData.get(stageId);
	}

	/**
	 * Stores the step-runner invocation data a step's stage recorded on this build. {@link #recordStageResult}
	 * reads it back to pair it with the stage under its new signature (persisted inside the stage's own
	 * {@link #prepareStageCache} payload), so the per-key map and the stage output stay keyed together.
	 *
	 * @param {string} stageId Stage id
	 * @param {Map<string, object>} invocationData That stage's per-key data
	 *   <code>{reads, dependencyReads, writes, inputs, needsInputs, tagOperations, returns}</code>
	 */
	setStepInvocationData(stageId, invocationData) {
		this.#stepInvocationData.set(stageId, invocationData);
	}

	/**
	 * Returns the CAS-backed store the {@link StepRunner} driver uses to persist and rebuild callback
	 * return values. <code>store</code> buffers the resources' content for the CAS (deduped) and returns
	 * path-aligned descriptors; <code>flush</code> writes the content buffered since the last flush in a
	 * single transaction, called once per step by the driver; <code>restore</code> rebuilds a resource
	 * from such a descriptor on a delta build without re-running the step.
	 *
	 * @returns {{store: Function, flush: Function, restore: Function}} The return value store
	 */
	getStepReturnValueStore() {
		return {
			store: (resources) => this.#storeStepReturns(resources),
			flush: () => this.#flushStepReturns(),
			restore: (descriptor) => this.#restoreStepReturn(descriptor),
		};
	}

	/**
	 * Returns the resolver the {@link StepRunner} driver uses to re-derive the current value of a step's
	 * recorded non-resource input on a delta build (the same resolver the task-level input lookup uses,
	 * reaching <code>process.env</code> and the current project graph). A step whose input no longer
	 * resolves to its stored value is re-run. <code>undefined</code> when the cache was built without one.
	 *
	 * @returns {function(string, string): (string|undefined)|undefined} The input value resolver
	 */
	getResolveInputValue() {
		return this.#resolveInputValue;
	}

	/**
	 * Persists the content of resources a step returned and describes them for later
	 * reconstruction. Content goes through the same compression and dedup pipeline as stage resources;
	 * the compressed rows are buffered in {@link #pendingStepReturnCasRows} and written by
	 * {@link #flushStepReturns}, which the driver calls once per step so a step returning many units
	 * costs one transaction rather than one per unit. The descriptors are recorded in the step's
	 * invocation data. The CAS write uses INSERT OR IGNORE, so content shared with a stage output is
	 * stored once and a build that later fails before the flush leaves nothing behind.
	 *
	 * @param {@ui5/fs/Resource[]} resources Resources a step returned, in return order
	 * @returns {Promise<Array<object>>} Descriptors <code>{path, integrity, size, lastModified, inode}</code>
	 *   aligned to <code>resources</code>
	 */
	async #storeStepReturns(resources) {
		// Reuse the stage-resource pipeline for compression and CAS dedup; a returned resource whose path
		// collides with a written output is stored once by integrity and rebuilt independently of that
		// output.
		const {resourceMetadata, casRows} = await this.#prepareStageResources(resources, "stepReturn");
		for (const row of casRows) {
			this.#pendingStepReturnCasRows.push(row);
		}
		this.#collectKnownIntegrities(resourceMetadata);
		// Build descriptors from the metadata #prepareStageResources already computed (integrity, size,
		// lastModified, inode per path) rather than re-reading each resource. resourceMetadata is keyed by
		// original path; the descriptor path is the current path, which differ only for a renamed resource.
		return resources.map((res) => {
			const {integrity, size, lastModified, inode} = resourceMetadata[res.getOriginalPath()];
			return {path: res.getPath(), integrity, size, lastModified, inode};
		});
	}

	/**
	 * Writes the step-return CAS rows buffered since the last flush in a single transaction. The driver
	 * calls this once per step (after the step's units have stored their returns), so one step costs one
	 * transaction regardless of how many units returned resources. A no-op when nothing was buffered.
	 */
	#flushStepReturns() {
		if (!this.#pendingStepReturnCasRows.length) {
			return;
		}
		const rows = this.#pendingStepReturnCasRows;
		this.#pendingStepReturnCasRows = [];
		this.#cacheManager.transaction(() => {
			for (const {integrity, compressedBuffer} of rows) {
				this.#cacheManager.putCompressedContent(integrity, compressedBuffer);
			}
		});
	}

	/**
	 * Rebuilds a resource a step returned on a previous build, reading its content from the
	 * CAS by integrity. Mirrors the CAS-backed resources of {@link #createReaderForStageCache}, but
	 * treats <code>lastModified</code> and <code>inode</code> as optional: returned resources are
	 * usually fresh build outputs that never had filesystem metadata.
	 *
	 * @param {object} descriptor Return descriptor recorded by {@link #storeStepReturns}
	 * @param {string} descriptor.path Virtual path of the returned resource
	 * @param {string} descriptor.integrity Content integrity, the CAS lookup key
	 * @param {number} [descriptor.size] Byte size
	 * @param {number} [descriptor.lastModified] Last-modified timestamp, if the resource had one
	 * @param {number} [descriptor.inode] Inode of the original resource, if known
	 * @returns {@ui5/fs/Resource} The reconstructed resource
	 */
	#restoreStepReturn({path, integrity, size, lastModified, inode}) {
		if (!integrity) {
			throw new Error(
				`Incomplete step return descriptor for resource ${path} ` +
				`in project ${this.#project.getName()}: missing integrity`);
		}
		return createResource({
			path,
			sourceMetadata: {
				adapter: "CAS_SQLITE",
				contentModified: false,
			},
			createStream: () => Readable.from(this.#cacheManager.readContent(integrity)),
			createBuffer: () => this.#cacheManager.readContent(integrity),
			byteSize: size,
			lastModified,
			integrity,
			inode,
			project: this.#project,
		});
	}

	/**
	 * Re-records a map step's stage complete request set on a delta build and returns the resulting
	 * [projectSignature, dependencySignature] pair, so {@link #recordStageResult} can re-key the stage on
	 * it (see open-gaps §7). The request set fed in already unions the delta's monitored requests with
	 * every key's persisted reads (assembled by the driver and the TaskRunner), so recording it keys
	 * the stage exactly as a full build would.
	 *
	 * @param {string} stageId Executed stage id
	 * @param {@ui5/project/build/cache/BuildStageCache} stageCache The stage's cache
	 * @param {object} projectResourceRequests Complete project requests (paths + patterns)
	 * @param {object} dependencyResourceRequests Complete dependency requests, if the stage reads dependencies
	 * @param {Array<object>} inputRecording Recorded non-resource inputs
	 * @param {object} rootResourceRequests Recorded root requests
	 * @returns {Promise<string[]>} The [project, dependency, input, root] stage-signature tuple
	 */
	async #foldStepReads(
		stageId, stageCache, projectResourceRequests, dependencyResourceRequests, inputRecording, rootResourceRequests
	) {
		return stageCache.recordRequests({
			projectRequestRecording: projectResourceRequests,
			dependencyRequestRecording: dependencyResourceRequests,
			projectReader: this.#currentProjectReader,
			dependencyReader: this.#currentDependencyReader,
			inputRecording,
			rootRequestRecording: rootResourceRequests,
			getRootReader: this.#getRootReaderFactory(),
		});
	}

	/**
	 * Records the result of a stage execution and updates the cache.
	 *
	 * @public
	 * @param {object} options
	 * @param {string} options.taskName Name of the executed task
	 * @param {@ui5/project/build/cache/BuildStageCache~ResourceRequests} options.projectResourceRequests
	 *   Resource requests for project resources
	 * @param {@ui5/project/build/cache/BuildStageCache~ResourceRequests|undefined}
	 *   options.dependencyResourceRequests Resource requests for dependency resources
	 * @param {object} [options.cacheInfo] Delta cache verdict for differential updates, or undefined for a
	 *   full execution. Treated as read-only: the effective changed-path list is passed separately via
	 *   <code>changedProjectResourcePaths</code> rather than mutated onto this object.
	 * @param {Array<{type: string, name: string, value: string|undefined}>} [options.inputRecording]
	 *   Non-resource inputs (environment variables, TaskUtil interface reads) recorded during execution
	 * @param {{gitignore: @ui5/project/build/cache/BuildStageCache~ResourceRequests,
	 *   noGitignore: @ui5/project/build/cache/BuildStageCache~ResourceRequests}} [options.rootResourceRequests]
	 *   Resource requests read through the project's root reader, keyed by useGitignore
	 * @param {boolean} [options.stepBased=false] Whether the stage ran the step runner
	 * @param {string} [options.stepName] Name of the step, for a step-based task's per-step stage
	 * @param {string[]} [options.changedProjectResourcePaths] On a delta merge, the project resource paths
	 *   to drop from the carried-forward stage: the verdict's own changed paths plus any stale outputs the
	 *   caller derived. Defaults to the verdict's <code>changedProjectResourcePaths</code>.
	 * @returns {Promise<string[]|undefined>} The resource paths written by the stage,
	 *   or <code>undefined</code> if caching is disabled
	 */
	async recordStageResult({
		taskName, projectResourceRequests, dependencyResourceRequests, cacheInfo,
		inputRecording = [], rootResourceRequests, stepBased = false, stepName,
		changedProjectResourcePaths,
	}) {
		if (this.#cacheMode === Cache.Off) {
			return;
		}
		const recordStart = performance.now();
		const stageId = this.#stageIdFor(taskName, stepName);
		if (!this.#stageCaches.has(stageId)) {
			// Initialize stage cache
			this.#stageCaches.set(stageId,
				new BuildStageCache(this.#project.getName(), stageId, stepBased));
		}
		log.verbose(`Recording results of stage ${stageId} in project ${this.#project.getName()}...`);
		const stageCache = this.#stageCaches.get(stageId);

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
			// Paths flagged changed but not re-emitted by the delta task: their source
			// is gone or excluded, so replaying the previous stage's copy would
			// resurrect content that no longer belongs in the output. The caller passes the effective
			// list (the verdict's changed paths plus any stale outputs it derived); fall back to the
			// verdict's own list when the caller passes none.
			const changedPathSet = new Set(
				changedProjectResourcePaths ?? cacheInfo.changedProjectResourcePaths ?? []);
			// Set form for the membership check below; the array is retained for the
			// ordered downstream uses (recordStageCache, verbose counts).
			const writtenResourcePathSet = new Set(writtenResourcePaths);
			const mergeStart = performance.now();
			const previousWrittenResources = await reader.byGlob("/**/*");
			let mergedCount = 0;
			let droppedCount = 0;
			for (const res of previousWrittenResources) {
				const path = res.getOriginalPath();
				if (writtenResourcePathSet.has(path)) {
					continue; // Delta re-emitted this path; skip
				}
				if (changedPathSet.has(path)) {
					// Flagged changed but not written back by the delta task.
					// Drop the stale copy from the merge.
					droppedCount++;
					continue;
				}
				await stageWriter.write(res);
				mergedCount++;
			}
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`recordStageResult delta merge for task ${taskName} ` +
					`in project ${this.#project.getName()} completed in ` +
					`${(performance.now() - mergeStart).toFixed(2)} ms ` +
					`(${previousWrittenResources.length} previous, ${mergedCount} merged, ` +
					`${droppedCount} dropped)`);
			}

			if (stepBased) {
				// A map step's stage carries an internal key-delta: the delta merge above carried its
				// not-re-run keys' output forward and dropped stale output. But cacheInfo.newSignature keys
				// the stage on the delta's partial request node, which does not track a read first observed
				// on this build (a marker probe, a source map pulled in by a re-run key). Re-key on the
				// stage's complete read set instead, exactly as the full-build branch does, so the next
				// build looks the stage up under a signature that tracks every current input (open-gaps §7).
				const foldedStageTuple = await this.#foldStepReads(
					stageId, stageCache, projectResourceRequests, dependencyResourceRequests,
					inputRecording, rootResourceRequests);
				this.#currentStageSignatures.set(stageId, foldedStageTuple);
				stageSignature = createStageSignature(foldedStageTuple);
			}
		} else {
			// Calculate signature for executed stage
			const recordReqStart = performance.now();
			const stageSignatureTuple = await stageCache.recordRequests({
				projectRequestRecording: projectResourceRequests,
				dependencyRequestRecording: dependencyResourceRequests,
				projectReader: this.#currentProjectReader,
				dependencyReader: this.#currentDependencyReader,
				inputRecording,
				rootRequestRecording: rootResourceRequests,
				getRootReader: this.#getRootReaderFactory(),
			});
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`recordStageResult recordRequests for stage ${stageId} ` +
					`in project ${this.#project.getName()} completed in ` +
					`${(performance.now() - recordReqStart).toFixed(2)} ms`);
			}
			// recordRequests returns the [project, dependency, input, root] stage-signature tuple directly.
			this.#currentStageSignatures.set(stageId, stageSignatureTuple);
			stageSignature = createStageSignature(stageSignatureTuple);
		}

		log.verbose(`Caching stage ${stageId} in project ${this.#project.getName()} ` +
			`with signature ${stageSignature}`);

		// Store resulting stage in stage cache. The step runner set the stage's per-key map via
		// setStepInvocationData immediately before this call (undefined for a legacy task), so it travels
		// with the stage under this signature and is persisted inside the stage's own metadata row.
		this.#stageCache.addSignature(
			stageId, stageSignature, this.#project.getProjectResources().getStage(),
			writtenResourcePaths, projectTagOperations, buildTagOperations,
			this.#stepInvocationData.get(stageId));

		// Update task cache with new metadata
		log.verbose(`Stage ${stageId} produced ${writtenResourcePaths.length} resources`);

		for (const resourcePath of writtenResourcePaths) {
			this.#addWrittenResultResourcePath(resourcePath);
		}
		// Reset current project reader
		this.#currentProjectReader = null;
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`recordStageResult for task ${taskName} in project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - recordStart).toFixed(2)} ms ` +
				`(${writtenResourcePaths.length} written resources, delta=${!!cacheInfo})`);
		}
		return writtenResourcePaths;
	}

	/**
	 * Returns the stage cache for a task's stage, or a step's stage for a step-based task.
	 *
	 * The parameter is a task name (plus optional step name), resolved to its stage id via the same
	 * mapping the rest of the cache uses. Passing an already-composed stage id (one in the
	 * <code>task/</code> namespace) is a caller mistake and throws, rather than being silently accepted.
	 * A task name with no recorded stage returns <code>undefined</code>.
	 *
	 * @public
	 * @param {string} taskName Name of the task
	 * @param {string} [stepName] Name of the step, for a step-based task's per-step stage
	 * @returns {@ui5/project/build/cache/BuildStageCache|undefined}
	 *   The stage cache or undefined if not found
	 * @throws {Error} If a composed stage id is passed in place of a task name
	 */
	getStageCache(taskName, stepName) {
		if (taskName.startsWith("task/")) {
			throw new Error(
				`getStageCache expects a task name, but received the stage id '${taskName}'. ` +
				`Pass the task name (and optional step name) instead.`);
		}
		return this.#stageCaches.get(this.#stageIdFor(taskName, stepName));
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
		if (this.#combinedIndexState !== INDEX_STATES.INITIAL &&
			this.#combinedIndexState !== INDEX_STATES.RESTORING_PROJECT_INDICES) {
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
		if (this.#combinedIndexState !== INDEX_STATES.INITIAL &&
			this.#combinedIndexState !== INDEX_STATES.RESTORING_PROJECT_INDICES) {
			// If there is an index cache, mark it as requiring update
			this.#combinedIndexState = INDEX_STATES.REQUIRES_UPDATE;
		}
	}

	/**
	 * Initializes project stages for the given tasks
	 *
	 * Creates stage ids for each task and initializes them in the project.
	 * This must be called before task execution begins.
	 *
	/**
	 * Initializes project stages for the given tasks.
	 *
	 * A legacy task contributes one stage; a step-based task contributes one stage per step, in
	 * step order, so each step is cached and folded into the result-stage signature independently. The step
	 * names are discovered by the caller from the task factory before the build runs.
	 *
	 * @public
	 * @param {Array<{taskName: string, stepNames?: string[]}>} tasks Tasks to initialize stages for, in
	 *   execution order. <code>stepNames</code> (in step order) is present for a step-based task.
	 */
	setTasks(tasks) {
		const stageIds = [];
		for (const {taskName, stepNames} of tasks) {
			if (stepNames && stepNames.length) {
				for (const stepName of stepNames) {
					stageIds.push(this.#stageIdFor(taskName, stepName));
				}
			} else {
				stageIds.push(this.#stageIdFor(taskName));
			}
		}
		this.#project.getProjectResources().initStages(stageIds);
		// Remember the order so the dependency signature is composed over stages deterministically.
		this.#stageOrder = stageIds;

		// TODO: Rename function? We simply use it to have a point in time right before the project is built
	}

	/**
	 * Returns the stage id for a task's single stage (legacy) or a step's stage (step-based). Lets the
	 * TaskRunner address a step's stage for its per-stage cache lookups.
	 *
	 * @public
	 * @param {string} taskName Task name
	 * @param {string} [stepName] Step name, for a step-based task's per-step stage
	 * @returns {string} Stage id
	 */
	getStageId(taskName, stepName) {
		return this.#stageIdFor(taskName, stepName);
	}

	/**
	 * Re-reads all source files from disk and compares them against the source index
	 * to detect whether any source files were modified, added, or deleted during the build.
	 *
	 * Uses metadata-only comparison via isResourceUnchanged (skipping tags,
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
			const isUnchanged = await isResourceUnchanged(
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

		let pathsToRead;
		const reusedMetadata = Object.create(null);
		if (previousMetadata) {
			pathsToRead = [];
			for (const p of untransformedPaths) {
				if (previousMetadata[p]) {
					reusedMetadata[p] = previousMetadata[p];
				} else {
					pathsToRead.push(p);
				}
			}
		} else {
			pathsToRead = untransformedPaths;
		}

		let prepared = {resourceMetadata: Object.create(null), casRows: []};
		if (pathsToRead.length > 0) {
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

			const prepStart = log.isLevelEnabled("perf") ? performance.now() : 0;
			prepared = await this.#prepareStageResources(resources, "source");
			if (log.isLevelEnabled("perf")) {
				log.perf(
					`#freezeUntransformedSources prepareStageResources for project ` +
					`${this.#project.getName()} ` +
					`completed in ${(performance.now() - prepStart).toFixed(2)} ms`);
			}
		} else if (log.isLevelEnabled("perf")) {
			log.perf(
				`#freezeUntransformedSources for project ${this.#project.getName()}: ` +
				`reused all ${untransformedPaths.length} entries from previous metadata`);
		}

		// Merge reused entries with freshly-prepared entries
		const resourceMetadata = reusedMetadata;
		for (const [path, meta] of Object.entries(prepared.resourceMetadata)) {
			resourceMetadata[path] = meta;
		}

		this.#cacheManager.transaction(() => {
			for (const {integrity, compressedBuffer} of prepared.casRows) {
				this.#cacheManager.putCompressedContent(integrity, compressedBuffer);
			}
			this.#cacheManager.writeStageCache(
				this.#project.getId(), this.#buildSignature, "source", sourceSignature,
				{resourceMetadata});
		});

		this.#collectKnownIntegrities(resourceMetadata);

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
	#restoreFrozenSources(sourceStageSignature) {
		const stageMetadata = this.#cacheManager.readStageCache(
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
	 * Discards the in-memory source index and task caches so the next build re-initializes
	 * the source index from scratch via a full <code>byGlob("/**\/*")</code> re-scan (see
	 * {@link #initSourceIndex}), diffing the live source tree against the persisted index.
	 * Recovers from an unreliable incremental change signal (the file watcher dropping
	 * OS-level FS events, or a source file changing during a build) and from a build that
	 * threw mid-execution.
	 *
	 * Also clears the change accumulators (superseded by the re-scan), the derived per-build
	 * signatures (<code>#currentResultSignature</code>, <code>#cachedResultSignature</code>,
	 * <code>#currentStageSignatures</code>) and the written-path accumulator, and resets the
	 * project's stage pipeline via {@link @ui5/project/resources/ProjectResources#reset}. A
	 * build that threw leaves these pointing at partial output and a stale result signature;
	 * without clearing them, the next {@link #findResultCache} matches the retained
	 * <code>#currentResultSignature</code> and serves the partial output instead of
	 * re-importing the cached stages.
	 *
	 * Keeps content-addressed state that stays correct across the reset:
	 * <code>#stageCache</code> (a stale entry only matches when its content matches) and
	 * <code>#cachedFrozenSourceMetadata</code> (re-read from the persisted cache during
	 * <code>#initSourceIndex</code>).
	 *
	 * @public
	 */
	discardIncrementalState() {
		if (this.#cacheMode === Cache.Off) {
			return;
		}
		// Makes the next build re-run initSourceIndex (before validateCache), which re-globs the
		// source tree from scratch. See the initSourceIndex guard.
		this.#combinedIndexState = INDEX_STATES.RESTORING_PROJECT_INDICES;
		this.#stageCaches.clear();
		// #stepInvocationData is this build's working copy of the per-key maps (a lookup stashes the matched
		// stage's map here, a run overwrites it). A failed build leaves its partial map behind. Clear it so
		// the next build re-stashes the signature-matched map from the restored stage (the persisted copy
		// lives inside each stage_metadata row and is re-read when #findStageCache matches). Without this, a
		// long-lived consumer (ui5 serve) would pair the partial map with the next rebuild's stage, corrupting
		// step selection and stale-output derivation.
		this.#stepInvocationData.clear();
		// Return CAS rows buffered by a step that stored returns but whose build then aborted before the
		// per-step flush: drop them, matching the cleared invocation data that would have referenced them.
		this.#pendingStepReturnCasRows = [];
		// Reset the result cache state. A prior validateCache may have left it at NO_CACHE or
		// FRESH_AND_IN_USE, but the next build asserts PENDING_VALIDATION after restoring the
		// dependency index.
		this.#resultCacheState = RESULT_CACHE_STATES.PENDING_VALIDATION;
		// initSourceIndex does not touch this one, so reset it here.
		this.#changedDependencyResourcePaths = [];
		// Root managers are held on the (now cleared) task caches; drop the remembered aggregate so the
		// re-initialized caches re-establish it on the next validateCache.
		this.#cachedRootAggregateSignature = undefined;
		// Clear per-build state so a failed build does not leak into the next one.
		// #currentResultSignature drives the #findResultCache early return; #currentStageSignatures
		// drives the isInitialImport/setStage guards in #importStages.
		this.#currentResultSignature = undefined;
		this.#currentStageSignatures = new Map();
		// Reset the stage pipeline so #importStages re-initializes stages and re-imports
		// cached results instead of reusing the failed build's partial writers.
		this.#project.getProjectResources().reset();

		// Both get overwritten before they are read on the next build (#sourceIndex by
		// #initSourceIndex, #cachedResultSignature by #findResultCache). Reset only for completeness.
		this.#sourceIndex = null;
		this.#cachedResultSignature = undefined;
	}

	/**
	 * Signals that all tasks have completed and switches to the result stage
	 *
	 * This finalizes the build process by switching the project to use the
	 * final result stage containing all build outputs.
	 * Also updates the result resource index accordingly.
	 *
	 * @public
	 * @param {AbortSignal} [signal] Abort signal to cancel the build
	 * @returns {Promise<string[]>} Array of changed resource paths since the last build
	 * @throws {Error} If source files were modified during the build
	 */
	async allTasksCompleted(signal) {
		const allTasksStart = performance.now();
		this.#project.getProjectResources().useResultStage();

		if (this.#cacheMode === Cache.Off) {
			return [];
		}

		const revalidateStart = performance.now();
		const sourceChangedDuringBuild = await this.#revalidateSourceIndex();
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`allTasksCompleted #revalidateSourceIndex for project ${this.#project.getName()} ` +
				`completed in ${(performance.now() - revalidateStart).toFixed(2)} ms ` +
				`(changed=${sourceChangedDuringBuild})`);
		}
		if (sourceChangedDuringBuild) {
			// If the build was aborted (e.g. due to a file change detected by the watcher),
			// prefer the abort error over the source-change error. The abort will trigger a
			// clean retry cycle in the BuildServer.
			signal?.throwIfAborted();

			// Reset index state so that the next build attempt will re-initialize the source index
			// from scratch. Without this, a retry in the BuildServer would reuse the stale index
			// and perpetually detect the same change.
			this.discardIncrementalState();

			throw new SourceChangedDuringBuildError(this.#project.getName());
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

		// Record the root aggregate this build resolved against, so a later in-session validateCache can
		// detect a root file changing without a source or dependency change.
		this.#cachedRootAggregateSignature = this.#getAggregatedRootSignature();

		this.#currentResultSignature = this.#getResultStageSignature();

		// Reset updated resource paths
		this.#setWrittenResultResourcePaths([]);
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
	 * Appends a written result resource path, keeping the parallel membership Set in sync. A path
	 * already recorded is ignored, so the ordered list stays free of duplicates without an O(n) scan.
	 *
	 * @param {string} resourcePath Resource path written by a stage or detected as a source change
	 */
	#addWrittenResultResourcePath(resourcePath) {
		if (!this.#writtenResultResourcePathSet.has(resourcePath)) {
			this.#writtenResultResourcePathSet.add(resourcePath);
			this.#writtenResultResourcePaths.push(resourcePath);
		}
	}

	/**
	 * Replaces the written result resource paths and rebuilds the parallel membership Set from them.
	 *
	 * @param {string[]} paths New written result resource paths. The array is adopted by reference.
	 */
	#setWrittenResultResourcePaths(paths) {
		this.#writtenResultResourcePaths = paths;
		this.#writtenResultResourcePathSet = new Set(paths);
	}

	/**
	 * Generates the stage id for a task, or for a single step of a step-based task.
	 *
	 * A legacy task maps to one stage <code>task/{taskName}</code>. A step-based task maps to one stage
	 * per step <code>task/{taskName}::step/{stepName}</code>, so each step is cached, validated, and folded
	 * into the result-stage signature independently.
	 *
	 * @param {string} taskName Name of the task
	 * @param {string} [stepName] Name of the step, for a step-based task's per-step stage
	 * @returns {string} Stage id
	 */
	#stageIdFor(taskName, stepName) {
		return stepName === undefined ? `task/${taskName}` : `task/${taskName}::step/${stepName}`;
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
		// Clear any pending source changes accumulated before initialization.
		// The fresh disk read below already captures the current state.
		this.#changedProjectSourcePaths = [];

		const sourceReader = this.#project.getSourceReader();
		const resources = await sourceReader.byGlob("/**/*");
		const indexCache = this.#cacheManager.readIndexCache(this.#project.getId(), this.#buildSignature, "source");
		if (indexCache) {
			log.verbose(`Using cached resource index for project ${this.#project.getName()}`);
			// Restore the dependency-set identity persisted with the previous build's source index.
			// validateCache compares it against the current identity to decide whether the restored
			// dependency indices still match the current dependency set.
			this.#cachedDependencySetIdentity = indexCache.availableDependencies;
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
				const sourceStageMetadata = this.#cacheManager.readStageCache(
					this.#project.getId(), this.#buildSignature, "source", cachedSourceSignature);
				if (sourceStageMetadata?.resourceMetadata) {
					this.#collectKnownIntegrities(sourceStageMetadata.resourceMetadata);
					this.#cachedFrozenSourceMetadata = sourceStageMetadata.resourceMetadata;
				}
			}

			// Import stage caches (one entry per stage: a legacy task's single stage, or a step-based
			// task's per-step stages).
			const buildStageCaches = await Promise.all(
				indexCache.tasks.map(async ([stageId, stepBased]) => {
					const projectRequests = this.#cacheManager.readTaskMetadata(
						this.#project.getId(), this.#buildSignature, stageId, "project");
					if (!projectRequests) {
						throw new Error(`Failed to load project request cache for stage ` +
							`${stageId} in project ${this.#project.getName()}`);
					}
					const dependencyRequests = this.#cacheManager.readTaskMetadata(
						this.#project.getId(), this.#buildSignature, stageId, "dependencies");
					if (!dependencyRequests) {
						throw new Error(`Failed to load dependency request cache for stage ` +
							`${stageId} in project ${this.#project.getName()}`);
					}
					// Input metadata (e.g. recorded env-var usage) is optional: absent for stages that
					// declared no non-resource inputs, and absent in caches written before input
					// tracking existed.
					const inputTree = this.#cacheManager.readTaskMetadata(
						this.#project.getId(), this.#buildSignature, stageId, "input");
					// Root request metadata is optional too: absent for stages that made no root reads,
					// and absent in caches written before root tracking existed. Kept per useGitignore
					// flag since the flag changes which resources a recorded glob matches.
					const rootRequests = this.#cacheManager.readTaskMetadata(
						this.#project.getId(), this.#buildSignature, stageId, "root");
					const rootNoGitignoreRequests = this.#cacheManager.readTaskMetadata(
						this.#project.getId(), this.#buildSignature, stageId, "root-no-gitignore");
					return BuildStageCache.fromCache({
						projectName: this.#project.getName(),
						stageId,
						stepBased: !!stepBased,
						projectRequests,
						dependencyRequests,
						inputSet: inputTree,
						rootRequests,
						rootNoGitignoreRequests,
					});
				})
			);
			// Ensure stageCache is filled in the order of stage execution
			for (const buildStageCache of buildStageCaches) {
				this.#stageCaches.set(buildStageCache.getStageId(), buildStageCache);
			}
			// Capture the restored stage order so the result-signature functions have the single source of
			// truth available before this build's setTasks runs (result-cache validation happens first).
			this.#stageOrder = indexCache.tasks.map(([stageId]) => stageId);

			// Force mode: Fail if cache is stale (source files changed OR pending changes exist)
			if (this.#cacheMode === Cache.Force &&
				(changedPaths.length > 0 || this.#changedProjectSourcePaths.length > 0)) {
				const totalChanges = changedPaths.length + this.#changedProjectSourcePaths.length;
				throw new Error(
					`Cache is in "Force" mode but cache is stale for project ${this.#project.getName()} ` +
					`due to ${totalChanges} changed source file(s). ` +
					`Use "Default", "ReadOnly" or "Off" to rebuild.`
				);
			}

			if (!changedPaths.length) {
				// Source index is up-to-date with no changes
				this.#cachedSourceSignature = resourceIndex.getSignature();
			}
			this.#sourceIndex = resourceIndex;
			// Since all source files are part of the result, declare any detected changes as newly written resources
			this.#setWrittenResultResourcePaths(changedPaths);
			// Now awaiting initialization of dependency indices
			this.#combinedIndexState = INDEX_STATES.RESTORING_DEPENDENCY_INDICES;
		} else {
			if (this.#cacheMode === Cache.Force) {
				throw new Error(`Cache is in "Force" mode but no cache found for project ${this.#project.getName()}. ` +
					`Use "Default", "ReadOnly" or "Off" to rebuild.`);
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
				this.#addWrittenResultResourcePath(resourcePath);
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

		// Gather all cache data before opening any transactions
		const stagePrepared = await this.#prepareStageCache();
		const resultPrepared = this.#prepareResultCache();
		const stageRequestPrepared = this.#prepareStageRequestCache();
		const sourceIndexPrepared = this.#prepareSourceIndex();

		// Calculate CAS rows - dedupe across stages (identical integrity produced by two stages writes once)
		const seenIntegrities = new Set();
		const allCasRows = [];
		for (const {casRows} of stagePrepared) {
			for (const row of casRows) {
				if (!seenIntegrities.has(row.integrity)) {
					seenIntegrities.add(row.integrity);
					allCasRows.push(row);
				}
			}
		}
		this.#cacheManager.transaction(() => {
			for (const {integrity, compressedBuffer} of allCasRows) {
				this.#cacheManager.putCompressedContent(integrity, compressedBuffer);
			}
			if (resultPrepared) {
				this.#cacheManager.writeResultMetadata(
					resultPrepared.projectId, resultPrepared.buildSignature,
					resultPrepared.stageSignature, resultPrepared.metadata);
			}
			for (const {stageId, stageSignature, metadata} of stagePrepared) {
				this.#cacheManager.writeStageCache(
					this.#project.getId(), this.#buildSignature,
					stageId, stageSignature, metadata);
			}
			for (const {stageId, type, metadata} of stageRequestPrepared) {
				this.#cacheManager.writeTaskMetadata(
					this.#project.getId(), this.#buildSignature, stageId, type, metadata);
			}
			if (sourceIndexPrepared) {
				this.#cacheManager.writeIndexCache(
					sourceIndexPrepared.projectId, sourceIndexPrepared.buildSignature,
					sourceIndexPrepared.kind, sourceIndexPrepared.index);
			}
		});

		if (log.isLevelEnabled("perf")) {
			log.perf(
				`Wrote build cache for project ${this.#project.getName()} in ` +
				`${(performance.now() - cacheWriteStart).toFixed(2)} ms`);
		}
	}

	/**
	 * Builds the result-cache payload, or returns null if the result stage is unchanged.
	 *
	 * @returns {{projectId: string, buildSignature: string, stageSignature: string, metadata: object}|null}
	 */
	#prepareResultCache() {
		const stageSignature = this.#currentResultSignature;
		if (stageSignature === this.#cachedResultSignature) {
			// No changes to already cached result stage
			return null;
		}
		log.verbose(`Preparing result metadata for project ${this.#project.getName()} ` +
			`using result stage signature ${stageSignature}`);
		const stageSignatures = Object.create(null);
		for (const [stageId, stageSigs] of this.#currentStageSignatures.entries()) {
			stageSignatures[stageId] = createStageSignature(stageSigs);
		}

		return {
			projectId: this.#project.getId(),
			buildSignature: this.#buildSignature,
			stageSignature,
			metadata: {
				stageSignatures,
				sourceStageSignature: this.#sourceIndex.getSignature(),
			},
		};
	}

	/**
	 * Prepares all pending task stage caches for persistence.
	 *
	 * Gathers resources, computes integrity, gzip-compresses payloads.
	 *
	 * Per-stage iteration is sequential so that integrities collected from one stage
	 * are visible to the next, preserving CAS dedupe.
	 *
	 * @returns {Promise<Array<{
	 *   stageId: string,
	 *   stageSignature: string,
	 *   metadata: object,
	 *   casRows: Array<{integrity: string, compressedBuffer: Buffer}>
	 * }>>}
	 */
	async #prepareStageCache() {
		if (!this.#stageCache.hasPendingCacheQueue()) {
			return [];
		}
		log.verbose(`Preparing stage caches for project ${this.#project.getName()} ` +
			`with build signature ${this.#buildSignature}`);
		const stageQueue = this.#stageCache.flushCacheQueue();

		const payloads = [];
		for (const [stageId, stageSignature] of stageQueue) {
			const {stage, projectTagOperations, buildTagOperations, stepInvocationData} =
				this.#stageCache.getCacheForSignature(stageId, stageSignature);
			const writer = stage.getWriter();

			let metadata;
			const casRowsForStage = [];
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

				const perReader = await Promise.all(readers.map(async (reader) => {
					const resources = await reader.byGlob("/**/*");
					return await this.#prepareStageResources(resources, stageId);
				}));
				const resourceMetadata = [];
				for (const r of perReader) {
					resourceMetadata.push(r.resourceMetadata);
					casRowsForStage.push(...r.casRows);
				}
				this.#collectKnownIntegrities(resourceMetadata);

				metadata = {resourceMapping, resourceMetadata};
			} else {
				const resources = await writer.byGlob("/**/*");
				const prep = await this.#prepareStageResources(resources, stageId);
				casRowsForStage.push(...prep.casRows);
				this.#collectKnownIntegrities(prep.resourceMetadata);
				metadata = {resourceMetadata: prep.resourceMetadata};
			}
			metadata.projectTagOperations = tagOpsToObject(projectTagOperations);
			metadata.buildTagOperations = tagOpsToObject(buildTagOperations);
			if (stepInvocationData) {
				// Embed the step's per-key map in the stage's own row, keyed by this stage signature, so the
				// map and the stage output can never pair with a different run's data. Persisted as
				// [[keyId, entry], ...] pairs since JSON has no Map; an empty map serializes as [] so a stage
				// whose key set dropped to zero overwrites (under its new signature) rather than stranding the
				// previous non-empty data. A legacy stage has no map and omits the field.
				metadata.stepInvocationData = [...stepInvocationData];
			}

			payloads.push({stageId, stageSignature, metadata, casRows: casRowsForStage});
		}
		return payloads;
	}

	/**
	 * Extracts integrity hashes from resource metadata and adds them to the known CAS set.
	 * Handles both the array form (WriterCollection stages) and the plain object form.
	 *
	 * @param {Object<string, object>|Array<Object<string, object>>} resourceMetadata
	 */
	#collectKnownIntegrities(resourceMetadata) {
		const metadataObjects = Array.isArray(resourceMetadata) ? resourceMetadata : [resourceMetadata];
		for (const metadataObj of metadataObjects) {
			for (const meta of Object.values(metadataObj)) {
				if (meta.integrity) {
					this.#knownCasIntegrities.add(meta.integrity);
				}
			}
		}
	}

	/**
	 * Prepares stage resources for persistence: gathers metadata, dedupes against the CAS,
	 * and gzip-compresses payloads for content writes.
	 *
	 * @param {@ui5/fs/Resource[]} resources Array of resources to prepare
	 * @param {string} stageId Stage identifier (for perf logging)
	 * @returns {Promise<{
	 *   resourceMetadata: Object<string, object>,
	 *   casRows: Array<{integrity: string, compressedBuffer: Buffer}>
	 * }>}
	 *   Resource metadata indexed by path, plus the list of CAS rows the caller must insert.
	 */
	async #prepareStageResources(resources, stageId) {
		const resourceMetadata = Object.create(null);
		let casSkipped = 0;

		// Phase 1: Gather resource data (async I/O for integrity and buffer)
		let toWrite = [];
		await Promise.all(resources.map(async (res) => {
			const integrity = await res.getIntegrity();

			if (this.#knownCasIntegrities.has(integrity)) {
				casSkipped++;
			} else {
				const buffer = await res.getBuffer();
				toWrite.push({integrity, buffer});
			}

			resourceMetadata[res.getOriginalPath()] = {
				inode: res.getInode(),
				lastModified: res.getLastModified(),
				size: await res.getSize(),
				integrity,
			};
		}));

		// Phase 2: Batch-check which integrities already exist in the DB (sync read, no batch)
		if (toWrite.length > 0) {
			const existingIntegrities = this.#cacheManager.findExistingContentIntegrities(
				toWrite.map(({integrity}) => integrity)
			);
			if (existingIntegrities.size > 0) {
				casSkipped += existingIntegrities.size;
				toWrite = toWrite.filter(({integrity}) => !existingIntegrities.has(integrity));
			}
		}

		// Phase 3: Parallel async compression
		const casRows = [];
		if (toWrite.length > 0) {
			const concurrency = Math.min(os.availableParallelism(), 8);
			for (let i = 0; i < toWrite.length; i += concurrency) {
				const chunk = toWrite.slice(i, i + concurrency);
				const results = await Promise.all(chunk.map(({buffer}) => {
					if (buffer.length <= 128) {
						return Promise.resolve(buffer);
					}
					return new Promise((resolve, reject) =>
						gzip(buffer, {level: 1}, (err, result) => err ? reject(err) : resolve(result))
					);
				}));
				for (let j = 0; j < results.length; j++) {
					casRows.push({integrity: chunk[j].integrity, compressedBuffer: results[j]});
				}
			}
		}

		if (log.isLevelEnabled("perf") && casSkipped > 0) {
			log.perf(
				`#prepareStageResources for stage ${stageId}: ` +
				`${casSkipped} CAS skipped, ${resources.length - casSkipped} CAS to write`);
		}
		return {resourceMetadata, casRows};
	}

	/**
	 * Builds stage-request metadata payloads for all stages with new or modified entries.
	 *
	 * @returns {Array<{stageId: string, type: string, metadata: object}>}
	 */
	#prepareStageRequestCache() {
		const out = [];
		for (const [stageId, stageCache] of this.#stageCaches) {
			if (!stageCache.hasNewOrModifiedCacheEntries()) {
				continue;
			}
			const [projectRequests, dependencyRequests, inputTree, rootRequests, rootNoGitignoreRequests] =
				stageCache.toCacheObjects();
			log.verbose(`Preparing cache metadata for stage ${stageId} in project ${this.#project.getName()}`);
			if (projectRequests) {
				out.push({stageId, type: "project", metadata: projectRequests});
			}
			if (dependencyRequests) {
				out.push({stageId, type: "dependencies", metadata: dependencyRequests});
			}
			if (inputTree) {
				out.push({stageId, type: "input", metadata: inputTree});
			}
			if (rootRequests) {
				out.push({stageId, type: "root", metadata: rootRequests});
			}
			if (rootNoGitignoreRequests) {
				out.push({stageId, type: "root-no-gitignore", metadata: rootNoGitignoreRequests});
			}
		}
		return out;
	}

	/**
	 * Builds the source-index payload, or returns null if the source index is unchanged.
	 *
	 * @returns {{projectId: string, buildSignature: string, kind: string, index: object}|null}
	 */
	#prepareSourceIndex() {
		if (this.#cachedSourceSignature === this.#sourceIndex.getSignature() &&
			this.#currentDependencySetIdentity === this.#cachedDependencySetIdentity) {
			// Neither the source index nor the dependency-set identity changed. The identity is
			// persisted in this row, so it must be rewritten when it changes even if the source
			// index signature is unchanged (a dependency-set change does not touch source files).
			return null;
		}
		log.verbose(`Preparing resource index cache for project ${this.#project.getName()} ` +
			`with build signature ${this.#buildSignature}`);
		const sourceIndexObject = this.#sourceIndex.toCacheObject();
		// One entry per stage in execution order: a legacy task's single stage, or a step-based task's
		// per-step stages. The stage id is the metadata key everything else is stored under.
		const tasks = [];
		for (const [stageId, stageCache] of this.#stageCaches) {
			tasks.push([stageId, stageCache.getStepBased() ? 1 : 0]);
		}
		return {
			projectId: this.#project.getId(),
			buildSignature: this.#buildSignature,
			kind: "source",
			index: {
				...sourceIndexObject,
				tasks,
				availableDependencies: this.#currentDependencySetIdentity,
			},
		};
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
			name: `Cache reader for stage  in project ${this.#project.getName()}`,
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
					throw new Error(`Incomplete metadata for resource  of stage  ` +
						`in project ${this.#project.getName()}`);
				}

				return createResource({
					path: virPath,
					sourceMetadata: {
						adapter: "CAS_SQLITE",
						contentModified: false,
					},
					createStream: () => {
						return Readable.from(this.#cacheManager.readContent(integrity));
					},
					createBuffer: () => {
						return this.#cacheManager.readContent(integrity);
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
 * A stage signature is an explicit tuple of four independent SHA-256 hex components. The tuple format
 * and its join/split primitives live in ./stageSignature.js, shared with BuildStageCache so the two
 * classes compose and decompose a signature the same way.
 */

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
 * @param {Map<string, Map<string, *>>} tagOps
 * Map of resource paths to their tag operations
 */
function tagOpsToObject(tagOps) {
	const obj = Object.create(null);
	for (const [resourcePath, tags] of tagOps.entries()) {
		obj[resourcePath] = Object.fromEntries(tags.entries());
	}
	return obj;
}

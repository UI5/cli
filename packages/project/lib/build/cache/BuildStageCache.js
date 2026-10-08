import {getLogger} from "@ui5/logger";
import crypto from "node:crypto";
import ResourceRequestManager from "./ResourceRequestManager.js";
import TaskInputSet from "./index/TaskInputSet.js";
import {createStageSignature} from "./stageSignature.js";
const log = getLogger("build:cache:BuildStageCache");

// Root signature of a stage with no recorded root requests: the sha256 digest of an empty signature
// list. Both root request sets are empty for every stage of a standard build (no shipped builder task
// reads through getRootReader), so getRootSignature returns this constant instead of re-hashing.
const EMPTY_ROOT_SIGNATURE = crypto.createHash("sha256").update("").digest("hex");

// Serialized form of an empty, unmodified request manager. Restoring a root manager from this (rather
// than constructing a fresh one) marks it clean, so a stage that recorded no root reads is not
// re-persisted on every build.
function emptyRequestManagerCache() {
	return {requestSetGraph: {nodes: [], nextId: 1}, rootIndices: [], deltaIndices: [], unusedAtLeastOnce: false};
}

/**
 * @typedef {object} @ui5/project/build/cache/BuildStageCache~ResourceRequests
 * @property {Set<string>} paths Specific resource paths that were accessed
 * @property {Set<string>} patterns Glob patterns used to access resources
 */

/**
 * Manages the build cache for a single stage
 *
 * This class tracks all resources accessed by a stage (both project and dependency resources)
 * and maintains a graph of resource request sets. Each request set represents a unique
 * combination of resource accesses, enabling efficient cache invalidation and reuse.
 *
 * Key features:
 * - Tracks resource reads using paths and glob patterns
 * - Maintains resource indices for different request combinations
 * - Supports incremental updates when resources change
 * - Provides cache invalidation based on changed resources
 * - Serializes/deserializes cache metadata for persistence
 *
 * The request graph allows derived request sets (when a stage reads additional resources)
 * to reuse existing resource indices, optimizing both memory and computation.
 *
 * @class
 */
export default class BuildStageCache {
	#projectName;
	#stageId;
	#stepBased;

	#projectRequestManager;
	#dependencyRequestManager;

	// Resources read through the project's root reader (files outside the UI5 resource model: a
	// tsconfig.json in the project root, third-party packages under node_modules). Kept in two
	// managers because getRootReader's useGitignore flag changes which resources a glob matches, so a
	// request recorded with the flag on must re-materialize against a root reader with the flag on.
	// Both are resolved against a dedicated root reader (not the stage-pipeline project reader) and
	// their signatures fold into the stage signature.
	#rootRequestManagers;

	// Tracks non-resource inputs (environment variables and TaskUtil interface reads) recorded during
	// the last execution of this stage. Its signature is folded into the stage signature so that
	// a changed input invalidates the cached result. Only entry names are persisted; values are
	// re-read on lookup (see #inputSet.getSignatureWithCurrentValues).
	#inputSet;
	// Whether the input set changed since it was restored from cache (or was freshly recorded), so
	// that toCacheObjects/hasNewOrModifiedCacheEntries know it must be persisted.
	#inputSetModified = false;

	/**
	 * Creates a new BuildStageCache instance
	 *
	 * @public
	 * @param {string} projectName Name of the project this stage belongs to
	 * @param {string} stageId Id of the stage this cache manages
	 * @param {boolean} stepBased Whether the stage ran the step runner, driving per-step delta tracking
	 * @param {ResourceRequestManager} [projectRequestManager] Optional pre-existing project request manager from cache
	 * @param {ResourceRequestManager} [dependencyRequestManager]
	 * 	Optional pre-existing dependency request manager from cache
	 * @param {TaskInputSet} [inputSet] Optional pre-existing task input set from cache
	 * @param {{gitignore: ResourceRequestManager, noGitignore: ResourceRequestManager}} [rootRequestManagers]
	 * 	Optional pre-existing root request managers from cache, keyed by useGitignore
	 */
	constructor(projectName, stageId, stepBased, projectRequestManager, dependencyRequestManager,
		inputSet, rootRequestManagers) {
		this.#projectName = projectName;
		this.#stageId = stageId;
		this.#stepBased = stepBased;
		log.verbose(`Initializing BuildStageCache for stage "${stageId}" of project "${this.#projectName}" ` +
			`(stepBased=${stepBased})`);

		this.#projectRequestManager = projectRequestManager ??
			new ResourceRequestManager(projectName, stageId, stepBased);
		this.#dependencyRequestManager = dependencyRequestManager ??
			new ResourceRequestManager(projectName, stageId, stepBased);
		this.#inputSet = inputSet ?? new TaskInputSet();
		// Root requests use full-refresh signatures, not the differential deltas project and dependency
		// requests use: a changed root file re-runs the whole stage rather than a differential update.
		// This fits the current use case, tracking a few root config files such as tsconfig.json. A
		// future use case, bundling many files from outside the UI5 dirs (e.g. node_modules) into the
		// build result, would want per-file delta re-runs like project/dependency; that needs a
		// changed-root-path signal, list-valued root signatures in the stage delta candidates, and root
		// reads threaded into step unit selection, and is left as a separate change.
		this.#rootRequestManagers = rootRequestManagers ?? {
			gitignore: new ResourceRequestManager(projectName, `${stageId}#root`, false),
			noGitignore: new ResourceRequestManager(projectName, `${stageId}#root-no-gitignore`, false),
		};
	}

	/**
	 * Factory method to restore a BuildStageCache from cached data
	 *
	 * Deserializes previously cached request managers for both project and dependency resources,
	 * allowing the stage cache to resume from a prior build state.
	 *
	 * @public
	 * @param {object} options
	 * @param {string} options.projectName Name of the project
	 * @param {string} options.stageId Id of the stage
	 * @param {boolean} options.stepBased Whether the stage ran the step runner, driving per-step delta tracking
	 * @param {object} options.projectRequests Cached project request manager data
	 * @param {object} options.dependencyRequests Cached dependency request manager data
	 * @param {object} [options.inputSet] Cached stage input set data
	 * @param {object} [options.rootRequests] Cached useGitignore:true root request manager data
	 * @param {object} [options.rootNoGitignoreRequests] Cached useGitignore:false root request manager data
	 * @returns {BuildStageCache} Restored stage cache instance
	 */
	static fromCache({
		projectName, stageId, stepBased, projectRequests, dependencyRequests,
		inputSet, rootRequests, rootNoGitignoreRequests,
	}) {
		const projectRequestManager = ResourceRequestManager.fromCache(projectName, stageId,
			stepBased, projectRequests);
		const dependencyRequestManager = ResourceRequestManager.fromCache(projectName, stageId,
			stepBased, dependencyRequests);
		// Root managers are optional: absent for stages that made no root reads, and absent in caches
		// written before root tracking existed. A missing entry restores a clean empty manager (not a
		// fresh dirty one), so a stage without root reads is not needlessly re-persisted.
		const rootRequestManagers = {
			gitignore: ResourceRequestManager.fromCache(
				projectName, `${stageId}#root`, false, rootRequests ?? emptyRequestManagerCache()),
			noGitignore: ResourceRequestManager.fromCache(
				projectName, `${stageId}#root-no-gitignore`, false,
				rootNoGitignoreRequests ?? emptyRequestManagerCache()),
		};
		return new BuildStageCache(projectName, stageId, stepBased,
			projectRequestManager, dependencyRequestManager, TaskInputSet.fromCache(inputSet), rootRequestManagers);
	}

	// ===== METADATA ACCESS =====

	/**
	 * Gets the id of the stage
	 *
	 * @public
	 * @returns {string} Stage id
	 */
	getStageId() {
		return this.#stageId;
	}

	/**
	 * Checks whether the stage ran the step runner, which drives per-step delta tracking
	 *
	 * A step-based task tracks resource-request deltas per step, so a later build re-runs only the
	 * changed steps rather than the whole task.
	 *
	 * @public
	 * @returns {boolean} True if the stage ran the step runner
	 */
	getStepBased() {
		return this.#stepBased;
	}

	/**
	 * Checks whether new or modified cache entries exist
	 *
	 * Returns true if either the project or dependency request managers have new or
	 * modified cache entries that need to be persisted.
	 *
	 * @public
	 * @returns {boolean} True if cache entries need to be written
	 */
	hasNewOrModifiedCacheEntries() {
		return this.#projectRequestManager.hasNewOrModifiedCacheEntries() ||
			this.#dependencyRequestManager.hasNewOrModifiedCacheEntries() ||
			this.#rootRequestManagers.gitignore.hasNewOrModifiedCacheEntries() ||
			this.#rootRequestManagers.noGitignore.hasNewOrModifiedCacheEntries() ||
			this.#inputSetModified;
	}

	/**
	 * Returns the signature of this stage's recorded non-resource inputs, computed against the current
	 * environment and project graph.
	 *
	 * Used on cache lookup: each recorded input name is re-evaluated via the given resolver, so the
	 * returned signature reflects the environment and graph of the build performing the lookup. When
	 * the stage recorded no inputs, a stable empty-input digest is returned.
	 *
	 * @public
	 * @param {function(string, string, (string|undefined)): (string|undefined)} [resolveValue]
	 *   Resolver for the current value of an input (see
	 *   {@link @ui5/project/build/cache/index/TaskInputSet#getSignatureWithCurrentValues})
	 * @returns {string} Input signature
	 */
	getInputSignature(resolveValue) {
		return this.#inputSet.getSignatureWithCurrentValues(resolveValue);
	}

	/**
	 * Returns whether this stage recorded any root resource requests
	 *
	 * @public
	 * @returns {boolean}
	 */
	hasRootRequests() {
		return this.#rootRequestManagers.gitignore.hasRequests() ||
			this.#rootRequestManagers.noGitignore.hasRequests();
	}

	/**
	 * Refreshes both root resource indices against the current project root.
	 *
	 * Root files (a tsconfig.json, third-party packages under node_modules) live outside the source
	 * and dependency readers and are not reported through the incremental change signal, so a full
	 * refresh runs at the start of every build from cache. Each manager resolves against a root reader
	 * built with the matching useGitignore flag, since the same recorded glob matches a different
	 * resource set with the flag on versus off.
	 *
	 * @public
	 * @param {function(boolean): module:@ui5/fs.AbstractReader} getRootReader
	 *   Factory returning a project root reader for the given useGitignore flag
	 * @returns {Promise<void>}
	 */
	async refreshRootIndices(getRootReader) {
		await Promise.all([
			this.#rootRequestManagers.gitignore.refreshIndices(getRootReader(true)),
			this.#rootRequestManagers.noGitignore.refreshIndices(getRootReader(false)),
		]);
	}

	/**
	 * Returns a single signature aggregating the current signatures of both root request sets.
	 *
	 * Folded into the stage signature so a changed root file misses the cached stage. Unlike
	 * the project and dependency components, root requests are not delta-tracked: the aggregate is one
	 * value, so any root change re-runs the whole stage. A stage with no recorded root requests yields a
	 * stable digest that stays constant across builds.
	 *
	 * @public
	 * @returns {string} Aggregated root signature
	 */
	getRootSignature() {
		const signatures = [
			...this.#rootRequestManagers.gitignore.getIndexSignatures(),
			...this.#rootRequestManagers.noGitignore.getIndexSignatures(),
		];
		if (signatures.length === 0) {
			return EMPTY_ROOT_SIGNATURE;
		}
		return crypto.createHash("sha256").update(signatures.sort().join("\0")).digest("hex");
	}

	/**
	 * Updates project resource indices based on changed resource paths
	 *
	 * Processes changed resource paths and updates the project request manager's indices
	 * accordingly. Only relevant resources (those matching recorded requests) are processed.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} projectReader Reader for accessing project resources
	 * @param {string[]} changedProjectResourcePaths Array of changed project resource paths
	 * @returns {Promise<boolean>} True if any index has changed
	 */
	updateProjectIndices(projectReader, changedProjectResourcePaths) {
		return this.#projectRequestManager.updateIndices(projectReader, changedProjectResourcePaths);
	}

	/**
	 * Updates dependency resource indices based on changed resource paths
	 *
	 * Processes changed dependency resource paths and updates the dependency request manager's
	 * indices accordingly. Only relevant resources (those matching recorded requests) are processed.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader Reader for accessing dependency resources
	 * @param {string[]} changedDepResourcePaths Array of changed dependency resource paths
	 * @returns {Promise<boolean>} True if any index has changed
	 */
	updateDependencyIndices(dependencyReader, changedDepResourcePaths) {
		return this.#dependencyRequestManager.updateIndices(dependencyReader, changedDepResourcePaths);
	}

	/**
	 * Returns whether this stage has any recorded dependency resource requests
	 *
	 * @public
	 * @returns {boolean}
	 */
	hasDependencyRequests() {
		return this.#dependencyRequestManager.hasRequests();
	}

	/**
	 * Performs a full refresh of the dependency resource index
	 *
	 * Since dependency resources may change independently from this project's cache, a full
	 * refresh of the dependency index is required at the beginning of every build from cache.
	 * This ensures all dependency resources are current before stage execution.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader Reader for accessing dependency resources
	 * @returns {Promise<void>}
	 */
	refreshDependencyIndices(dependencyReader) {
		return this.#dependencyRequestManager.refreshIndices(dependencyReader);
	}

	/**
	 * Gets all project index signatures for this stage
	 *
	 * Returns signatures from all recorded project-request sets. Each signature represents
	 * a unique combination of resources, belonging to the current project, that were accessed
	 * during stage execution. These can be used as cache keys for restoring cached stage results.
	 *
	 * @public
	 * @returns {string[]} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getProjectIndexSignatures() {
		return this.#projectRequestManager.getIndexSignatures();
	}

	/**
	 * Gets all dependency index signatures for this stage
	 *
	 * Returns signatures from all recorded dependency-request sets. Each signature represents
	 * a unique combination of resources, belonging to all dependencies of the current project,
	 * that were accessed during stage execution. These can be used as cache keys for restoring
	 * cached stage results.
	 *
	 * @public
	 * @returns {string[]} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getDependencyIndexSignatures() {
		return this.#dependencyRequestManager.getIndexSignatures();
	}

	/**
	 * Gets all project index delta transitions for differential updates
	 *
	 * Returns a map of signature transitions and their associated changed resource paths
	 * for project resources. Used when stages support differential updates to identify
	 * which resources changed between cache states.
	 *
	 * @public
	 * @returns {Map<string, object>} Map from original signature to delta information
	 *   containing newSignature and changedPaths array
	 */
	getProjectIndexDeltas() {
		return this.#projectRequestManager.getDeltas();
	}

	/**
	 * Gets all dependency index delta transitions for differential updates
	 *
	 * Returns a map of signature transitions and their associated changed resource paths
	 * for dependency resources. Used when stages support differential updates to identify
	 * which dependency resources changed between cache states.
	 *
	 * @public
	 * @returns {Map<string, object>} Map from original signature to delta information
	 *   containing newSignature and changedPaths array
	 */
	getDependencyIndexDeltas() {
		return this.#dependencyRequestManager.getDeltas();
	}

	/**
	 * Builds this stage's exact-match signatures from the current index state: the cartesian product of
	 * the recorded project-request signatures with the recorded dependency-request signatures, each
	 * paired with the stage's current non-resource input signature and root signature into a full
	 * [project, dependency, input, root] tuple.
	 *
	 * This is the single definition of the stage-signature composition. The delta path in
	 * {@link @ui5/project/build/cache/ProjectBuildCache} pairs a changed project/dependency signature
	 * with the same input and root signatures; see {@link #getInputSignature} and
	 * {@link #getRootSignature} for how those two are re-evaluated against the current environment and
	 * project root.
	 *
	 * @public
	 * @param {function(string, string, (string|undefined)): (string|undefined)} [resolveInputValue]
	 *   Resolver for the current value of a recorded non-resource input (see {@link #getInputSignature})
	 * @returns {string[]} Exact-match stage signatures for the current index state
	 */
	getStageSignatures(resolveInputValue) {
		const inputSignature = this.getInputSignature(resolveInputValue);
		const rootSignature = this.getRootSignature();
		const signatures = [];
		for (const projectSignature of this.getProjectIndexSignatures()) {
			for (const dependencySignature of this.getDependencyIndexSignatures()) {
				signatures.push(createStageSignature(
					[projectSignature, dependencySignature, inputSignature, rootSignature]));
			}
		}
		return signatures;
	}

	/**
	 * Records resource requests and calculates signatures for the stage
	 *
	 * This method:
	 * 1. Processes project and dependency resource requests
	 * 2. Searches for exact matches in the request graphs
	 * 3. If found, returns the existing index signatures
	 * 4. If not found, creates new request sets and resource indices
	 * 5. Uses tree derivation when possible to reuse parent indices
	 *
	 * The returned signatures uniquely identify the set of resources accessed and their
	 * content, enabling cache lookup for previously executed stage results.
	 *
	 * @public
	 * @param {object} options
	 * @param {@ui5/project/build/cache/BuildStageCache~ResourceRequests} options.projectRequestRecording
	 *   Project resource requests (paths and patterns)
	 * @param {@ui5/project/build/cache/BuildStageCache~ResourceRequests|undefined}
	 *   options.dependencyRequestRecording Dependency resource requests (paths and patterns)
	 * @param {module:@ui5/fs.AbstractReader} options.projectReader Reader for accessing project resources
	 * @param {module:@ui5/fs.AbstractReader} options.dependencyReader Reader for accessing dependency resources
	 * @param {Array<{type: string, name: string, value: string|undefined}>} [options.inputRecording]
	 *   Non-resource inputs (environment variables, TaskUtil interface reads) recorded during stage
	 *   execution
	 * @param {{gitignore: @ui5/project/build/cache/BuildStageCache~ResourceRequests,
	 *   noGitignore: @ui5/project/build/cache/BuildStageCache~ResourceRequests}} [options.rootRequestRecording]
	 *   Root resource requests, keyed by the useGitignore flag they were read with
	 * @param {function(boolean): module:@ui5/fs.AbstractReader} [options.getRootReader]
	 *   Factory returning a project root reader for the given useGitignore flag
	 * @returns {Promise<string[]>}
	 *   Array containing [projectSignature, dependencySignature, inputSignature, rootSignature]
	 */
	async recordRequests({
		projectRequestRecording, dependencyRequestRecording, projectReader, dependencyReader,
		inputRecording = [], rootRequestRecording, getRootReader,
	}) {
		const {
			setId: projectReqSetId, signature: projectReqSignature
		} = await this.#projectRequestManager.addRequests(projectRequestRecording, projectReader);

		let dependencyReqSignature;
		if (dependencyRequestRecording) {
			const {
				setId: depReqSetId, signature: depReqSignature
			} = await this.#dependencyRequestManager.addRequests(dependencyRequestRecording, dependencyReader);

			this.#projectRequestManager.addAffiliatedRequestSet(projectReqSetId, depReqSetId);
			dependencyReqSignature = depReqSignature;
		} else {
			dependencyReqSignature = this.#dependencyRequestManager.recordNoRequests();
		}

		// Record the non-resource inputs consumed by this execution. Rebuild the set from the
		// recording; if the recorded entry set differs from what was restored/recorded before, flag
		// it for persistence.
		const newInputSet = new TaskInputSet(inputRecording);
		if (newInputSet.getSignature() !== this.#inputSet.getSignature()) {
			this.#inputSetModified = true;
		}
		this.#inputSet = newInputSet;

		// Record root requests against a root reader built with the matching useGitignore flag. A bucket
		// with reads records them. A bucket that recorded reads on an earlier build but has none now is
		// cleared, so getRootSignature stops folding resources the stage no longer reads and the emptied
		// manager is persisted (overwriting the stored request set). A bucket that was always empty is
		// left untouched, so a stage without root reads writes no root metadata.
		if (rootRequestRecording && getRootReader) {
			const recordBucket = (manager, recording, useGitignore) => {
				if (recording && (recording.paths.length || recording.patterns.length)) {
					return manager.addRequests(recording, getRootReader(useGitignore));
				}
				if (manager.hasRequests()) {
					manager.clear();
				}
				return Promise.resolve();
			};
			await Promise.all([
				recordBucket(this.#rootRequestManagers.gitignore, rootRequestRecording.gitignore, true),
				recordBucket(this.#rootRequestManagers.noGitignore, rootRequestRecording.noGitignore, false),
			]);
		}

		return [projectReqSignature, dependencyReqSignature, this.#inputSet.getSignature(), this.getRootSignature()];
	}

	/**
	 * Serializes the stage cache to plain objects for persistence
	 *
	 * Exports both project and dependency resource request graphs in a format suitable
	 * for JSON serialization. The serialized data can be passed to fromCache() to restore
	 * the cache state. Returns undefined for request managers with no new or modified entries.
	 *
	 * @public
	 * @returns {Array<object|undefined>} Array containing
	 *   [projectCacheObject, dependencyCacheObject, inputCacheObject,
	 *    rootCacheObject, rootNoGitignoreCacheObject]
	 */
	toCacheObjects() {
		const {gitignore, noGitignore} = this.#rootRequestManagers;
		return [
			this.#projectRequestManager.toCacheObject(),
			this.#dependencyRequestManager.toCacheObject(),
			this.#inputSet.isEmpty() ? undefined : this.#inputSet.toCacheObject(),
			// Persist a root manager that recorded requests, or one cleared this build so the now-empty
			// state overwrites the stored request set. A manager that was always empty writes no root
			// metadata, keeping a stage without root reads free of root rows.
			gitignore.hasRequests() || gitignore.wasCleared() ? gitignore.toCacheObject() : undefined,
			noGitignore.hasRequests() || noGitignore.wasCleared() ? noGitignore.toCacheObject() : undefined,
		];
	}
}

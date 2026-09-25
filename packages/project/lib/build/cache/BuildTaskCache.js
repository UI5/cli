import {getLogger} from "@ui5/logger";
import crypto from "node:crypto";
import ResourceRequestManager from "./ResourceRequestManager.js";
import TaskInputSet from "./index/TaskInputSet.js";
const log = getLogger("build:cache:BuildTaskCache");

// Serialized form of an empty, unmodified request manager. Restoring a root manager from this (rather
// than constructing a fresh one) marks it clean, so a task that recorded no root reads is not
// re-persisted on every build.
function emptyRequestManagerCache() {
	return {requestSetGraph: {nodes: [], nextId: 1}, rootIndices: [], deltaIndices: [], unusedAtLeastOnce: false};
}

/**
 * @typedef {object} @ui5/project/build/cache/BuildTaskCache~ResourceRequests
 * @property {Set<string>} paths Specific resource paths that were accessed
 * @property {Set<string>} patterns Glob patterns used to access resources
 */

/**
 * Manages the build cache for a single task
 *
 * This class tracks all resources accessed by a task (both project and dependency resources)
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
 * The request graph allows derived request sets (when a task reads additional resources)
 * to reuse existing resource indices, optimizing both memory and computation.
 *
 * @class
 */
export default class BuildTaskCache {
	#projectName;
	#taskName;
	#supportsDifferentialBuilds;

	#projectRequestManager;
	#dependencyRequestManager;

	// Resources read through the project's root reader (files outside the UI5 resource model: a
	// tsconfig.json in the project root, third-party packages under node_modules). Kept in two
	// managers because getRootReader's useGitignore flag changes which resources a glob matches, so a
	// request recorded with the flag on must re-materialize against a root reader with the flag on.
	// Both are resolved against a dedicated root reader (not the stage-pipeline project reader) and
	// their signatures fold into the task's stage signature.
	#rootRequestManagers;

	// Tracks non-resource inputs (environment variables and TaskUtil interface reads) recorded during
	// the last execution of this task. Its signature is folded into the task's stage signature so that
	// a changed input invalidates the cached result. Only entry names are persisted; values are
	// re-read on lookup (see #inputSet.getSignatureWithCurrentValues).
	#inputSet;
	// Whether the input set changed since it was restored from cache (or was freshly recorded), so
	// that toCacheObjects/hasNewOrModifiedCacheEntries know it must be persisted.
	#inputSetModified = false;

	/**
	 * Creates a new BuildTaskCache instance
	 *
	 * @public
	 * @param {string} projectName Name of the project this task belongs to
	 * @param {string} taskName Name of the task this cache manages
	 * @param {boolean} supportsDifferentialBuilds Whether the task supports differential updates
	 * @param {ResourceRequestManager} [projectRequestManager] Optional pre-existing project request manager from cache
	 * @param {ResourceRequestManager} [dependencyRequestManager]
	 * 	Optional pre-existing dependency request manager from cache
	 * @param {TaskInputSet} [inputSet] Optional pre-existing task input set from cache
	 * @param {{gitignore: ResourceRequestManager, noGitignore: ResourceRequestManager}} [rootRequestManagers]
	 * 	Optional pre-existing root request managers from cache, keyed by useGitignore
	 */
	constructor(projectName, taskName, supportsDifferentialBuilds, projectRequestManager, dependencyRequestManager,
		inputSet, rootRequestManagers) {
		this.#projectName = projectName;
		this.#taskName = taskName;
		this.#supportsDifferentialBuilds = supportsDifferentialBuilds;
		log.verbose(`Initializing BuildTaskCache for task "${taskName}" of project "${this.#projectName}" ` +
			`(supportsDifferentialBuilds=${supportsDifferentialBuilds})`);

		this.#projectRequestManager = projectRequestManager ??
			new ResourceRequestManager(projectName, taskName, supportsDifferentialBuilds);
		this.#dependencyRequestManager = dependencyRequestManager ??
			new ResourceRequestManager(projectName, taskName, supportsDifferentialBuilds);
		this.#inputSet = inputSet ?? new TaskInputSet();
		// Root requests use full-refresh signatures, not differential deltas: a changed root file
		// re-runs the whole task rather than a differential update.
		this.#rootRequestManagers = rootRequestManagers ?? {
			gitignore: new ResourceRequestManager(projectName, `${taskName}#root`, false),
			noGitignore: new ResourceRequestManager(projectName, `${taskName}#root-no-gitignore`, false),
		};
	}

	/**
	 * Factory method to restore a BuildTaskCache from cached data
	 *
	 * Deserializes previously cached request managers for both project and dependency resources,
	 * allowing the task cache to resume from a prior build state.
	 *
	 * @public
	 * @param {string} projectName Name of the project
	 * @param {string} taskName Name of the task
	 * @param {boolean} supportsDifferentialBuilds Whether the task supports differential updates
	 * @param {object} projectRequests Cached project request manager data
	 * @param {object} dependencyRequests Cached dependency request manager data
	 * @param {object} [inputSet] Cached task input set data
	 * @param {object} [rootRequests] Cached useGitignore:true root request manager data
	 * @param {object} [rootNoGitignoreRequests] Cached useGitignore:false root request manager data
	 * @returns {BuildTaskCache} Restored task cache instance
	 */
	static fromCache(projectName, taskName, supportsDifferentialBuilds, projectRequests, dependencyRequests,
		inputSet, rootRequests, rootNoGitignoreRequests) {
		const projectRequestManager = ResourceRequestManager.fromCache(projectName, taskName,
			supportsDifferentialBuilds, projectRequests);
		const dependencyRequestManager = ResourceRequestManager.fromCache(projectName, taskName,
			supportsDifferentialBuilds, dependencyRequests);
		// Root managers are optional: absent for tasks that made no root reads, and absent in caches
		// written before root tracking existed. A missing entry restores a clean empty manager (not a
		// fresh dirty one), so a task without root reads is not needlessly re-persisted.
		const rootRequestManagers = {
			gitignore: ResourceRequestManager.fromCache(
				projectName, `${taskName}#root`, false, rootRequests ?? emptyRequestManagerCache()),
			noGitignore: ResourceRequestManager.fromCache(
				projectName, `${taskName}#root-no-gitignore`, false,
				rootNoGitignoreRequests ?? emptyRequestManagerCache()),
		};
		return new BuildTaskCache(projectName, taskName, supportsDifferentialBuilds,
			projectRequestManager, dependencyRequestManager, TaskInputSet.fromCache(inputSet), rootRequestManagers);
	}

	// ===== METADATA ACCESS =====

	/**
	 * Gets the name of the task
	 *
	 * @public
	 * @returns {string} Task name
	 */
	getTaskName() {
		return this.#taskName;
	}

	/**
	 * Checks whether the task supports differential updates
	 *
	 * Tasks that support differential updates can use incremental cache invalidation,
	 * processing only changed resources rather than rebuilding from scratch.
	 *
	 * @public
	 * @returns {boolean} True if differential updates are supported
	 */
	getSupportsDifferentialBuilds() {
		return this.#supportsDifferentialBuilds;
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
	 * Returns the signature of this task's recorded non-resource inputs, computed against the current
	 * environment and project graph.
	 *
	 * Used on cache lookup: each recorded input name is re-evaluated via the given resolver, so the
	 * returned signature reflects the environment and graph of the build performing the lookup. When
	 * the task recorded no inputs, a stable empty-input digest is returned.
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
	 * Returns whether this task recorded any root resource requests
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
	 * Folded into the task's stage signature so a changed root file misses the cached stage. Unlike
	 * the project and dependency components, root requests are not delta-tracked: the aggregate is one
	 * value, so any root change re-runs the whole task. A task with no recorded root requests yields a
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
	 * Returns whether this task has any recorded dependency resource requests
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
	 * This ensures all dependency resources are current before task execution.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader Reader for accessing dependency resources
	 * @returns {Promise<void>}
	 */
	refreshDependencyIndices(dependencyReader) {
		return this.#dependencyRequestManager.refreshIndices(dependencyReader);
	}

	/**
	 * Gets all project index signatures for this task
	 *
	 * Returns signatures from all recorded project-request sets. Each signature represents
	 * a unique combination of resources, belonging to the current project, that were accessed
	 * during task execution. These can be used as cache keys for restoring cached task results.
	 *
	 * @public
	 * @returns {string[]} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getProjectIndexSignatures() {
		return this.#projectRequestManager.getIndexSignatures();
	}

	/**
	 * Gets all dependency index signatures for this task
	 *
	 * Returns signatures from all recorded dependency-request sets. Each signature represents
	 * a unique combination of resources, belonging to all dependencies of the current project,
	 * that were accessed during task execution. These can be used as cache keys for restoring
	 * cached task results.
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
	 * for project resources. Used when tasks support differential updates to identify
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
	 * for dependency resources. Used when tasks support differential updates to identify
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
	 * Records resource requests and calculates signatures for the task
	 *
	 * This method:
	 * 1. Processes project and dependency resource requests
	 * 2. Searches for exact matches in the request graphs
	 * 3. If found, returns the existing index signatures
	 * 4. If not found, creates new request sets and resource indices
	 * 5. Uses tree derivation when possible to reuse parent indices
	 *
	 * The returned signatures uniquely identify the set of resources accessed and their
	 * content, enabling cache lookup for previously executed task results.
	 *
	 * @public
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests} projectRequestRecording
	 *   Project resource requests (paths and patterns)
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests|undefined} dependencyRequestRecording
	 *   Dependency resource requests (paths and patterns)
	 * @param {module:@ui5/fs.AbstractReader} projectReader Reader for accessing project resources
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader Reader for accessing dependency resources
	 * @param {Array<{type: string, name: string, value: string|undefined}>} [inputRecording]
	 *   Non-resource inputs (environment variables, TaskUtil interface reads) recorded during task
	 *   execution
	 * @param {{gitignore: @ui5/project/build/cache/BuildTaskCache~ResourceRequests,
	 *   noGitignore: @ui5/project/build/cache/BuildTaskCache~ResourceRequests}} [rootRequestRecording]
	 *   Root resource requests, keyed by the useGitignore flag they were read with
	 * @param {function(boolean): module:@ui5/fs.AbstractReader} [getRootReader]
	 *   Factory returning a project root reader for the given useGitignore flag
	 * @returns {Promise<string[]>}
	 *   Array containing [projectSignature, dependencySignature, inputSignature, rootSignature]
	 */
	async recordRequests(projectRequestRecording, dependencyRequestRecording, projectReader, dependencyReader,
		inputRecording = [], rootRequestRecording, getRootReader) {
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

		// Record root requests against a root reader built with the matching useGitignore flag. Skip a
		// bucket with no reads so its manager stays empty (and clean), keeping hasRootRequests accurate.
		if (rootRequestRecording && getRootReader) {
			const recordBucket = (manager, recording, useGitignore) =>
				recording && (recording.paths.length || recording.patterns.length) ?
					manager.addRequests(recording, getRootReader(useGitignore)) : Promise.resolve();
			await Promise.all([
				recordBucket(this.#rootRequestManagers.gitignore, rootRequestRecording.gitignore, true),
				recordBucket(this.#rootRequestManagers.noGitignore, rootRequestRecording.noGitignore, false),
			]);
		}

		return [projectReqSignature, dependencyReqSignature, this.#inputSet.getSignature(), this.getRootSignature()];
	}

	/**
	 * Serializes the task cache to plain objects for persistence
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
		return [
			this.#projectRequestManager.toCacheObject(),
			this.#dependencyRequestManager.toCacheObject(),
			this.#inputSet.isEmpty() ? undefined : this.#inputSet.toCacheObject(),
			// Only persist a root manager that recorded requests, so a task without root reads
			// writes no root metadata.
			this.#rootRequestManagers.gitignore.hasRequests() ?
				this.#rootRequestManagers.gitignore.toCacheObject() : undefined,
			this.#rootRequestManagers.noGitignore.hasRequests() ?
				this.#rootRequestManagers.noGitignore.toCacheObject() : undefined,
		];
	}
}

import ProjectBuildLogger from "@ui5/logger/internal/loggers/ProjectBuild";
import TaskUtil from "./TaskUtil.js";
import TaskRunner from "../TaskRunner.js";
import TaskDefinitions from "../TaskDefinitions.js";
import {getProjectSignature} from "./getBuildSignature.js";
import ProjectBuildCache from "../cache/ProjectBuildCache.js";

/**
 * Build context of a single project. Always part of an overall
 * [Build Context]{@link @ui5/project/build/helpers/BuildContext}

 * @memberof @ui5/project/build/helpers
 */
class ProjectBuildContext {
	/**
	 * Creates a new ProjectBuildContext instance.
	 *
	 * Note: This constructor only performs synchronous wiring (logger, TaskUtil, TaskDefinitions).
	 * It does NOT compute the build signature or initialize the build cache, since both depend on
	 * `TaskDefinitions#getBuildSignatures()`, which is async. Use the static
	 * {@link ProjectBuildContext.create} factory to obtain a fully initialized instance.
	 *
	 * @param {@ui5/project/build/helpers/BuildContext} buildContext Overall build context
	 * @param {@ui5/project/specifications/Project} project Project instance to build
	 * @throws {Error} If 'buildContext' or 'project' is missing
	 */
	constructor(buildContext, project) {
		if (!buildContext) {
			throw new Error(`Missing parameter 'buildContext'`);
		}
		if (!project) {
			throw new Error(`Missing parameter 'project'`);
		}
		this._buildContext = buildContext;
		this._project = project;
		this._log = new ProjectBuildLogger({
			moduleName: "Build",
			projectName: project.getName(),
			projectType: project.getType()
		});

		this._taskUtil = new TaskUtil({
			projectBuildContext: this
		});
		this._taskDefinitions = new TaskDefinitions(
			buildContext.getGraph(), project, this._taskUtil, buildContext.getTaskRepository());

		// Populated by ProjectBuildContext.create()
		this._buildSignature = null;
		this._buildCache = null;

		this._queues = {
			cleanup: []
		};
	}

	/**
	 * Factory method to create and fully initialize a ProjectBuildContext instance.
	 *
	 * Performs the async work that the constructor cannot: collecting task build signatures,
	 * computing the project build signature, and constructing the
	 * [ProjectBuildCache]{@link @ui5/project/build/cache/ProjectBuildCache}.
	 * This is the only supported way to obtain a usable instance for production code; callers
	 * must not call {@link #getBuildSignature} or {@link #getBuildCache} on an instance created
	 * via `new` directly.
	 *
	 * Source index initialization is deliberately kept separate ({@link #initSourceIndex}) so
	 * multiple project contexts can initialize their indices in parallel.
	 *
	 * @param {@ui5/project/build/helpers/BuildContext} buildContext Overall build context
	 * @param {@ui5/project/specifications/Project} project Project instance to build
	 * @param {string} baseSignature Base signature for the build
	 * @param {object} cacheManager Cache manager instance
	 * @returns {Promise<@ui5/project/build/helpers/ProjectBuildContext>} Initialized context instance
	 */
	static async create(buildContext, project, baseSignature, cacheManager) {
		const ctx = new ProjectBuildContext(buildContext, project);

		const taskSignatures = await ctx._taskDefinitions.getBuildSignatures();
		ctx._buildSignature = getProjectSignature(
			baseSignature, taskSignatures, project, buildContext.getGraph(), buildContext.getTaskRepository());

		const cacheMode = buildContext.getBuildConfig().cache;
		ctx._buildCache = new ProjectBuildCache(project, ctx._buildSignature, cacheManager, cacheMode);
		return ctx;
	}

	/**
	 * Initializes the source index for this project's build cache
	 *
	 * Must be called after create() and before any cache operations.
	 * Separated from create() to allow parallel initialization of multiple projects.
	 *
	 * @returns {Promise<void>}
	 */
	async initSourceIndex() {
		await this._buildCache.initSourceIndex();
	}

	/**
	 * Checks whether this context is for the root project
	 *
	 * @returns {boolean} True if this is the root project context
	 */
	isRootProject() {
		return this._project === this._buildContext.getRootProject();
	}

	/**
	 * Retrieves a build configuration option
	 *
	 * @param {string} key Option key to retrieve
	 * @returns {*} Option value
	 */
	getOption(key) {
		return this._buildContext.getOption(key);
	}

	/**
	 * Registers a cleanup task to be executed after the build
	 *
	 * Cleanup tasks are called after all regular tasks have completed,
	 * allowing resources to be freed or temporary data to be cleaned up.
	 *
	 * @param {Function} callback Cleanup callback function that accepts a force parameter
	 */
	registerCleanupTask(callback) {
		this._queues.cleanup.push(callback);
	}

	/**
	 * Executes all registered cleanup tasks
	 *
	 * Calls all cleanup callbacks in parallel and clears the cleanup queue.
	 *
	 * @param {boolean} force Whether to force cleanup even if conditions aren't met
	 * @returns {Promise<void>}
	 */
	async executeCleanupTasks(force) {
		await Promise.all(this._queues.cleanup.map((callback) => {
			return callback(force);
		}));
		this._queues.cleanup = [];
	}

	/**
	 * Retrieves a single project from the dependency graph
	 *
	 * @param {string} [projectName] Name of the project to retrieve.
	 *   Defaults to the project currently being built
	 * @returns {@ui5/project/specifications/Project|undefined}
	 *   Project instance or undefined if the project is unknown to the graph
	 */
	getProject(projectName) {
		if (projectName) {
			return this._buildContext.getGraph().getProject(projectName);
		}
		return this._project;
	}

	/**
	 * Retrieves a list of direct dependencies of a given project from the dependency graph
	 *
	 * @param {string} [projectName] Name of the project to retrieve.
	 *   Defaults to the project currently being built
	 * @returns {string[]} Names of all direct dependencies
	 * @throws {Error} If the requested project is unknown to the graph
	 */
	getDependencies(projectName) {
		return this._buildContext.getGraph().getDependencies(projectName || this._project.getName());
	}

	/**
	 * Gets the list of required dependencies for the current project
	 *
	 * Determines which dependencies are actually needed based on the tasks that will be executed.
	 * Results are cached after the first call.
	 *
	 * @returns {Promise<string[]>} Array of required dependency names
	 */
	async getRequiredDependencies() {
		if (this._requiredDependencies) {
			return this._requiredDependencies;
		}
		const taskRunner = this.getTaskRunner();
		this._requiredDependencies = await taskRunner.getRequiredDependencies();
		return this._requiredDependencies;
	}

	/**
	 * Gets the appropriate resource tag collection for a resource and tag
	 *
	 * Determines which tag collection (project-specific or build-level) should be used
	 * for the given resource and tag combination. Associates the resource with the current
	 * project if not already associated.
	 *
	 * @param {@ui5/fs/Resource} resource Resource to get tag collection for
	 * @param {string} tag Tag to check acceptance for
	 * @returns {@ui5/fs/internal/ResourceTagCollection} Appropriate tag collection
	 * @throws {Error} If no collection accepts the given tag
	 */
	getResourceTagCollection(resource, tag) {
		if (!resource.hasProject()) {
			this._log.silly(`Associating resource ${resource.getPath()} with project ${this._project.getName()}`);
			resource.setProject(this._project);
		}
		return resource.getProject().getResourceTagCollection(resource, tag);
	}

	/**
	 * Gets the task utility instance for this build context
	 *
	 * @returns {@ui5/project/build/helpers/TaskUtil} Task utility instance
	 */
	getTaskUtil() {
		return this._taskUtil;
	}

	/**
	 * Gets the task runner instance for this build context
	 *
	 * Creates a TaskRunner instance on first access and caches it for subsequent calls.
	 * The TaskRunner is responsible for executing all build tasks for the project.
	 *
	 * @returns {@ui5/project/build/TaskRunner} Task runner instance
	 */
	getTaskRunner() {
		if (!this._taskRunner) {
			this._taskRunner = new TaskRunner({
				project: this._project,
				log: this._log,
				buildCache: this._buildCache,
				taskUtil: this.getTaskUtil(),
				graph: this._buildContext.getGraph(),
				taskRepository: this._buildContext.getTaskRepository(),
				buildConfig: this._buildContext.getBuildConfig(),
				taskDefinitions: this._taskDefinitions
			});
		}
		return this._taskRunner;
	}

	/**
	 * Early check whether a project build is possibly required.
	 *
	 * In some cases, the cache state cannot be determined until all dependencies have been processed and
	 * the cache has been updated with that information. This happens during prepareProjectBuildAndValidateCache().
	 *
	 * This method allows for an early check whether a project build can be skipped.
	 *
	 * @returns {boolean} True if a build might required, false otherwise
	 */
	possiblyRequiresBuild() {
		if (this.#getBuildManifest()) {
			// Build manifest present -> No build required
			return false;
		}
		// Without build manifest, check cache state
		return !this.getBuildCache().isFresh();
	}

	/**
	 * Prepares the project build by updating and validating the build cache
	 *
	 * Creates a dependency reader and validates the cache state against current resources.
	 * Must be called before buildProject().
	 *
	 * @returns {Promise<true|false>}
	 *   True if a valid cache was found and is being used. False otherwise (indicating a build is required).
	 */
	async prepareProjectBuildAndValidateCache() {
		return this.#runCacheValidation(
			"prepareProjectBuildAndValidateCache",
			(cache, depReader) => cache.prepareProjectBuildAndValidateCache(depReader));
	}

	/**
	 * Validates the current build cache without performing build-prep side effects.
	 *
	 * Creates a dependency reader and asks the build cache whether it is stale,
	 * propagating any detected resource changes to dependents.
	 *
	 * @returns {Promise<true|false>}
	 *   True if a valid cache was found and is being used. False otherwise.
	 */
	async validateCache() {
		return this.#runCacheValidation(
			"validateCache",
			(cache, depReader) => cache.validateCache(depReader));
	}

	/**
	 * Shared implementation for the two cache-validation entry points: fetches a fresh
	 * dependency reader, invokes the supplied cache call, and propagates any changed
	 * resource paths to dependents.
	 *
	 * @param {string} label Method name used for perf logging
	 * @param {Function} call Callback receiving (cache, depReader); returns boolean or string[]
	 * @returns {Promise<boolean>}
	 *   True if a valid cache was found and is being used. False otherwise.
	 */
	async #runCacheValidation(label, call) {
		const perfEnabled = this._log.isLevelEnabled("perf");
		const readerStart = perfEnabled ? performance.now() : 0;
		const depReader = await this.getTaskRunner().getDependenciesReader(
			await this.getTaskRunner().getRequiredDependencies(),
			true, // Force creation of new reader since project readers might have changed during their (re-)build
		);
		if (perfEnabled) {
			this._log.perf(
				`getDependenciesReader completed in ${(performance.now() - readerStart).toFixed(2)} ms`);
		}
		const cacheStart = perfEnabled ? performance.now() : 0;
		const boolOrChangedPaths = await call(this.getBuildCache(), depReader);
		if (perfEnabled) {
			this._log.perf(
				`ProjectBuildCache.${label} completed in ` +
				`${(performance.now() - cacheStart).toFixed(2)} ms`);
		}
		if (Array.isArray(boolOrChangedPaths)) {
			// Cache can be used, but some resources have changed
			// Propagate changed paths to dependents
			this.propagateResourceChanges(boolOrChangedPaths);
		}
		return !!boolOrChangedPaths;
	}

	/**
	 * Builds the project by running all required tasks
	 *
	 * Executes all configured build tasks for the project using the task runner.
	 * Must be called after prepareProjectBuildAndValidateCache().
	 *
	 * @param {AbortSignal} [signal] Abort signal
	 */
	async buildProject(signal) {
		const changedPaths = await this.getTaskRunner().runTasks(signal);
		// Propagate changed paths to dependents
		this.propagateResourceChanges(changedPaths);
	}

	buildFinished() {
		this.getBuildCache().buildFinished();
	}

	/**
	 * Informs the build cache about changed project source resources
	 *
	 * Notifies the cache that source files have changed so it can invalidate
	 * affected cache entries and mark the cache as stale.
	 *
	 * @param {string[]} changedPaths Changed project source file paths
	 */
	projectSourcesChanged(changedPaths) {
		return this._buildCache.projectSourcesChanged(changedPaths);
	}

	/**
	 * Informs the build cache about changed dependency resources
	 *
	 * Notifies the cache that dependency resources have changed so it can invalidate
	 * affected cache entries and mark the cache as stale.
	 *
	 * @param {string[]} changedPaths Changed dependency resource paths
	 */
	dependencyResourcesChanged(changedPaths) {
		return this._buildCache.dependencyResourcesChanged(changedPaths);
	}

	propagateResourceChanges(changedPaths) {
		if (!changedPaths.length) {
			return;
		}
		for (const {project: dep} of this._buildContext.getGraph().traverseDependents(this._project.getName())) {
			const projectBuildContext = this._buildContext.getBuildContext(dep.getName());
			if (projectBuildContext) {
				projectBuildContext.dependencyResourcesChanged(changedPaths);
			}
		}
	}

	/**
	 * Gets the build manifest if available and compatible
	 *
	 * Retrieves the project's build manifest and validates its version.
	 *
	 * @returns {object|undefined} Build manifest object or undefined if unavailable or incompatible
	 */
	#getBuildManifest() {
		const manifest = this._project.getBuildManifest();
		if (!manifest) {
			return;
		}
		// Check whether the manifest can be used for this build
		if (manifest.manifestVersion === "0.1" || manifest.manifestVersion === "0.2" ||
			manifest.manifestVersion === "1.0") {
			return manifest;
		}
		// Unknown manifest version can't be used
		return;
	}

	/**
	 * Gets metadata about the previous build from the build manifest
	 *
	 * Extracts timestamp and age information from the build manifest if available.
	 *
	 * @returns {object|null} Build metadata with timestamp and age, or null if no manifest exists
	 * @returns {string} return.timestamp ISO timestamp of the previous build
	 * @returns {string} return.age Human-readable age of the previous build
	 */
	getBuildMetadata() {
		const buildManifest = this.#getBuildManifest();
		if (!buildManifest) {
			return null;
		}
		const timeDiff = (new Date().getTime() - new Date(buildManifest.timestamp).getTime());

		// TODO: Format age properly
		return {
			timestamp: buildManifest.timestamp,
			age: timeDiff / 1000 + " seconds"
		};
	}

	/**
	 * Gets the project build cache instance
	 *
	 * @returns {@ui5/project/build/cache/ProjectBuildCache} Build cache instance
	 */
	getBuildCache() {
		return this._buildCache;
	}

	async writeBuildCache() {
		await this._buildCache.writeCache();
	}

	/**
	 * Gets the build signature for this project
	 *
	 * The build signature uniquely identifies the build configuration and dependencies,
	 * used for cache validation and invalidation.
	 *
	 * @returns {string} Build signature string
	 */
	getBuildSignature() {
		return this._buildSignature;
	}
}

export default ProjectBuildContext;

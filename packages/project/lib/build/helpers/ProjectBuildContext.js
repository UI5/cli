import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import ProjectBuildLogger from "@ui5/logger/internal/loggers/ProjectBuild";
import TaskUtil from "./TaskUtil.js";
import TaskRunner from "../TaskRunner.js";
import {getProjectSignature} from "./getBuildSignature.js";
import ProjectBuildCache from "../cache/ProjectBuildCache.js";

/**
 * Build context of a single project. Always part of an overall
 * [Build Context]{@link @ui5/project/build/helpers/BuildContext}

 * @memberof @ui5/project/build/helpers
 */
class ProjectBuildContext {
	#initialPrepareRun = true;

	/**
	 * Creates a new ProjectBuildContext instance
	 *
	 * @param {@ui5/project/build/helpers/BuildContext} buildContext Overall build context
	 * @param {@ui5/project/specifications/Project} project Project instance to build
	 * @param {string} buildSignature Signature of the build configuration
	 * @param {@ui5/project/build/cache/ProjectBuildCache} buildCache Build cache instance
	 * @throws {Error} If 'buildContext' or 'project' is missing
	 */
	constructor(buildContext, project, buildSignature, buildCache) {
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
		this._buildSignature = buildSignature;
		this._buildCache = buildCache;
		this._queues = {
			cleanup: []
		};

		this._resourceTagCollection = new ResourceTagCollection({
			allowedTags: ["ui5:OmitFromBuildResult", "ui5:IsBundle"],
			allowedNamespaces: ["build"]
		});
	}

	/**
	 * Factory method to create and initialize a ProjectBuildContext instance
	 *
	 * This is the recommended way to create a ProjectBuildContext as it ensures
	 * proper initialization of the build signature and cache.
	 *
	 * @param {@ui5/project/build/helpers/BuildContext} buildContext Overall build context
	 * @param {@ui5/project/specifications/Project} project Project instance to build
	 * @param {object} cacheManager Cache manager instance
	 * @param {string} baseSignature Base signature for the build
	 * @returns {Promise<@ui5/project/build/helpers/ProjectBuildContext>} Initialized context instance
	 */
	static async create(buildContext, project, cacheManager, baseSignature) {
		const buildSignature = getProjectSignature(
			baseSignature, project, buildContext.getGraph(), buildContext.getTaskRepository());
		const buildCache = await ProjectBuildCache.create(
			project, buildSignature, cacheManager);
		return new ProjectBuildContext(
			buildContext,
			project,
			buildSignature,
			buildCache
		);
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
			// throw new Error(
			// 	`Unable to get tag collection for resource ${resource.getPath()}: ` +
			// 	`Resource must be associated to a project`);
		}
		const projectCollection = resource.getProject().getResourceTagCollection();
		if (projectCollection.acceptsTag(tag)) {
			return projectCollection;
		}
		if (this._resourceTagCollection.acceptsTag(tag)) {
			return this._resourceTagCollection;
		}
		throw new Error(`Could not find collection for resource ${resource.getPath()} and tag ${tag}`);
	}

	/**
	 * Gets the task utility instance for this build context
	 *
	 * Creates a TaskUtil instance on first access and caches it for subsequent calls.
	 * The TaskUtil provides helper functions for tasks during execution.
	 *
	 * @returns {@ui5/project/build/helpers/TaskUtil} Task utility instance
	 */
	getTaskUtil() {
		if (!this._taskUtil) {
			this._taskUtil = new TaskUtil({
				projectBuildContext: this
			});
		}

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
				buildConfig: this._buildContext.getBuildConfig()
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
	 * @returns {Promise<true|false|undefined>}
	 *   True if a valid cache was found and is being used. False otherwise (indicating a build is required).
	 */
	async prepareProjectBuildAndValidateCache() {
		const depReader = await this.getTaskRunner().getDependenciesReader(
			await this.getTaskRunner().getRequiredDependencies(),
			true, // Force creation of new reader since project readers might have changed during their (re-)build
		);
		if (this.#initialPrepareRun) {
			this.#initialPrepareRun = false;
			// If this is the first build of the project, the dependency indices must be refreshed
			// Later builds of the same project during the same overall build can reuse the existing indices
			// (they will be updated based on input via #dependencyResourcesChanged)
			await this.getBuildCache().refreshDependencyIndices(depReader);
		}
		const boolOrChangedPaths = await this.getBuildCache().prepareProjectBuildAndValidateCache(depReader);
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
	 */
	async buildProject() {
		const changedPaths = await this.getTaskRunner().runTasks();
		// Propagate changed paths to dependents
		this.propagateResourceChanges(changedPaths);
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
	 * Only manifest versions 0.1 and 0.2 are currently supported.
	 *
	 * @returns {object|undefined} Build manifest object or undefined if unavailable or incompatible
	 */
	#getBuildManifest() {
		const manifest = this._project.getBuildManifest();
		if (!manifest) {
			return;
		}
		// Check whether the manifest can be used for this build
		if (manifest.buildManifest.manifestVersion === "0.1" || manifest.buildManifest.manifestVersion === "0.2") {
			// Manifest version 0.1 and 0.2 are always used without further checks for legacy reasons
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

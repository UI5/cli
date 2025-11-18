import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import ProjectBuildLogger from "@ui5/logger/internal/loggers/ProjectBuild";
import TaskUtil from "./TaskUtil.js";
import TaskRunner from "../TaskRunner.js";
import ProjectBuildCache from "../cache/ProjectBuildCache.js";

/**
 * Build context of a single project. Always part of an overall
 * [Build Context]{@link @ui5/project/build/helpers/BuildContext}
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class ProjectBuildContext {
	/**
	 *
	 * @param {object} parameters Parameters
	 * @param {object} parameters.buildContext The build context.
	 * @param {object} parameters.project The project instance.
	 * @param {string} parameters.cacheKey The cache key.
	 * @param {string} parameters.cacheDir The cache directory.
	 * @throws {Error} Throws an error if 'buildContext' or 'project' is missing.
	 */
	constructor({buildContext, project, cacheKey, cacheDir}) {
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
		this._cacheKey = cacheKey;
		this._cache = new ProjectBuildCache(this._project, cacheKey, cacheDir);
		this._queues = {
			cleanup: []
		};

		this._resourceTagCollection = new ResourceTagCollection({
			allowedTags: ["ui5:OmitFromBuildResult", "ui5:IsBundle"],
			allowedNamespaces: ["build"]
		});
		const buildManifest = this.#getBuildManifest();
		if (buildManifest) {
			this._cache.deserialize(buildManifest.buildManifest.cache);
		}
	}

	isRootProject() {
		return this._project === this._buildContext.getRootProject();
	}

	getOption(key) {
		return this._buildContext.getOption(key);
	}

	registerCleanupTask(callback) {
		this._queues.cleanup.push(callback);
	}

	async executeCleanupTasks(force) {
		await Promise.all(this._queues.cleanup.map((callback) => {
			return callback(force);
		}));
	}

	/**
	 * Retrieve a single project from the dependency graph
	 *
	 * @param {string} [projectName] Name of the project to retrieve. Defaults to the project currently being built
	 * @returns {@ui5/project/specifications/Project|undefined}
	 *					project instance or undefined if the project is unknown to the graph
	 */
	getProject(projectName) {
		if (projectName) {
			return this._buildContext.getGraph().getProject(projectName);
		}
		return this._project;
	}

	/**
	 * Retrieve a list of direct dependencies of a given project from the dependency graph
	 *
	 * @param {string} [projectName] Name of the project to retrieve. Defaults to the project currently being built
	 * @returns {string[]} Names of all direct dependencies
	 * @throws {Error} If the requested project is unknown to the graph
	 */
	getDependencies(projectName) {
		return this._buildContext.getGraph().getDependencies(projectName || this._project.getName());
	}

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

	getTaskUtil() {
		if (!this._taskUtil) {
			this._taskUtil = new TaskUtil({
				projectBuildContext: this
			});
		}

		return this._taskUtil;
	}

	getTaskRunner() {
		if (!this._taskRunner) {
			this._taskRunner = new TaskRunner({
				project: this._project,
				log: this._log,
				cache: this._cache,
				taskUtil: this.getTaskUtil(),
				graph: this._buildContext.getGraph(),
				taskRepository: this._buildContext.getTaskRepository(),
				buildConfig: this._buildContext.getBuildConfig()
			});
		}
		return this._taskRunner;
	}

	/**
	 * Determine whether the project has to be built or is already built
	 * (typically indicated by the presence of a build manifest)
	 *
	 * @returns {boolean} True if the project needs to be built
	 */
	async requiresBuild() {
		if (this.#getBuildManifest()) {
			return false;
		}

		if (!this._cache.hasCache()) {
			await this._cache.attemptDeserializationFromDisk();
		}

		return this._cache.requiresBuild();
	}

	async runTasks() {
		await this.getTaskRunner().runTasks();
		const updatedResourcePaths = this._cache.harvestUpdatedResources();

		if (updatedResourcePaths.size === 0) {
			return;
		}
		this._log.verbose(
			`Project ${this._project.getName()} updated resources: ${Array.from(updatedResourcePaths).join(", ")}`);
		const graph = this._buildContext.getGraph();
		const emptySet = new Set();

		// Propagate changes to all dependents of the project
		for (const {project: dep} of graph.traverseDependents(this._project.getName())) {
			const projectBuildContext = this._buildContext.getBuildContext(dep.getName());
			projectBuildContext.getBuildCache().resourceChanged(emptySet, updatedResourcePaths);
		}
	}

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
		if (manifest.buildManifest.manifestVersion === "0.3" &&
			manifest.buildManifest.cacheKey === this.getCacheKey()) {
			// Manifest version 0.3 is used with a matching cache key
			return manifest;
		}
		// Unknown manifest version can't be used
		return;
	}

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

	getBuildCache() {
		return this._cache;
	}

	getCacheKey() {
		return this._cacheKey;
	}

	// async watchFileChanges() {
	// 	// const paths = this._project.getSourcePaths();
	// 	// this._log.verbose(`Watching source paths: ${paths.join(", ")}`);
	// 	// const {default: chokidar} = await import("chokidar");
	// 	// const watcher = chokidar.watch(paths, {
	// 	// 	ignoreInitial: true,
	// 	// 	persistent: false,
	// 	// });
	// 	// watcher.on("add", async (filePath) => {
	// 	// });
	// 	// watcher.on("change", async (filePath) => {
	// 	// 	const resourcePath = this._project.getVirtualPath(filePath);
	// 	// 	this._log.info(`File changed: ${resourcePath} (${filePath})`);
	// 	// 	// Inform cache
	// 	// 	this._cache.fileChanged(resourcePath);
	// 	// 	// Inform dependents
	// 	// 	for (const dependent of this._buildContext.getGraph().getTransitiveDependents(this._project.getName())) {
	// 	// 		await this._buildContext.getProjectBuildContext(dependent).dependencyFileChanged(resourcePath);
	// 	// 	}
	// 	// 	// Inform build context
	// 	// 	await this._buildContext.fileChanged(this._project.getName(), resourcePath);
	// 	// });
	// }

	// dependencyFileChanged(resourcePath) {
	// 	this._log.info(`Dependency file changed: ${resourcePath}`);
	// 	this._cache.fileChanged(resourcePath);
	// }
}

export default ProjectBuildContext;

import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import ProjectBuildLogger from "@ui5/logger/internal/loggers/ProjectBuild";
import TaskUtil from "./TaskUtil.js";
import TaskRunner from "../TaskRunner.js";
import calculateBuildSignature from "./calculateBuildSignature.js";
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
	 * @param {object} buildContext The build context.
	 * @param {object} project The project instance.
	 * @param {string} buildSignature The signature of the build.
	 * @param {ProjectBuildCache} buildCache
	 * @throws {Error} Throws an error if 'buildContext' or 'project' is missing.
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

	static async create(buildContext, project) {
		const buildSignature = await calculateBuildSignature(project, buildContext.getGraph(),
			buildContext.getBuildConfig(), buildContext.getTaskRepository());
		const buildCache = await ProjectBuildCache.create(
			project, buildSignature, await buildContext.getCacheManager());
		return new ProjectBuildContext(
			buildContext,
			project,
			buildSignature,
			buildCache
		);
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
	 * Determine whether the project has to be built or is already built
	 * (typically indicated by the presence of a build manifest or a valid cache)
	 *
	 * @returns {boolean} True if the project needs to be built
	 */
	async requiresBuild() {
		if (this.#getBuildManifest()) {
			return false;
		}

		return this._buildCache.requiresBuild();
	}

	async runTasks() {
		await this.getTaskRunner().runTasks();
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
		return this._buildCache;
	}

	getBuildSignature() {
		return this._buildSignature;
	}
}

export default ProjectBuildContext;

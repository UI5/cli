import path from "node:path";
import ProjectBuildContext from "./ProjectBuildContext.js";
import OutputStyleEnum from "./ProjectBuilderOutputStyle.js";
import {createCacheKey} from "./createBuildManifest.js";
import WatchHandler from "./WatchHandler.js";

/**
 * Context of a build process
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class BuildContext {
	#watchHandler;

	constructor(graph, taskRepository, { // buildConfig
		selfContained = false,
		cssVariables = false,
		jsdoc = false,
		createBuildManifest = false,
		useCache = false,
		outputStyle = OutputStyleEnum.Default,
		includedTasks = [], excludedTasks = [],
	} = {}) {
		if (!graph) {
			throw new Error(`Missing parameter 'graph'`);
		}
		if (!taskRepository) {
			throw new Error(`Missing parameter 'taskRepository'`);
		}

		const rootProjectType = graph.getRoot().getType();

		if (createBuildManifest && !["library", "theme-library"].includes(rootProjectType)) {
			throw new Error(
				`Build manifest creation is currently not supported for projects of type ` +
				rootProjectType);
		}

		if (createBuildManifest && selfContained) {
			throw new Error(
				`Build manifest creation is currently not supported for ` +
				`self-contained builds`);
		}

		if (createBuildManifest && outputStyle === OutputStyleEnum.Flat) {
			throw new Error(
				`Build manifest creation is not supported in conjunction with flat build output`);
		}
		if (outputStyle !== OutputStyleEnum.Default) {
			if (rootProjectType === "theme-library") {
				throw new Error(
					`${outputStyle} build output style is currently not supported for projects of type` +
						`theme-library since they commonly have more than one namespace. ` +
						`Currently only the Default output style is supported for this project type.`
				);
			}
			if (rootProjectType === "module") {
				throw new Error(
					`${outputStyle} build output style is currently not supported for projects of type` +
						`module. Their path mappings configuration can't be mapped to any namespace.` +
						`Currently only the Default output style is supported for this project type.`
				);
			}
		}

		this._graph = graph;
		this._buildConfig = {
			selfContained,
			cssVariables,
			jsdoc,
			createBuildManifest,
			outputStyle,
			includedTasks,
			excludedTasks,
			useCache,
		};

		this._taskRepository = taskRepository;

		this._options = {
			cssVariables: cssVariables
		};
		this._projectBuildContexts = [];
	}

	getRootProject() {
		return this._graph.getRoot();
	}

	getOption(key) {
		return this._options[key];
	}

	getBuildConfig() {
		return this._buildConfig;
	}

	getTaskRepository() {
		return this._taskRepository;
	}

	getGraph() {
		return this._graph;
	}

	async createProjectContext({project, cacheDir}) {
		const cacheKey = await this.#createCacheKeyForProject(project);
		if (cacheDir) {
			cacheDir = path.join(cacheDir, cacheKey);
		}
		const projectBuildContext = new ProjectBuildContext({
			buildContext: this,
			project,
			cacheKey,
			cacheDir,
		});
		this._projectBuildContexts.push(projectBuildContext);
		return projectBuildContext;
	}

	initWatchHandler(projects, updateBuildResult) {
		const watchHandler = new WatchHandler(this, updateBuildResult);
		watchHandler.watch(projects);
		this.#watchHandler = watchHandler;
		return watchHandler;
	}

	getWatchHandler() {
		return this.#watchHandler;
	}

	async #createCacheKeyForProject(project) {
		return createCacheKey(project, this._graph,
			this.getBuildConfig(), this.getTaskRepository());
	}

	getBuildContext(projectName) {
		if (projectName) {
			return this._projectBuildContexts.find((ctx) => ctx.getProject().getName() === projectName);
		}
	}

	async executeCleanupTasks(force = false) {
		await Promise.all(this._projectBuildContexts.map((ctx) => {
			return ctx.executeCleanupTasks(force);
		}));
	}
}

export default BuildContext;

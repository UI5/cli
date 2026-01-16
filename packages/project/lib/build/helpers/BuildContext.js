import ProjectBuildContext from "./ProjectBuildContext.js";
import OutputStyleEnum from "./ProjectBuilderOutputStyle.js";
import CacheManager from "../cache/CacheManager.js";
import {getBaseSignature} from "./getBuildSignature.js";

/**
 * Context of a build process
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class BuildContext {
	#watchHandler;
	#cacheManager;

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
		this._buildSignatureBase = getBaseSignature(this._buildConfig);

		this._taskRepository = taskRepository;

		this._options = {
			cssVariables: cssVariables
		};
		this._projectBuildContexts = new Map();
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

	async getProjectContext(projectName) {
		if (this._projectBuildContexts.has(projectName)) {
			return this._projectBuildContexts.get(projectName);
		}
		const project = this._graph.getProject(projectName);
		const projectBuildContext = await ProjectBuildContext.create(
			this, project, await this.getCacheManager(), this._buildSignatureBase);
		this._projectBuildContexts.set(projectName, projectBuildContext);
		return projectBuildContext;
	}

	async getRequiredProjectContexts(requestedProjects) {
		const projectBuildContexts = new Map();
		const requiredProjects = new Set(requestedProjects);

		for (const projectName of requiredProjects) {
			const projectBuildContext = await this.getProjectContext(projectName);

			projectBuildContexts.set(projectName, projectBuildContext);

			// Collect all direct dependencies of the project that are required to build the project
			const requiredDependencies = await projectBuildContext.getRequiredDependencies();

			for (const depName of requiredDependencies) {
				// Add dependency to list of required projects
				requiredProjects.add(depName);
			}
		}
		return projectBuildContexts;
	}

	async getCacheManager() {
		if (this.#cacheManager) {
			return this.#cacheManager;
		}
		this.#cacheManager = await CacheManager.create(this._graph.getRoot().getRootPath());
		return this.#cacheManager;
	}

	getBuildContext(projectName) {
		return this._projectBuildContexts.get(projectName);
	}

	async executeCleanupTasks(force = false) {
		await Promise.all(Array.from(this._projectBuildContexts.values()).map((ctx) => {
			return ctx.executeCleanupTasks(force);
		}));
	}

	/**
	 *
	 * @param {Map<string, Set<string>>} resourceChanges
	 * @returns {Set<string>} Names of projects potentially affected by the resource changes
	 */
	propagateResourceChanges(resourceChanges) {
		const affectedProjectNames = new Set();
		const dependencyChanges = new Map();
		for (const [projectName, changedResourcePaths] of resourceChanges) {
			affectedProjectNames.add(projectName);
			// Propagate changes to dependents of the project
			for (const {project: dep} of this._graph.traverseDependents(projectName)) {
				const depChanges = dependencyChanges.get(dep.getName());
				if (!depChanges) {
					dependencyChanges.set(dep.getName(), new Set(changedResourcePaths));
					continue;
				}
				for (const res of changedResourcePaths) {
					depChanges.add(res);
				}
			}
			const projectBuildContext = this.getBuildContext(projectName);
			if (projectBuildContext) {
				projectBuildContext.projectSourcesChanged(Array.from(changedResourcePaths));
			}
		}

		for (const [projectName, changedResourcePaths] of dependencyChanges) {
			affectedProjectNames.add(projectName);
			const projectBuildContext = this.getBuildContext(projectName);
			if (projectBuildContext) {
				projectBuildContext.dependencyResourcesChanged(Array.from(changedResourcePaths));
			}
		}
		return affectedProjectNames;
	}
}

export default BuildContext;

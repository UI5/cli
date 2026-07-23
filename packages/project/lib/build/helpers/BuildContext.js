import ProjectBuildContext from "./ProjectBuildContext.js";
import OutputStyleEnum from "./ProjectBuilderOutputStyle.js";
import CacheManager from "../cache/CacheManager.js";
import {getBaseSignature} from "./getBuildSignature.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:helpers:BuildContext");
import Cache from "../cache/Cache.js";

/**
 * Context of a build process
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class BuildContext {
	#cacheManager;

	constructor(graph, taskRepository, { // buildConfig
		selfContained = false,
		cssVariables = false,
		jsdoc = false,
		createBuildManifest = false,
		outputStyle = OutputStyleEnum.Default,
		includedTasks = [], excludedTasks = [],
		cache = Cache.Default,
	} = {}, ui5DataDir) {
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
			cache
		};
		// eslint-disable-next-line no-unused-vars
		const {cache: _ignoreMe, ...signatureConfig} = this._buildConfig; // Clones buildConfig omitting the cache mode
		this._buildSignatureBase = getBaseSignature(signatureConfig);

		this._taskRepository = taskRepository;

		this._options = {
			cssVariables: cssVariables
		};
		this._ui5DataDir = ui5DataDir;
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
			this, project, this._buildSignatureBase, await this.getCacheManager());
		this._projectBuildContexts.set(projectName, projectBuildContext);
		return projectBuildContext;
	}

	async getRequiredProjectContexts(requestedProjects) {
		const totalStart = performance.now();
		const projectBuildContexts = new Map();
		const requiredProjects = new Set(requestedProjects);

		// Phase 1: Discover all required projects (sequential — each project's
		// dependencies may expand the set). This is fast because getProjectContext
		// no longer triggers source index I/O.
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

		// Phase 2: Initialize all source indices in parallel
		const initStart = performance.now();
		await Promise.all(
			Array.from(projectBuildContexts.values()).map((ctx) => ctx.initSourceIndex())
		);
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`Parallel source index initialization completed in ` +
				`${(performance.now() - initStart).toFixed(2)} ms ` +
				`for ${projectBuildContexts.size} projects`);
		}

		if (log.isLevelEnabled("perf")) {
			log.perf(
				`getRequiredProjectContexts completed in ${(performance.now() - totalStart).toFixed(2)} ms ` +
				`for ${projectBuildContexts.size} projects`);
		}
		return projectBuildContexts;
	}

	async getCacheManager() {
		if (this._buildConfig.cache === Cache.Off) {
			return null;
		}
		if (this.#cacheManager) {
			return this.#cacheManager;
		}
		if (!this._ui5DataDir) {
			throw new Error("BuildContext: Missing parameter \"ui5DataDir\" for cache-enabled builds");
		}
		this.#cacheManager = await CacheManager.create(this._ui5DataDir);
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
	 * Forces a full source re-scan for every project that has an initialized build context.
	 *
	 * Discards each context's in-memory build cache so the next build re-globs the source
	 * tree and diffs it against the persisted index, picking up changes that were never
	 * reported through {@link #propagateResourceChanges} (e.g. file watcher events dropped
	 * by the OS). Never-built projects have no context yet and re-scan naturally on first
	 * build, so iterating existing contexts only is sufficient.
	 */
	discardIncrementalState() {
		for (const ctx of this._projectBuildContexts.values()) {
			ctx.discardIncrementalState();
		}
	}

	closeCacheManager() {
		if (this.#cacheManager) {
			this.#cacheManager.close();
			this.#cacheManager = null;
		}
	}

	/**
	 *
	 * @param {Map<string, Set<string>>} resourceChanges Mapping project name to changed resource paths
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
				} else {
					for (const res of changedResourcePaths) {
						depChanges.add(res);
					}
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

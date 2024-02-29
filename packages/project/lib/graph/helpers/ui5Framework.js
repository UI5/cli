import Module from "../Module.js";
import ProjectGraph from "../ProjectGraph.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("graph:helpers:ui5Framework");
import Configuration from "../../config/Configuration.js";
import path from "node:path";

class ProjectProcessor {
	constructor({libraryMetadata, graph, workspace}) {
		this._libraryMetadata = libraryMetadata;
		this._graph = graph;
		this._workspace = workspace;
		this._projectGraphPromises = Object.create(null);
	}
	async addProjectToGraph(libName, ancestors) {
		if (ancestors) {
			this._checkCycle(ancestors, libName);
		}
		if (this._projectGraphPromises[libName]) {
			return this._projectGraphPromises[libName];
		}
		return this._projectGraphPromises[libName] = this._addProjectToGraph(libName, ancestors);
	}
	async _addProjectToGraph(libName, ancestors = []) {
		log.verbose(`Creating project for library ${libName}...`);

		if (!this._libraryMetadata[libName]) {
			throw new Error(`Failed to find library ${libName} in dist packages metadata.json`);
		}

		const depMetadata = this._libraryMetadata[libName];
		const graph = this._graph;

		if (graph.getProject(libName)) {
			// Already added
			return;
		}

		const dependencies = await Promise.all(depMetadata.dependencies.map(async (depName) => {
			await this.addProjectToGraph(depName, [...ancestors, libName]);
			return depName;
		}));

		if (depMetadata.optionalDependencies) {
			const resolvedOptionals = await Promise.all(depMetadata.optionalDependencies.map(async (depName) => {
				if (this._libraryMetadata[depName]) {
					log.verbose(`Resolving optional dependency ${depName} for project ${libName}...`);
					await this.addProjectToGraph(depName, [...ancestors, libName]);
					return depName;
				}
			}));

			dependencies.push(...resolvedOptionals.filter(($)=>$));
		}

		let projectIsFromWorkspace = false;
		let ui5Module;
		if (this._workspace) {
			ui5Module = await this._workspace.getModuleByProjectName(libName);
			if (ui5Module) {
				log.info(`Resolved project ${libName} via ${this._workspace.getName()} workspace ` +
					`to version ${ui5Module.getVersion()}`);
				log.verbose(`  Resolved module ${libName} to path ${ui5Module.getPath()}`);
				log.verbose(`  Requested version was: ${depMetadata.version}`);
				projectIsFromWorkspace = true;
			}
		}

		if (!ui5Module) {
			ui5Module = new Module({
				id: depMetadata.id,
				version: depMetadata.version,
				modulePath: depMetadata.path
			});
		}
		const {project} = await ui5Module.getSpecifications();
		graph.addProject(project);
		dependencies.forEach((dependency) => {
			graph.declareDependency(libName, dependency);
		});
		if (projectIsFromWorkspace) {
			// Add any dependencies that are only declared in the workspace resolved project
			// Do not remove superfluous dependencies (might be added later though)
			await Promise.all(project.getFrameworkDependencies().map(async ({name, optional, development}) => {
				// Only proceed with dependencies which are not "optional" or "development",
				// and not already listed in the dependencies of the original node
				if (optional || development || dependencies.includes(name)) {
					return;
				}

				if (!this._libraryMetadata[name]) {
					throw new Error(
						`Unable to find dependency ${name}, required by project ${project.getName()} ` +
						`(resolved via ${this._workspace.getName()} workspace) in current set of libraries. ` +
						`Try adding it temporarily to the root project's dependencies`);
				}

				await this.addProjectToGraph(name, [...ancestors, libName]);
				graph.declareDependency(libName, name);
			}));
		}
	}
	_checkCycle(ancestors, projectName) {
		if (ancestors.includes(projectName)) {
			// "Back-edge" detected. This would cause a deadlock
			// Mark first and last occurrence in chain with an asterisk and throw an error detailing the
			// problematic dependency chain
			ancestors[ancestors.indexOf(projectName)] = `*${projectName}*`;
			throw new Error(
				`ui5Framework:ProjectPreprocessor: Detected cyclic dependency chain: ` +
				`${ancestors.join(" -> ")} -> *${projectName}*`);
		}
	}
}

const utils = {
	shouldIncludeDependency({optional, development}, root) {
		// Root project should include all dependencies
		// Otherwise only non-optional and non-development dependencies should be included
		return root || (optional !== true && development !== true);
	},
	async getFrameworkLibrariesFromGraph(projectGraph) {
		const ui5Dependencies = [];
		const rootProject = projectGraph.getRoot();
		await projectGraph.traverseBreadthFirst(async ({project}) => {
			if (project !== rootProject && project.isFrameworkProject()) {
				// Ignoring UI5 Framework libraries in dependencies
				return;
			}
			// No need to check for specVersion since Specification API is >= 2.0 anyways
			const frameworkDependencies = project.getFrameworkDependencies();
			if (!frameworkDependencies.length) {
				log.verbose(`Project ${project.getName()} has no framework dependencies`);
				// Possible future enhancement: Fallback to detect OpenUI5 framework dependencies in package.json
				return;
			}

			frameworkDependencies.forEach((dependency) => {
				if (!ui5Dependencies.includes(dependency.name) &&
						utils.shouldIncludeDependency(dependency, project === rootProject)) {
					ui5Dependencies.push(dependency.name);
				}
			});
		});
		return ui5Dependencies;
	},
	async declareFrameworkDependenciesInGraph(projectGraph) {
		const rootProject = projectGraph.getRoot();
		await projectGraph.traverseBreadthFirst(async ({project}) => {
			if (project !== rootProject && project.isFrameworkProject()) {
				// Ignoring UI5 Framework libraries in dependencies
				return;
			}
			// No need to check for specVersion since Specification API is >= 2.0 anyways
			const frameworkDependencies = project.getFrameworkDependencies();

			if (!frameworkDependencies.length) {
				log.verbose(`Project ${project.getName()} has no framework dependencies`);
				// Possible future enhancement: Fallback to detect OpenUI5 framework dependencies in package.json
				return;
			}

			const isRoot = project === rootProject;
			frameworkDependencies.forEach((dependency) => {
				if (isRoot || !dependency.development) {
					// Root project should include all dependencies
					// Otherwise all non-development dependencies should be considered

					if (isRoot) {
						// Check for deprecated/internal dependencies of the root project
						const depProject = projectGraph.getProject(dependency.name);
						if (depProject && depProject.isDeprecated() && rootProject.getName() !== "testsuite") {
							// No warning for testsuite projects
							log.warn(`Dependency ${depProject.getName()} is deprecated ` +
								`and should not be used for new projects!`);
						}
						if (depProject && depProject.isSapInternal() && !rootProject.getAllowSapInternal()) {
							// Do not warn if project defines "allowSapInternal"
							log.warn(`Dependency ${depProject.getName()} is restricted for use by ` +
								`SAP internal projects only! ` +
								`If the project ${rootProject.getName()} is an SAP internal project, ` +
								`add the attribute "allowSapInternal: true" to its metadata configuration`);
						}
					}
					if (!isRoot && dependency.optional) {
						if (projectGraph.getProject(dependency.name)) {
							projectGraph.declareOptionalDependency(project.getName(), dependency.name);
						}
					} else {
						projectGraph.declareDependency(project.getName(), dependency.name);
					}
				}
			});
		});
		await projectGraph.resolveOptionalDependencies();
	},
	checkForDuplicateFrameworkProjects(projectGraph, frameworkGraph) {
		// Check for duplicate framework libraries
		const projectGraphProjectNames = projectGraph.getProjectNames();
		const duplicateFrameworkProjectNames = frameworkGraph.getProjectNames()
			.filter((name) => projectGraphProjectNames.includes(name));

		if (duplicateFrameworkProjectNames.length) {
			throw new Error(
				`Duplicate framework dependency definition(s) found for project ${projectGraph.getRoot().getName()}: ` +
				`${duplicateFrameworkProjectNames.join(", ")}.\n` +
				`Framework libraries should only be referenced via ui5.yaml configuration. ` +
				`Neither the root project, nor any of its dependencies should include them as direct ` +
				`dependencies (e.g. via package.json).`
			);
		}
	},
	/**
	 * This logic needs to stay in sync with the dependency definitions for the
	 * sapui5/distribution-metadata package.
	 *
	 * @param {@ui5/project/specifications/Project} project
	 */
	async getFrameworkLibraryDependencies(project) {
		let dependencies = [];
		let optionalDependencies = [];

		if (project.getId().startsWith("@sapui5/")) {
			project.getFrameworkDependencies().forEach((dependency) => {
				if (dependency.optional) {
					// Add optional dependency to optionalDependencies
					optionalDependencies.push(dependency.name);
				} else if (!dependency.development) {
					// Add non-development dependency to dependencies
					dependencies.push(dependency.name);
				}
			});
		} else if (project.getId().startsWith("@openui5/")) {
			const packageResource = await project.getRootReader().byPath("/package.json");
			const packageInfo = JSON.parse(await packageResource.getString());

			dependencies = Object.keys(
				packageInfo.dependencies || {}
			).map(($) => $.replace("@openui5/", "")); // @sapui5 dependencies must not be defined in package.json
			optionalDependencies = Object.keys(
				packageInfo.devDependencies || {}
			).map(($) => $.replace("@openui5/", "")); // @sapui5 dependencies must not be defined in package.json
		}

		return {dependencies, optionalDependencies};
	},
	async getWorkspaceFrameworkLibraryMetadata({workspace, projectGraph}) {
		const libraryMetadata = Object.create(null);
		const ui5Modules = await workspace.getModules();
		for (const ui5Module of ui5Modules) {
			const {project} = await ui5Module.getSpecifications();
			// Only framework projects that are not already part of the projectGraph should be handled.
			// Otherwise they would be available twice which is checked
			// after installing via checkForDuplicateFrameworkProjects
			if (project?.isFrameworkProject?.() && !projectGraph.getProject(project.getName())) {
				const metadata = libraryMetadata[project.getName()] = Object.create(null);
				metadata.id = project.getId();
				metadata.path = project.getRootPath();
				metadata.version = project.getVersion();
				const {dependencies, optionalDependencies} = await utils.getFrameworkLibraryDependencies(project);
				metadata.dependencies = dependencies;
				metadata.optionalDependencies = optionalDependencies;
			}
		}
		return libraryMetadata;
	},
	ProjectProcessor
};

/**
 *
 *
 * @private
 * @module @ui5/project/helpers/ui5Framework
 */
export default {
	/**
	 *
	 *
	 * @public
	 * @param {@ui5/project/graph/ProjectGraph} projectGraph
	 * @param {object} [options]
	 * @param {string} [options.versionOverride] Framework version to use instead of the root projects framework
	 *   version
	 * @param {module:@ui5/project/ui5Framework/maven/CacheMode} [options.cacheMode]
 	 *   Cache mode to use when consuming SNAPSHOT versions of a framework
	 * @param {@ui5/project/graph/Workspace} [options.workspace]
	 *   Optional workspace instance to use for overriding node resolutions
	 * @returns {Promise<@ui5/project/graph/ProjectGraph>}
	 *   Promise resolving with the given graph instance to allow method chaining
	 */
	enrichProjectGraph: async function(projectGraph, options = {}) {
		const {workspace, cacheMode} = options;
		const rootProject = projectGraph.getRoot();
		const frameworkName = rootProject.getFrameworkName();
		const frameworkVersion = rootProject.getFrameworkVersion();
		const cwd = rootProject.getRootPath();

		// It is allowed to omit the framework version in ui5.yaml and only provide one via the override
		// This is a common use case for framework libraries, which generally should not define a
		// framework version in their respective ui5.yaml
		let version = options.versionOverride || frameworkVersion;

		if (rootProject.isFrameworkProject() && !version) {
			// If the root project is a framework project and no framework version is defined,
			// all framework dependencies must either be already part of the graph or part of the workspace.
			// A mixed setup of framework deps within the graph AND from the workspace is currently not supported.

			const someDependencyMissing = rootProject.getFrameworkDependencies().some((dep) => {
				return utils.shouldIncludeDependency(dep) && !projectGraph.getProject(dep.name);
			});

			// If all dependencies are available there is nothing else to do here.
			// In case of a workspace setup, the resolver will be created below without a version and
			// will succeed in case no library needs to be actually installed.
			if (!someDependencyMissing) {
				return projectGraph;
			}
		}


		if (!frameworkName && !frameworkVersion) {
			log.verbose(`Root project ${rootProject.getName()} has no framework configuration. Nothing to do here`);
			return projectGraph;
		}

		if (frameworkName !== "SAPUI5" && frameworkName !== "OpenUI5") {
			throw new Error(
				`Unknown framework.name "${frameworkName}" for project ${rootProject.getName()}. ` +
				`Must be "OpenUI5" or "SAPUI5"`
			);
		}

		const referencedLibraries = await utils.getFrameworkLibrariesFromGraph(projectGraph);
		if (!referencedLibraries.length) {
			log.verbose(
				`No ${frameworkName} libraries referenced in project ${rootProject.getName()} ` +
				`or in any of its dependencies`);
			return projectGraph;
		}

		let Resolver;
		if (version && version.toLowerCase().endsWith("-snapshot")) {
			Resolver = (await import("../../ui5Framework/Sapui5MavenSnapshotResolver.js")).default;
		} else if (frameworkName === "OpenUI5") {
			Resolver = (await import("../../ui5Framework/Openui5Resolver.js")).default;
		} else if (frameworkName === "SAPUI5") {
			Resolver = (await import("../../ui5Framework/Sapui5Resolver.js")).default;
		}

		// ENV var should take precedence over the dataDir from the configuration.
		let ui5DataDir = process.env.UI5_DATA_DIR;
		if (!ui5DataDir) {
			const config = await Configuration.fromFile();
			ui5DataDir = config.getUi5DataDir();
		}
		if (ui5DataDir) {
			ui5DataDir = path.resolve(cwd, ui5DataDir);
		}

		if (options.versionOverride) {
			version = await Resolver.resolveVersion(options.versionOverride, {
				ui5DataDir,
				cwd
			});
			log.info(
				`Overriding configured ${frameworkName} version ` +
				`${frameworkVersion} with version ${version}`
			);
		}

		if (version) {
			log.info(`Using ${frameworkName} version: ${version}`);
		}

		let providedLibraryMetadata;
		if (workspace) {
			providedLibraryMetadata = await utils.getWorkspaceFrameworkLibraryMetadata({
				workspace, projectGraph
			});
		}

		// Note: version might be undefined here and the Resolver will throw an error when calling
		// #install and it can't be resolved via the provided library metadata
		const resolver = new Resolver({
			cwd,
			version,
			providedLibraryMetadata,
			cacheMode,
			ui5DataDir
		});

		let startTime;
		if (log.isLevelEnabled("verbose")) {
			startTime = process.hrtime();
		}

		const {libraryMetadata} = await resolver.install(referencedLibraries);

		if (log.isLevelEnabled("verbose")) {
			const timeDiff = process.hrtime(startTime);
			const {default: prettyHrtime} = await import("pretty-hrtime");
			log.verbose(
				`${frameworkName} dependencies ${referencedLibraries.join(", ")} ` +
				`resolved in ${prettyHrtime(timeDiff)}`);
		}

		const frameworkGraph = new ProjectGraph({
			rootProjectName: `fake-root-of-${rootProject.getName()}-framework-dependency-graph`
		});

		const projectProcessor = new utils.ProjectProcessor({
			libraryMetadata,
			graph: frameworkGraph,
			workspace
		});

		await Promise.all(referencedLibraries.map(async (libName) => {
			await projectProcessor.addProjectToGraph(libName);
		}));

		utils.checkForDuplicateFrameworkProjects(projectGraph, frameworkGraph);

		log.verbose("Joining framework graph into project graph...");
		projectGraph.join(frameworkGraph);
		await utils.declareFrameworkDependenciesInGraph(projectGraph);
		return projectGraph;
	},

	// Export for testing only
	_utils: process.env.NODE_ENV === "test" ? utils : /* istanbul ignore next */ undefined
};

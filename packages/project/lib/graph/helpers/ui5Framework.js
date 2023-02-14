import Module from "../Module.js";
import ProjectGraph from "../ProjectGraph.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("graph:helpers:ui5Framework");

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
					if (dependency.optional) {
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
				`Duplicate framework library definition(s) found in project ${projectGraph.getRoot().getName()}: ` +
				`${duplicateFrameworkProjectNames.join(", ")}. ` +
				`Framework libraries should only be referenced via ui5.yaml configuration, ` +
				`not in its dependencies (e.g. package.json). ` +
				`Note that this error could also come from transitive dependencies.`
			);
		}
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
	 * @param {@ui5/project/graph/Workspace} [options.workspace]
	 *   Optional workspace instance to use for overriding node resolutions
	 * @returns {Promise<@ui5/project/graph/ProjectGraph>}
	 *   Promise resolving with the given graph instance to allow method chaining
	 */
	enrichProjectGraph: async function(projectGraph, options = {}) {
		const rootProject = projectGraph.getRoot();
		const frameworkName = rootProject.getFrameworkName();
		const frameworkVersion = rootProject.getFrameworkVersion();

		// It is allowed omit the framework version in ui5.yaml and only provide one via the override
		// This is a common use case for framework libraries, which generally should not define a
		// framework version in their respective ui5.yaml
		let version = options.versionOverride || frameworkVersion;

		if (rootProject.isFrameworkProject() && !version) {
			// If the root project is a framework project and no framework version is defined,
			// all framework dependencies must already be part of the graph
			rootProject.getFrameworkDependencies().forEach((dep) => {
				if (utils.shouldIncludeDependency(dep) && !projectGraph.getProject(dep.name)) {
					throw new Error(
						`Missing framework dependency ${dep.name} for framework project ${rootProject.getName()}`);
				}
			});
			// All framework dependencies are already present in the graph
			return projectGraph;
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

		if (!version) {
			throw new Error(
				`No framework version defined for root project ${rootProject.getName()}`
			);
		}

		let Resolver;
		if (frameworkName === "OpenUI5") {
			Resolver = (await import("../../ui5Framework/Openui5Resolver.js")).default;
		} else if (frameworkName === "SAPUI5") {
			Resolver = (await import("../../ui5Framework/Sapui5Resolver.js")).default;
		}

		if (options.versionOverride) {
			version = await Resolver.resolveVersion(options.versionOverride, {cwd: rootProject.getRootPath()});
			log.info(
				`Overriding configured ${frameworkName} version ` +
				`${frameworkVersion} with version ${version}`
			);
		}

		const referencedLibraries = await utils.getFrameworkLibrariesFromGraph(projectGraph);
		if (!referencedLibraries.length) {
			log.verbose(
				`No ${frameworkName} libraries referenced in project ${rootProject.getName()} ` +
				`or in any of its dependencies`);
			return projectGraph;
		}

		log.info(`Using ${frameworkName} version: ${version}`);

		const resolver = new Resolver({cwd: rootProject.getRootPath(), version});

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
			workspace: options.workspace
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

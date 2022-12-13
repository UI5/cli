import Module from "../Module.js";
import ProjectGraph from "../ProjectGraph.js";
import logger from "@ui5/logger";
const log = logger.getLogger("graph:helpers:ui5Framework");

class ProjectProcessor {
	constructor({libraryMetadata}) {
		this._libraryMetadata = libraryMetadata;
		this._projectGraphPromises = Object.create(null);
	}
	async addProjectToGraph(libName, projectGraph) {
		if (this._projectGraphPromises[libName]) {
			return this._projectGraphPromises[libName];
		}
		return this._projectGraphPromises[libName] = this._addProjectToGraph(libName, projectGraph);
	}
	async _addProjectToGraph(libName, projectGraph) {
		log.verbose(`Creating project for library ${libName}...`);


		if (!this._libraryMetadata[libName]) {
			throw new Error(`Failed to find library ${libName} in dist packages metadata.json`);
		}

		const depMetadata = this._libraryMetadata[libName];

		if (projectGraph.getProject(depMetadata.id)) {
			// Already added
			return;
		}

		const dependencies = await Promise.all(depMetadata.dependencies.map(async (depName) => {
			await this.addProjectToGraph(depName, projectGraph);
			return depName;
		}));

		if (depMetadata.optionalDependencies) {
			const resolvedOptionals = await Promise.all(depMetadata.optionalDependencies.map(async (depName) => {
				if (this._libraryMetadata[depName]) {
					log.verbose(`Resolving optional dependency ${depName} for project ${libName}...`);
					await this.addProjectToGraph(depName, projectGraph);
					return depName;
				}
			}));

			dependencies.push(...resolvedOptionals.filter(($)=>$));
		}

		const ui5Module = new Module({
			id: depMetadata.id,
			version: depMetadata.version,
			modulePath: depMetadata.path
		});
		const {project} = await ui5Module.getSpecifications();
		projectGraph.addProject(project);
		dependencies.forEach((dependency) => {
			projectGraph.declareDependency(libName, dependency);
		});
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
			if (project.isFrameworkProject()) {
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
			if (project.isFrameworkProject()) {
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
	ProjectProcessor
};

/**
 *
 *
 * @private
 * @module @ui5/project/translators/ui5Framework
 */
export default {
	/**
	 *
	 *
	 * @public
	 * @param {@ui5/project/graph/ProjectGraph} projectGraph
	 * @param {object} [options]
	 * @param {string} [options.versionOverride] Framework version to use instead of the root projects framework
	 *   version from the provided <code>tree</code>
	 * @returns {Promise<@ui5/project/graph/ProjectGraph>}
	 *   Promise resolving with the given graph instance to allow method chaining
	 */
	enrichProjectGraph: async function(projectGraph, options = {}) {
		const rootProject = projectGraph.getRoot();

		if (rootProject.isFrameworkProject()) {
			rootProject.getFrameworkDependencies().forEach((dep) => {
				if (utils.shouldIncludeDependency(dep) && !projectGraph.getProject(dep.name)) {
					throw new Error(
						`Missing framework dependency ${dep.name} for project ${rootProject.getName()}`);
				}
			});
			// Ignoring UI5 Framework libraries in dependencies
			return projectGraph;
		}

		const frameworkName = rootProject.getFrameworkName();
		const frameworkVersion = rootProject.getFrameworkVersion();
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

		let Resolver;
		if (frameworkName === "OpenUI5") {
			Resolver = (await import("../../ui5Framework/Openui5Resolver.js")).default;
		} else if (frameworkName === "SAPUI5") {
			Resolver = (await import("../../ui5Framework/Sapui5Resolver.js")).default;
		}

		let version;
		if (!frameworkVersion) {
			throw new Error(
				`No framework version defined for root project ${rootProject.getName()}`
			);
		} else if (options.versionOverride) {
			version = await Resolver.resolveVersion(options.versionOverride, {cwd: rootProject.getPath()});
			log.info(
				`Overriding configured ${frameworkName} version ` +
				`${frameworkVersion} with version ${version}`
			);
		} else {
			version = frameworkVersion;
		}

		const referencedLibraries = await utils.getFrameworkLibrariesFromGraph(projectGraph);
		if (!referencedLibraries.length) {
			log.verbose(
				`No ${frameworkName} libraries referenced in project ${rootProject.getName()} ` +
				`or in any of its dependencies`);
			return projectGraph;
		}

		log.info(`Using ${frameworkName} version: ${version}`);

		const resolver = new Resolver({cwd: rootProject.getPath(), version});

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

		const projectProcessor = new utils.ProjectProcessor({
			libraryMetadata
		});

		const frameworkGraph = new ProjectGraph({
			rootProjectName: `fake-root-of-${rootProject.getName()}-framework-dependency-graph`
		});
		await Promise.all(referencedLibraries.map(async (libName) => {
			await projectProcessor.addProjectToGraph(libName, frameworkGraph);
		}));

		log.verbose("Joining framework graph into project graph...");
		projectGraph.join(frameworkGraph);
		await utils.declareFrameworkDependenciesInGraph(projectGraph);
		return projectGraph;
	},

	// Export for testing only
	_utils: process.env.NODE_ENV === "test" ? utils : /* istanbul ignore next */ undefined
};

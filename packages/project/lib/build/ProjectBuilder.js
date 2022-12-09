import {promisify} from "node:util";
import rimraf from "rimraf";
const rimrafp = promisify(rimraf);
import * as resourceFactory from "@ui5/fs/resourceFactory";
import logger from "@ui5/logger";
const log = logger.getGroupLogger("build");
import composeProjectList from "./helpers/composeProjectList.js";
import BuildContext from "./helpers/BuildContext.js";
import prettyHrtime from "pretty-hrtime";

/**
 * @public
 * @class
 * @alias @ui5/project/build/ProjectBuilder
 */
class ProjectBuilder {
	/**
	 * Build Configuration
	 *
	 * @public
	 * @typedef {object} @ui5/project/build/ProjectBuilder~BuildConfiguration
	 * @property {boolean} [selfContained=false] Flag to activate self contained build
	 * @property {boolean} [cssVariables=false] Flag to activate CSS variables generation
	 * @property {boolean} [jsdoc=false] Flag to activate JSDoc build
	 * @property {boolean} [createBuildManifest=false]
	 *   Whether to create a build manifest file for the root project.
	 *   This is currently only supported for projects of type 'library' and 'theme-library'
	 *   No other dependencies can be included in the build result.
	 * @property {Array.<string>} [includedTasks=[]] List of tasks to be included
	 * @property {Array.<string>} [excludedTasks=[]] List of tasks to be excluded.
	 * 			If the wildcard '*' is provided, only the included tasks will be executed.
	 */

	/**
	 * Executes a project build, including all necessary or requested dependencies
	 *
	 * @public
	 * @param {object} parameters
	 * @param {@ui5/project/graph/ProjectGraph} parameters.graph Project graph
	 * @param {@ui5/project/build/ProjectBuilder~BuildConfiguration} [parameters.buildConfig] Build configuration
	 * @param {@ui5/builder/tasks/taskRepository} parameters.taskRepository Task Repository module to use
	 */
	constructor({graph, buildConfig, taskRepository}) {
		if (!graph) {
			throw new Error(`Missing parameter 'graph'`);
		}
		if (!taskRepository) {
			throw new Error(`Missing parameter 'taskRepository'`);
		}
		if (!graph.isSealed()) {
			throw new Error(
				`Can not build project graph with root node ${graph.getRoot().getName()}: Graph is not sealed`);
		}

		this._graph = graph;
		this._buildContext = new BuildContext(graph, taskRepository, buildConfig);
	}

	/**
	 * Executes a project build, including all necessary or requested dependencies
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.destPath Target path
	 * @param {boolean} [parameters.cleanDest=false] Decides whether project should clean the target path before build
	 * @param {Array.<string|RegExp>} [parameters.includedDependencies=[]]
	 *			List of names of projects to include in the build result
	 *			If the wildcard '*' is provided, all dependencies will be included in the build result.
	 * @param {Array.<string|RegExp>} [parameters.excludedDependencies=[]]
	 *			List of names of projects to exclude from the build result.
	 * @param {object} [parameters.complexDependencyIncludes] TODO 3.0
	 * @returns {Promise} Promise resolving to <code>undefined</code> once build has finished
	 */
	async build({
		destPath, cleanDest = false,
		includedDependencies = [], excludedDependencies = [],
		complexDependencyIncludes
	}) {
		if (!destPath) {
			throw new Error(`Missing parameter 'destPath'`);
		}
		if (complexDependencyIncludes) {
			if (includedDependencies.length || excludedDependencies.length) {
				throw new Error(
					"Parameter 'complexDependencyIncludes' can't be used in conjunction " +
					"with parameters 'includedDependencies' or 'excludedDependencies");
			}
		}
		const rootProjectName = this._graph.getRoot().getName();
		log.info(`Preparing build for project ${rootProjectName}`);
		log.info(`  Target directory: ${destPath}`);

		// Get project filter function based on include/exclude params
		// (also logs some info to console)
		const filterProject = await this._getProjectFilter({
			explicitIncludes: includedDependencies,
			explicitExcludes: excludedDependencies,
			complexDependencyIncludes
		});

		// Count total number of projects to build based on input
		const requestedProjects = this._graph.getAllProjects().map((p) => p.getName()).filter(function(projectName) {
			return filterProject(projectName);
		});

		if (this._buildContext.getBuildConfig().createBuildManifest && requestedProjects.length > 1) {
			throw new Error(
				`It is currently not supported to request the creation of a build manifest ` +
				`while including any dependencies into the build result`);
		}

		const projectBuildContexts = await this._createRequiredBuildContexts(requestedProjects);
		const cleanupSigHooks = this._registerCleanupSigHooks();
		const fsTarget = resourceFactory.createAdapter({
			fsBasePath: destPath,
			virBasePath: "/"
		});

		const queue = [];
		const alreadyBuilt = [];

		// Create build queue based on graph depth-first search to ensure correct build order
		await this._graph.traverseDepthFirst(async ({project}) => {
			const projectName = project.getName();
			const projectBuildContext = projectBuildContexts.get(projectName);
			if (projectBuildContext) {
				// Build context exists
				//	=> This project needs to be built or, in case it has already
				//		been built, it's build result needs to be written out (if requested)
				queue.push(projectBuildContext);
				if (!projectBuildContext.requiresBuild()) {
					alreadyBuilt.push(projectName);
				}
			}
		});
		const buildLogger = log.createTaskLogger("🛠 ");
		buildLogger.addWork(queue.length - alreadyBuilt.length);
		if (queue.length > 1) { // Do not log if only the root project is being built
			log.info(`Processing ${queue.length} projects`);
			if (alreadyBuilt.length) {
				log.info(`  Reusing built results of ${alreadyBuilt.length} projects`);
				log.info(`  Building ${queue.length - alreadyBuilt.length} projects`);
			}

			if (log.isLevelEnabled("verbose")) {
				log.verbose(`  Required projects:`);
				log.verbose(`    ${queue
					.map((projectBuildContext) => {
						const projectName = projectBuildContext.getProject().getName();
						let msg;
						if (alreadyBuilt.includes(projectName)) {
							const buildMetadata = projectBuildContext.getBuildMetadata();
							const ts = new Date(buildMetadata.timestamp).toUTCString();
							msg = `*> ${projectName} /// already built at ${ts}`;
						} else {
							msg = `=> ${projectName}`;
						}
						return msg;
					})
					.join("\n    ")}`);
			}
		}

		if (cleanDest) {
			log.info(`Cleaning target directory...`);
			await rimrafp(destPath);
		}
		const startTime = process.hrtime();
		try {
			const pWrites = [];
			for (const projectBuildContext of queue) {
				const projectName = projectBuildContext.getProject().getName();
				log.verbose(`Processing project ${projectName}...`);

				// Only build projects that are not already build (i.e. provide a matching build manifest)
				if (!alreadyBuilt.includes(projectName)) {
					buildLogger.startWork(`Building project ${projectName}...`);
					await projectBuildContext.getTaskRunner().runTasks();
					buildLogger.completeWork(1);

					log.verbose(`Finished building project ${projectName}`);
				}
				if (!requestedProjects.includes(projectName)) {
					// Project has not been requested
					//	=> Its resources shall not be part of the build result
					continue;
				}

				log.verbose(`Writing out files...`);
				pWrites.push(this._writeResults(projectBuildContext, fsTarget));
			}
			await Promise.all(pWrites);
			log.info(`Build succeeded in ${this._getElapsedTime(startTime)}`);
		} catch (err) {
			log.error(`Build failed in ${this._getElapsedTime(startTime)}`);
			throw err;
		} finally {
			this._deregisterCleanupSigHooks(cleanupSigHooks);
			await this._executeCleanupTasks();
		}
	}

	async _createRequiredBuildContexts(requestedProjects) {
		const allProjects = this._graph.getAllProjects();
		const requiredProjects = new Set(allProjects.filter((project) => {
			return requestedProjects.includes(project.getName());
		}));

		const projectBuildContexts = new Map();

		for (const project of requiredProjects) {
			const projectName = project.getName();
			log.verbose(`Creating build context for project ${projectName}...`);
			const projectBuildContext = this._buildContext.createProjectContext({
				project,
				log
			});

			projectBuildContexts.set(projectName, projectBuildContext);

			if (projectBuildContext.requiresBuild()) {
				const taskRunner = projectBuildContext.getTaskRunner();
				const requiredDependencies = await taskRunner.getRequiredDependencies();

				if (requiredDependencies.size === 0) {
					continue;
				}
				// This project needs to be built and required dependencies to be built as well
				this._graph.getDependencies(projectName).forEach((depName) => {
					if (projectBuildContexts.has(depName)) {
						// Build context already exists
						//	=> Dependency will be built
						return;
					}
					if (!requiredDependencies.has(depName)) {
						return;
					}
					// Add dependency to list of projects to build
					const depProject = this._graph.getProject(depName);
					requiredProjects.add(depProject);
				});
			}
		}

		return projectBuildContexts;
	}

	async _getProjectFilter({
		complexDependencyIncludes,
		explicitIncludes,
		explicitExcludes
	}) {
		const {includedDependencies, excludedDependencies} = await composeProjectList(
			this._graph,
			complexDependencyIncludes || {
				includeDependencyTree: explicitIncludes,
				excludeDependencyTree: explicitExcludes
			}
		);

		if (includedDependencies.length) {
			if (includedDependencies.length === this._graph.getAllProjects().length - 1) {
				log.info(`  Including all dependencies`);
			} else {
				log.info(`  Requested dependencies:`);
				log.info(`    + ${includedDependencies.join("\n    + ")}`);
			}
		}
		if (excludedDependencies.length) {
			log.info(`  Excluded dependencies:`);
			log.info(`    - ${excludedDependencies.join("\n    + ")}`);
		}

		const rootProjectName = this._graph.getRoot().getName();
		return function projectFilter(projectName) {
			function projectMatchesAny(deps) {
				return deps.some((dep) => dep instanceof RegExp ?
					dep.test(projectName) : dep === projectName);
			}

			if (projectName === rootProjectName) {
				// Always include the root project
				return true;
			}

			if (projectMatchesAny(excludedDependencies)) {
				return false;
			}

			if (includedDependencies.includes("*") || projectMatchesAny(includedDependencies)) {
				return true;
			}

			return false;
		};
	}

	async _writeResults(projectBuildContext, target) {
		const project = projectBuildContext.getProject();
		const taskUtil = projectBuildContext.getTaskUtil();
		const buildConfig = this._buildContext.getBuildConfig();
		const reader = project.getReader({
			// Force buildtime (=namespaced) style when writing with a build manifest
			style: taskUtil.isRootProject() && buildConfig.createBuildManifest ? "buildtime" : "runtime"
		});
		const resources = await reader.byGlob("/**/*");

		if (taskUtil.isRootProject() && buildConfig.createBuildManifest) {
			// Create and write a build manifest metadata file
			const {
				default: createBuildManifest
			} = await import("./helpers/createBuildManifest.js");
			const metadata = await createBuildManifest(project, buildConfig, this._buildContext.getTaskRepository());
			await target.write(resourceFactory.createResource({
				path: `/.ui5/build-manifest.json`,
				string: JSON.stringify(metadata, null, "\t")
			}));
		}

		await Promise.all(resources.map((resource) => {
			if (taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult)) {
				log.silly(`Skipping write of resource tagged as "OmitFromBuildResult": ` +
					resource.getPath());
				return; // Skip target write for this resource
			}
			return target.write(resource);
		}));
	}

	async _executeCleanupTasks() {
		log.info("Executing cleanup tasks...");
		await this._buildContext.executeCleanupTasks();
	}

	_registerCleanupSigHooks() {
		const that = this;
		function createListener(exitCode) {
			return function() {
				// Asynchronously cleanup resources, then exit
				that._executeCleanupTasks().then(() => {
					process.exit(exitCode);
				});
			};
		}

		const processSignals = {
			"SIGHUP": createListener(128 + 1),
			"SIGINT": createListener(128 + 2),
			"SIGTERM": createListener(128 + 15),
			"SIGBREAK": createListener(128 + 21)
		};

		for (const signal of Object.keys(processSignals)) {
			process.on(signal, processSignals[signal]);
		}

		// TODO: Also cleanup for unhandled rejections and exceptions?
		// Add additional events like signals since they are registered on the process
		//	event emitter in a similar fashion
		// processSignals["unhandledRejection"] = createListener(1);
		// process.once("unhandledRejection", processSignals["unhandledRejection"]);
		// processSignals["uncaughtException"] = function(err, origin) {
		// 	const fs = require("fs");
		// 	fs.writeSync(
		// 		process.stderr.fd,
		// 		`Caught exception: ${err}\n` +
		// 		`Exception origin: ${origin}`
		// 	);
		// 	createListener(1)();
		// };
		// process.once("uncaughtException", processSignals["uncaughtException"]);

		return processSignals;
	}

	_deregisterCleanupSigHooks(signals) {
		for (const signal of Object.keys(signals)) {
			process.removeListener(signal, signals[signal]);
		}
	}

	/**
	 * Calculates the elapsed build time and returns a prettified output
	 *
	 * @private
	 * @param {Array} startTime Array provided by <code>process.hrtime()</code>
	 * @returns {string} Difference between now and the provided time array as formatted string
	 */
	_getElapsedTime(startTime) {
		const timeDiff = process.hrtime(startTime);
		return prettyHrtime(timeDiff);
	}
}

export default ProjectBuilder;

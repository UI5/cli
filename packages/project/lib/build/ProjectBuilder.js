const {promisify} = require("util");
const rimraf = promisify(require("rimraf"));
const resourceFactory = require("@ui5/fs").resourceFactory;
const log = require("@ui5/logger").getGroupLogger("build");
const composeProjectList = require("./helpers/composeProjectList");
const BuildContext = require("./helpers/BuildContext");

class ProjectBuilder {
	/**
	 * Build Configuration
	 *
	 * @public
	 * @typedef {object} BuildConfiguration
	 * @param {boolean} [selfContained=false] Flag to activate self contained build
	 * @param {boolean} [cssVariables=false] Flag to activate CSS variables generation
	 * @param {boolean} [jsdoc=false] Flag to activate JSDoc build
	 * @param {boolean} [createBuildManifest=false]
	 * 			Whether to create a build manifest file for the root project.
	 *			This is currently only supported for projects of type 'library' and 'theme-library'
	 * @param {Array.<string>} [includedTasks=[]] List of tasks to be included
	 * @param {Array.<string>} [excludedTasks=[]] List of tasks to be excluded.
	 * 			If the wildcard '*' is provided, only the included tasks will be executed.
	 */

	/**
	 * Executes a project build, including all necessary or requested dependencies
	 *
	 * @public
	 * @param {module:@ui5/project.graph.ProjectGraph} graph Project graph
	 * @param {module:@ui5/project.build.ProjectBuilder.BuildConfiguration} [buildConfig] Build configuration
	 */
	constructor(graph, buildConfig) {
		if (!graph) {
			throw new Error(`Missing parameter 'graph'`);
		}
		if (!graph.isSealed()) {
			throw new Error(
				`Can not build project graph with root node ${graph.getRoot().getName()}: Graph is not sealed`);
		}

		this._graph = graph;
		this._buildContext = new BuildContext(graph, buildConfig);
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

		const projectBuildContexts = this._createRequiredBuildContexts(requestedProjects);

		// Collect all projects that need to be built (i.e. do not have a matching build manifest)
		const projectsToBuild = [];
		projectBuildContexts.forEach((projectBuildContext, projectName) => {
			if (projectBuildContext.getTaskRunner().requiresBuild()) {
				projectsToBuild.push(projectName);
			}
		});

		const cleanupSigHooks = this._registerCleanupSigHooks();
		const buildLogger = log.createTaskLogger("🛠 ");
		buildLogger.addWork(projectsToBuild.length);
		log.info(`  Projects required to build: `);
		log.info(`    > ${projectsToBuild.join("\n    > ")}`);

		const fsTarget = resourceFactory.createAdapter({
			fsBasePath: destPath,
			virBasePath: "/"
		});

		if (cleanDest) {
			log.info(`Cleaning target directory...`);
			await rimraf(destPath);
		}
		const startTime = process.hrtime();
		try {
			const pWrites = [];
			const buildQueue = [];


			// Create build queue based on graph depth-first search to ensure correct build order
			await this._graph.traverseDepthFirst(async ({project}) => {
				const projectName = project.getName();
				const projectBuildContext = projectBuildContexts.get(projectName);
				if (projectBuildContext) {
					// Build context exists
					//	=> This project shall be built
					buildQueue.push(projectBuildContext);
				}
			});

			for (const projectBuildContext of buildQueue) {
				const projectName = projectBuildContext.getProject().getName();
				buildLogger.startWork(`Building project ${projectName}...`);
				await this._buildProject(projectBuildContext);
				buildLogger.completeWork(1);

				log.verbose(`Finished building project ${projectName}`);
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

	_createRequiredBuildContexts(requestedProjects) {
		const allProjects = this._graph.getAllProjects();
		const requiredProjects = new Set(allProjects.filter((project) => {
			return requestedProjects.includes(project.getName());
		}));

		const projectBuildContexts = new Map();
		requiredProjects.forEach((project) => {
			const projectName = project.getName();
			log.verbose(`Creating build context for project ${projectName}...`);
			const projectBuildContext = this._buildContext.createProjectContext({
				project,
				log
			});

			const taskRunner = projectBuildContext.getTaskRunner();
			projectBuildContexts.set(projectName, projectBuildContext);

			if (taskRunner.requiresBuild() && taskRunner.requiresDependencies()) {
				// This project needs to be built and required dependencies to be built as well
				this._graph.getDependencies(projectName).forEach((depName) => {
					if (projectBuildContexts.has(depName)) {
						// Build context already exists
						//	=> Dependency will be built
						return;
					}
					// Add dependency to list of projects to build
					const depProject = this._graph.getProject(depName);
					requiredProjects.add(depProject);
				});
			}
		});
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
			log.info(`  Requested dependencies:`);
			log.info(`    + ${includedDependencies.join("\n    + ")}`);
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

	async _buildProject(projectBuildContext) {
		const project = projectBuildContext.getProject();
		const taskRunner = projectBuildContext.getTaskRunner();

		// Create readers for all dependencies
		const readers = [];
		await this._graph.traverseBreadthFirst(project.getName(), async function({project: dep}) {
			if (dep.getName() === project.getName()) {
				// Ignore project itself
				return;
			}
			readers.push(dep.getReader());
		});

		const dependencies = resourceFactory.createReaderCollection({
			name: `Dependency reader collection for project ${project.getName()}`,
			readers
		});

		await taskRunner.runTasks({
			workspace: project.getWorkspace(),
			dependencies,
		});
	}

	async _writeResults(projectBuildContext, target) {
		const project = projectBuildContext.getProject();
		const taskUtil = projectBuildContext.getTaskUtil();
		const buildConfig = this._buildContext.getBuildConfig();
		const resources = await project.getReader({
			// Force buildtime (=namespaced) style when writing with a build manifest
			style: taskUtil.isRootProject() && buildConfig.createBuildManifest ? "buildtime" : "runtime"
		}).byGlob("/**/*");

		if (taskUtil.isRootProject() && buildConfig.createBuildManifest) {
			// Create and write a build manifest metadata file
			const createBuildManifest = require("./build/helpers/createBuildManifest");
			const metadata = await createBuildManifest(project, buildConfig);
			await target.write(resourceFactory.createResource({
				path: `/.ui5/build-manifest.json`,
				string: JSON.stringify(metadata, null, "\t")
			}));
		}

		await Promise.all(resources.map((resource) => {
			if (taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult)) {
				log.verbose(`Skipping write of resource tagged as "OmitFromBuildResult": ` +
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
		const prettyHrtime = require("pretty-hrtime");
		const timeDiff = process.hrtime(startTime);
		return prettyHrtime(timeDiff);
	}
}

module.exports = ProjectBuilder;

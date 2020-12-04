const {promisify} = require("util");
const rimraf = promisify(require("rimraf"));
const resourceFactory = require("@ui5/fs").resourceFactory;
const log = require("@ui5/logger").getGroupLogger("builder");
const BuildContext = require("./buildHelpers/BuildContext");
const composeProjectList = require("./buildHelpers/composeProjectList");
const getBuildDefinitionInstance = require("./buildDefinitions/getInstance");

async function executeCleanupTasks(buildContext) {
	log.info("Executing cleanup tasks...");
	await buildContext.executeCleanupTasks();
}

function registerCleanupSigHooks(buildContext) {
	function createListener(exitCode) {
		return function() {
			// Asynchronously cleanup resources, then exit
			executeCleanupTasks(buildContext).then(() => {
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

	// == TO BE DISCUSSED: Also cleanup for unhandled rejections and exceptions?
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

function deregisterCleanupSigHooks(signals) {
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
function getElapsedTime(startTime) {
	const prettyHrtime = require("pretty-hrtime");
	const timeDiff = process.hrtime(startTime);
	return prettyHrtime(timeDiff);
}

/**
 * Configures the project build and starts it.
 *
 * @public
 * @param {object} parameters Parameters
 * @param {module:@ui5/project.graph.ProjectGraph} parameters.graph Project graph
 * @param {string} parameters.destPath Target path
 * @param {boolean} [parameters.cleanDest=false] Decides whether project should clean the target path before build
 * @param {Array.<string|RegExp>} [parameters.includedDependencies=[]]
 *			List of names of projects to include in the build result
 *			If the wildcard '*' is provided, all dependencies will be included in the build result.
 * @param {Array.<string|RegExp>} [parameters.excludedDependencies=[]]
 *			List of names of projects to exclude from the build result.
 * @param {object} [parameters.complexDependencyIncludes] TODO 3.0
 * @param {boolean} [parameters.selfContained=false] Flag to activate self contained build
 * @param {boolean} [parameters.cssVariables=false] Flag to activate CSS variables generation
 * @param {boolean} [parameters.jsdoc=false] Flag to activate JSDoc build
 * @param {boolean} [parameters.createBuildManifest=false] Whether to create a build manifest file for the root project.
 *									This is currently only supported for projects of type 'library' and 'theme-library'
 * @param {Array.<string>} [parameters.includedTasks=[]] List of tasks to be included
 * @param {Array.<string>} [parameters.excludedTasks=[]] List of tasks to be excluded.
 * 							If the wildcard '*' is provided, only the included tasks will be executed.
 * @returns {Promise} Promise resolving to <code>undefined</code> once build has finished
 */
module.exports = async function({
	graph, destPath, cleanDest = false,
	includedDependencies = [], excludedDependencies = [],
	complexDependencyIncludes,
	selfContained = false, cssVariables = false, jsdoc = false, createBuildManifest = false,
	includedTasks = [], excludedTasks = [],
}) {
	if (!graph) {
		throw new Error(`Missing parameter 'graph'`);
	}
	if (!destPath) {
		throw new Error(`Missing parameter 'destPath'`);
	}
	if (graph.isSealed()) {
		throw new Error(
			`Can not build project graph with root node ${this._rootProjectName}: Graph has already been sealed`);
	}

	if (complexDependencyIncludes) {
		if (includedDependencies.length || excludedDependencies.length) {
			throw new Error(
				"Parameter 'complexDependencyIncludes' can't be used in conjunction " +
				"with parameters 'includedDependencies' or 'excludedDependencies");
		}
		({includedDependencies, excludedDependencies} = await composeProjectList(graph, complexDependencyIncludes));
	} else if (includedDependencies.length || excludedDependencies.length) {
		({includedDependencies, excludedDependencies} = await composeProjectList(graph, {
			includeDependencyTree: includedDependencies,
			excludeDependencyTree: excludedDependencies
		}));
	}

	const startTime = process.hrtime();
	const rootProjectName = graph.getRoot().getName();

	if (createBuildManifest && !["library", "theme-library"].includes(graph.getRoot().getType())) {
		throw new Error(
			`Build manifest creation is currently not supported for projects of type ${graph.getRoot().getType()}`);
	}

	log.info(`Building project ${rootProjectName}`);
	if (includedDependencies.length) {
		log.info(`  Requested dependencies:`);
		log.info(`    + ${includedDependencies.join("\n    + ")}`);
	}
	if (excludedDependencies.length) {
		log.info(`  Excluded dependencies:`);
		log.info(`    - ${excludedDependencies.join("\n    + ")}`);
	}
	log.info(`  Target directory: ${destPath}`);

	const buildConfig = {selfContained, jsdoc, includedTasks, excludedTasks};

	const fsTarget = resourceFactory.createAdapter({
		fsBasePath: destPath,
		virBasePath: "/"
	});

	const buildContext = new BuildContext({
		graph,
		options: {
			cssVariables
		}
	});
	const cleanupSigHooks = registerCleanupSigHooks(buildContext);
	function projectFilter(projectName) {
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
	}

	// Count total number of projects to build
	const requestedProjects = graph.getAllProjects().map((p) => p.getName()).filter(function(projectName) {
		return projectFilter(projectName);
	});

	try {
		const buildableProjects = {};
		// Copy list of requested projects. We might need to build more projects than requested to
		// in order to satisfy tasks requiring dependencies to be built but we will still only write the
		// resources of the requested projects to the build result
		let projectsToBuild = [...requestedProjects];

		const buildLogger = log.createTaskLogger("🛠 ");
		await graph.traverseBreadthFirst(async function({project, getDependencies}) {
			const projectName = project.getName();
			const projectContext = buildContext.createProjectContext({
				project,
				log: buildLogger
			});
			log.verbose(`Preparing project ${projectName}...`);

			const taskUtil = projectContext.getTaskUtil();
			const builder = getBuildDefinitionInstance({
				graph,
				project,
				taskUtil,
				parentLogger: log
			});
			buildableProjects[projectName] = {
				projectContext,
				builder
			};

			if (projectsToBuild.includes(projectName) && builder.requiresDependencies(buildConfig)) {
				getDependencies().forEach((dep) => {
					const depName = dep.getName();
					if (project.hasBuildManifest() && !dep.hasBuildManifest()) {
						throw new Error(
							`Project ${depName} must provide a build manifest since it is a dependency of ` +
							`project ${projectName} which already provides a build manifest and therefore ` +
							`cannot be re-built`);
					}
					if (!projectsToBuild.includes(depName)) {
						log.info(`Project ${projectName} requires dependency ${depName} to be built`);
						projectsToBuild.push(depName);
					}
				});
			}
		});

		projectsToBuild = projectsToBuild.filter((projectName) => {
			if (graph.getProject(projectName).hasBuildManifest()) {
				log.verbose(`Found a build manifest for project ${projectName}. Skipping build.`);
				return false;
			}
			return true;
		});

		buildLogger.addWork(projectsToBuild.length);
		log.info(`Projects required to build: `);
		log.info(`    > ${projectsToBuild.join("\n    > ")}`);

		if (cleanDest) {
			await rimraf(destPath);
		}

		await graph.traverseDepthFirst(async function({project, getDependencies}) {
			const projectName = project.getName();
			if (!projectsToBuild.includes(projectName)) {
				return;
			}
			const {projectContext, builder} = buildableProjects[projectName];

			buildLogger.startWork(`Building project ${project.getName()}...`);

			const readers = [];
			await graph.traverseBreadthFirst(project.getName(), async function({project: dep}) {
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

			await builder.build(buildConfig, {
				workspace: project.getWorkspace(),
				dependencies,
			});
			log.verbose("Finished building project %s", project.getName());
			buildLogger.completeWork(1);

			if (!requestedProjects.includes(projectName)) {
				// This project shall not be part of the build result
				return;
			}

			log.verbose(`Writing out files...`);
			const taskUtil = projectContext.getTaskUtil();
			const resources = await project.getReader({
				// Force buildtime (=namespaced) style when writing with a build manifest
				style: taskUtil.isRootProject() && createBuildManifest ? "buildtime" : "runtime"
			}).byGlob("/**/*");

			if (taskUtil.isRootProject() && createBuildManifest) {
				// Create and write a build manifest metadata file
				const createBuildManifest = require("./buildHelpers/createBuildManifest");
				const metadata = await createBuildManifest(project, buildConfig);
				await fsTarget.write(resourceFactory.createResource({
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
				return fsTarget.write(resource);
			}));
		});
		log.info(`Build succeeded in ${getElapsedTime(startTime)}`);
	} catch (err) {
		log.error(`Build failed in ${getElapsedTime(startTime)}`);
		throw err;
	} finally {
		deregisterCleanupSigHooks(cleanupSigHooks);
		await executeCleanupTasks(buildContext);
	}
};

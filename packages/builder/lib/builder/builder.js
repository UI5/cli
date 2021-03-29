const {promisify} = require("util");
const rimraf = promisify(require("rimraf"));
const log = require("@ui5/logger").getGroupLogger("builder:builder");
const resourceFactory = require("@ui5/fs").resourceFactory;
const MemAdapter = require("@ui5/fs").adapters.Memory;
const typeRepository = require("../types/typeRepository");
const taskRepository = require("../tasks/taskRepository");
const BuildContext = require("./BuildContext");


// Set of tasks for development
const devTasks = [
	"replaceCopyright",
	"replaceVersion",
	"buildThemes"
];

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
 * Creates the list of tasks to be executed by the build process
 *
 * Sets specific tasks to be disabled by default, these tasks need to be included explicitly.
 * Based on the selected build mode (dev|selfContained|preload), different tasks are enabled.
 * Tasks can be enabled or disabled. The wildcard <code>*</code> is also supported and affects all tasks.
 *
 * @private
 * @param {object} parameters
 * @param {boolean} parameters.dev Sets development mode, which only runs essential tasks
 * @param {boolean} parameters.selfContained
 *			True if a the build should be self-contained or false for prelead build bundles
 * @param {boolean} parameters.jsdoc True if a JSDoc build should be executed
 * @param {Array} parameters.includedTasks Task list to be included from build
 * @param {Array} parameters.excludedTasks Task list to be excluded from build
 * @returns {Array} Return a task list for the builder
 */
function composeTaskList({dev, selfContained, jsdoc, includedTasks, excludedTasks}) {
	const definedTasks = taskRepository.getAllTaskNames();
	let selectedTasks = definedTasks.reduce((list, key) => {
		list[key] = true;
		return list;
	}, {});

	// Exclude non default tasks
	selectedTasks.generateManifestBundle = false;
	selectedTasks.generateStandaloneAppBundle = false;
	selectedTasks.transformBootstrapHtml = false;
	selectedTasks.generateJsdoc = false;
	selectedTasks.executeJsdocSdkTransformation = false;
	selectedTasks.generateCachebusterInfo = false;
	selectedTasks.generateApiIndex = false;
	selectedTasks.generateThemeDesignerResources = false;

	// Disable generateResourcesJson due to performance.
	// When executed it analyzes each module's AST and therefore
	// takes up much time (~10% more)
	selectedTasks.generateResourcesJson = false;

	if (selfContained) {
		// No preloads, bundle only
		selectedTasks.generateComponentPreload = false;
		selectedTasks.generateStandaloneAppBundle = true;
		selectedTasks.transformBootstrapHtml = true;
		selectedTasks.generateLibraryPreload = false;
	}

	// TODO 3.0: exclude generateVersionInfo if not --all is used

	if (jsdoc) {
		// Include JSDoc tasks
		selectedTasks.generateJsdoc = true;
		selectedTasks.executeJsdocSdkTransformation = true;
		selectedTasks.generateApiIndex = true;

		// Include theme build as required for SDK
		selectedTasks.buildThemes = true;

		// Exclude all tasks not relevant to JSDoc generation
		selectedTasks.replaceCopyright = false;
		selectedTasks.replaceVersion = false;
		selectedTasks.generateComponentPreload = false;
		selectedTasks.generateLibraryPreload = false;
		selectedTasks.generateLibraryManifest = false;
		selectedTasks.createDebugFiles = false;
		selectedTasks.uglify = false;
		selectedTasks.generateFlexChangesBundle = false;
		selectedTasks.generateManifestBundle = false;
	}

	// Only run essential tasks in development mode, it is not desired to run time consuming tasks during development.
	if (dev) {
		// Overwrite all other tasks with noop promise
		Object.keys(selectedTasks).forEach((key) => {
			if (devTasks.indexOf(key) === -1) {
				selectedTasks[key] = false;
			}
		});
	}

	// Exclude tasks
	for (let i = 0; i < excludedTasks.length; i++) {
		const taskName = excludedTasks[i];
		if (taskName === "*") {
			Object.keys(selectedTasks).forEach((sKey) => {
				selectedTasks[sKey] = false;
			});
			break;
		}
		if (selectedTasks[taskName] === true) {
			selectedTasks[taskName] = false;
		} else if (typeof selectedTasks[taskName] === "undefined") {
			log.warn(`Unable to exclude task '${taskName}': Task is unknown`);
		}
	}

	// Include tasks
	for (let i = 0; i < includedTasks.length; i++) {
		const taskName = includedTasks[i];
		if (taskName === "*") {
			Object.keys(selectedTasks).forEach((sKey) => {
				selectedTasks[sKey] = true;
			});
			break;
		}
		if (selectedTasks[taskName] === false) {
			selectedTasks[taskName] = true;
		} else if (typeof selectedTasks[taskName] === "undefined") {
			log.warn(`Unable to include task '${taskName}': Task is unknown`);
		}
	}

	// Filter only for tasks that will be executed
	selectedTasks = Object.keys(selectedTasks).filter((task) => selectedTasks[task]);

	return selectedTasks;
}

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
 * Builder
 *
 * @public
 * @namespace
 * @alias module:@ui5/builder.builder
 */
module.exports = {
	/**
	 * Configures the project build and starts it.
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {object} parameters.tree Project tree as generated by the
	 * 									[@ui5/project.normalizer]{@link module:@ui5/project.normalizer}
	 * @param {string} parameters.destPath Target path
	 * @param {boolean} [parameters.cleanDest=false] Decides whether project should clean the target path before build
	 * @param {boolean} [parameters.buildDependencies=false] Decides whether project dependencies are built as well
	 * @param {Array.<string|RegExp>} [parameters.includedDependencies=[]]
	 *			List of build dependencies to be included if buildDependencies is true
	 * @param {Array.<string|RegExp>} [parameters.excludedDependencies=[]]
	 *			List of build dependencies to be excluded if buildDependencies is true.
	 *			If the wildcard '*' is provided, only the included dependencies will be built.
	 * @param {boolean} [parameters.dev=false]
	 *			Decides whether a development build should be activated (skips non-essential and time-intensive tasks)
	 * @param {boolean} [parameters.selfContained=false] Flag to activate self contained build
	 * @param {boolean} [parameters.jsdoc=false] Flag to activate JSDoc build
	 * @param {Array.<string>} [parameters.includedTasks=[]] List of tasks to be included
	 * @param {Array.<string>} [parameters.excludedTasks=[]] List of tasks to be excluded.
	 * 							If the wildcard '*' is provided, only the included tasks will be executed.
	 * @param {Array.<string>} [parameters.devExcludeProject=[]] List of projects to be excluded from development build
	 * @returns {Promise} Promise resolving to <code>undefined</code> once build has finished
	 */
	async build({
		tree, destPath, cleanDest = false,
		buildDependencies = false, includedDependencies = [], excludedDependencies = [],
		dev = false, selfContained = false, jsdoc = false,
		includedTasks = [], excludedTasks = [], devExcludeProject = []
	}) {
		const startTime = process.hrtime();
		log.info(`Building project ${tree.metadata.name}` + (buildDependencies ? "" : " not") +
			" including dependencies..." + (dev ? " [dev mode]" : ""));
		log.verbose(`Building to ${destPath}...`);

		const selectedTasks = composeTaskList({dev, selfContained, jsdoc, includedTasks, excludedTasks});

		const fsTarget = resourceFactory.createAdapter({
			fsBasePath: destPath,
			virBasePath: "/"
		});

		const buildContext = new BuildContext({rootProject: tree});
		const cleanupSigHooks = registerCleanupSigHooks(buildContext);

		const projects = {}; // Unique project index to prevent building the same project multiple times
		const projectWriters = {}; // Collection of memory adapters of already built libraries
		function projectFilter(project) {
			function projectMatchesAny(deps) {
				return deps.some((dep) => dep instanceof RegExp ?
					dep.test(project.metadata.name) : dep === project.metadata.name);
			}

			// if everything is included, this overrules exclude lists
			if (includedDependencies.includes("*")) return true;
			let test = !excludedDependencies.includes("*"); // exclude everything?

			if (test && projectMatchesAny(excludedDependencies)) {
				test = false;
			}
			if (!test && projectMatchesAny(includedDependencies)) {
				test = true;
			}

			return test;
		}

		const projectCountMarker = {};
		function projectCount(project, count = 0) {
			if (buildDependencies) {
				count = project.dependencies.filter(projectFilter).reduce((depCount, depProject) => {
					return projectCount(depProject, depCount);
				}, count);
			}
			if (!projectCountMarker[project.metadata.name]) {
				count++;
				projectCountMarker[project.metadata.name] = true;
			}
			return count;
		}
		const buildLogger = log.createTaskLogger("🛠 ", projectCount(tree));

		function buildProject(project) {
			let depPromise;
			let projectTasks = selectedTasks;

			// Build dependencies in sequence as it is far easier to detect issues and reduces
			// side effects or other issues such as too many open files
			if (buildDependencies) {
				depPromise = project.dependencies.filter(projectFilter).reduce(function(p, depProject) {
					return p.then(() => buildProject(depProject));
				}, Promise.resolve());
			} else {
				depPromise = Promise.resolve();
			}

			// Build the project after all dependencies have been built
			return depPromise.then(() => {
				if (projects[project.metadata.name]) {
					return Promise.resolve();
				} else {
					projects[project.metadata.name] = true;
				}
				buildLogger.startWork(`Building project ${project.metadata.name}`);

				const projectType = typeRepository.getType(project.type);
				const resourceCollections = resourceFactory.createCollectionsForTree(project, {
					virtualReaders: projectWriters,
					getVirtualBasePathPrefix: function({project, virBasePath}) {
						if (project.type === "application" && project.metadata.namespace) {
							return "/resources/" + project.metadata.namespace;
						}
					},
					getProjectExcludes: function(project) {
						if (project.builder && project.builder.resources) {
							return project.builder.resources.excludes;
						}
					}
				});

				const writer = new MemAdapter({
					virBasePath: "/"
				});
				// Store project writer as virtual reader for parent projects
				//	so they can access the build results of this project
				projectWriters[project.metadata.name] = writer;

				// TODO: Add getter for writer of DuplexColection
				const workspace = resourceFactory.createWorkspace({
					virBasePath: "/",
					writer,
					reader: resourceCollections.source,
					name: project.metadata.name
				});

				const projectContext = buildContext.createProjectContext({
					project, // TODO 2.0: Add project facade object/instance here
					resources: {
						workspace,
						dependencies: resourceCollections.dependencies
					}
				});

				const TaskUtil = require("../tasks/TaskUtil");
				const taskUtil = new TaskUtil({
					projectBuildContext: projectContext
				});

				if (dev && devExcludeProject.indexOf(project.metadata.name) !== -1) {
					projectTasks = composeTaskList({dev: false, selfContained, includedTasks, excludedTasks});
				}

				return projectType.build({
					resourceCollections: {
						workspace,
						dependencies: resourceCollections.dependencies
					},
					tasks: projectTasks,
					project,
					parentLogger: log,
					taskUtil
				}).then(() => {
					log.verbose("Finished building project %s. Writing out files...", project.metadata.name);
					buildLogger.completeWork(1);

					return workspace.byGlob("/**/*.*").then((resources) => {
						const tagCollection = projectContext.getResourceTagCollection();
						return Promise.all(resources.map((resource) => {
							if (tagCollection.getTag(resource, projectContext.STANDARD_TAGS.OmitFromBuildResult)) {
								log.verbose(`Skipping write of resource tagged as "OmitFromBuildResult": ` +
									resource.getPath());
								return; // Skip target write for this resource
							}
							if (projectContext.isRootProject() && project.type === "application" &&
									project.metadata.namespace) {
								// Root-application projects only: Remove namespace prefix if given
								resource.setPath(resource.getPath().replace(
									new RegExp(`^/resources/${project.metadata.namespace}`), ""));
							}
							return fsTarget.write(resource);
						}));
					});
				});
			});
		}

		try {
			if (cleanDest) {
				await rimraf(destPath);
			}
			await buildProject(tree);
			log.info(`Build succeeded in ${getElapsedTime(startTime)}`);
		} catch (err) {
			log.error(`Build failed in ${getElapsedTime(startTime)}`);
			throw err;
		} finally {
			deregisterCleanupSigHooks(cleanupSigHooks);
			await executeCleanupTasks(buildContext);
		}
	}
};

// Export local function for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	module.exports._composeTaskList = composeTaskList;
}

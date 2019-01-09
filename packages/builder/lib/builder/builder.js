const log = require("@ui5/logger").getGroupLogger("builder:builder");
const resourceFactory = require("@ui5/fs").resourceFactory;
const typeRepository = require("../types/typeRepository");
const taskRepository = require("../tasks/taskRepository");

const definedTasks = taskRepository.getAllTasks();

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
 * @param {Object} parameters
 * @param {boolean} parameters.dev Sets development mode, which only runs essential tasks
 * @param {boolean} parameters.selfContained True if a the build should be self-contained or false for prelead build bundles
 * @param {Array} parameters.includedTasks Task list to be included from build
 * @param {Array} parameters.excludedTasks Task list to be excluded from build
 * @returns {Array} Return a task list for the builder
 */
function composeTaskList({dev, selfContained, includedTasks, excludedTasks}) {
	let selectedTasks = Object.keys(definedTasks).reduce((list, key) => {
		list[key] = true;
		return list;
	}, {});

	// Exclude tasks: manifestBundler
	selectedTasks.generateManifestBundle = false;
	selectedTasks.generateStandaloneAppBundle = false;
	selectedTasks.transformBootstrapHtml = false;

	if (selfContained) {
		// No preloads, bundle only
		selectedTasks.generateComponentPreload = false;
		selectedTasks.generateStandaloneAppBundle = true;
		selectedTasks.transformBootstrapHtml = true;
		selectedTasks.generateLibraryPreload = false;
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
		if (selectedTasks[taskName] !== false) {
			selectedTasks[taskName] = false;
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
		}
	}

	// Filter only for tasks that will be executed
	selectedTasks = Object.keys(selectedTasks).filter((task) => selectedTasks[task]);

	return selectedTasks;
}

/**
 * Builder
 *
 * @public
 * @namespace
 * @alias module:@ui5/builder.builder
 */
module.exports = {
	tasks: definedTasks,

	/**
	 * Configures the project build and starts it.
	 *
	 * @public
	 * @param {Object} parameters Parameters
	 * @param {Object} parameters.tree Dependency tree
	 * @param {string} parameters.destPath Target path
	 * @param {boolean} [parameters.buildDependencies=false] Decides whether project dependencies are built as well
	 * @param {boolean} [parameters.dev=false] Decides whether a development build should be activated (skips non-essential and time-intensive tasks)
	 * @param {boolean} [parameters.selfContained=false] Flag to activate self contained build
	 * @param {Array} [parameters.includedTasks=[]] List of tasks to be included
	 * @param {Array} [parameters.excludedTasks=[]] List of tasks to be excluded. If the wildcard '*' is provided, only the included tasks will be executed.
	 * @param {Array} [parameters.devExcludeProject=[]] List of projects to be excluded from development build
	 * @returns {Promise} Promise resolving to <code>undefined</code> once build has finished
	 */
	build({
		tree, destPath,
		buildDependencies = false, dev = false, selfContained = false,
		includedTasks = [], excludedTasks = [], devExcludeProject = []
	}) {
		const startTime = process.hrtime();
		log.info(`Building project ${tree.metadata.name}` + (buildDependencies ? "" : " not") +
			" including dependencies..." + (dev ? " [dev mode]" : ""));
		log.verbose(`Building to ${destPath}...`);

		const selectedTasks = composeTaskList({dev, selfContained, includedTasks, excludedTasks});

		const fsTarget = resourceFactory.createAdapter({
			fsBasePath: destPath,
			virBasePath: "/"
		});


		const projects = {}; // Unique project index to prevent building the same project multiple times

		const projectCountMarker = {};
		function projectCount(project, count = 0) {
			if (buildDependencies) {
				count = project.dependencies.reduce((depCount, depProject) => {
					return projectCount(depProject, depCount);
				}, count);
			}
			if (!projectCountMarker[project.metadata.name]) {
				count++;
				projectCountMarker[project.metadata.name] = true;
			}
			return count;
		}
		const iProjectCount = projectCount(tree);
		const buildLogger = log.createTaskLogger("🛠 ", iProjectCount);

		function buildProject(project) {
			let depPromise;
			let projectTasks = selectedTasks;
			if (buildDependencies) {
				// Build dependencies in sequence as it is far easier to detect issues and reduces
				// side effects or other issues such as too many open files
				depPromise = project.dependencies.reduce(function(p, depProject) {
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
					useNamespaces: true
				});

				const workspace = resourceFactory.createWorkspace({
					reader: resourceCollections.source,
					name: project.metadata.name
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
					parentLogger: log
				}).then(() => {
					log.verbose("Finished building project %s. Writing out files...", project.metadata.name);
					buildLogger.completeWork(1);

					return workspace.byGlob("/**/*.*").then((resources) => {
						return Promise.all(resources.map((resource) => {
							if (project === tree && project.metadata.namespace) {
								// Root-project only: Remove namespace prefix if given
								resource.setPath(resource.getPath().replace(
									new RegExp(`^/resources/${project.metadata.namespace}`), ""));
							}
							return fsTarget.write(resource);
						}));
					});
				});
			});
		}

		return buildProject(tree).then(() => {
			log.info(`Build succeeded in ${getElapsedTime(startTime)}`);
		}, (err) => {
			log.error(`Build failed in ${getElapsedTime(startTime)}`);
			throw err;
		});
	}
};

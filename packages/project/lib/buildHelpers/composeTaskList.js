const log = require("@ui5/logger").getLogger("buildHelpers:composeTaskList");

/**
 * Creates the list of tasks to be executed by the build process
 *
 * Sets specific tasks to be disabled by default, these tasks need to be included explicitly.
 * Based on the selected build mode (selfContained|preload), different tasks are enabled.
 * Tasks can be enabled or disabled. The wildcard <code>*</code> is also supported and affects all tasks.
 *
 * @private
 * @param {string[]} allTasks
 * @param {object} parameters
 * @param {boolean} parameters.selfContained
 *			True if a the build should be self-contained or false for prelead build bundles
 * @param {boolean} parameters.jsdoc True if a JSDoc build should be executed
 * @param {Array} parameters.includedTasks Task list to be included from build
 * @param {Array} parameters.excludedTasks Task list to be excluded from build
 * @returns {Array} Return a task list for the builder
 */
module.exports = function composeTaskList(allTasks, {selfContained, jsdoc, includedTasks, excludedTasks}) {
	let selectedTasks = allTasks.reduce((list, key) => {
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
	selectedTasks.generateVersionInfo = false;

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
		selectedTasks.replaceBuildtime = false;
		selectedTasks.generateComponentPreload = false;
		selectedTasks.generateLibraryPreload = false;
		selectedTasks.generateLibraryManifest = false;
		selectedTasks.minify = false;
		selectedTasks.generateFlexChangesBundle = false;
		selectedTasks.generateManifestBundle = false;
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
};

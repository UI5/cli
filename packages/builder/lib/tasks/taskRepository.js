import {createRequire} from "node:module";

/**
 * Repository providing access to all UI5 Builder tasks and various metadata required by the build process.
 * This module is designed to be imported by @ui5/project or to be passed as a private parameter
 * to the <code>build</code> function of a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph}.
 *
 * For other use cases, it is recommended to import the required tasks directly.
 *
 * Therefore, all API of this module is private.
 *
 * @private
 * @module @ui5/builder/tasks/taskRepository
 */

const taskInfos = {
	replaceCopyright: {path: "./replaceCopyright.js"},
	replaceVersion: {path: "./replaceVersion.js"},
	replaceBuildtime: {path: "./replaceBuildtime.js"},
	enhanceManifest: {path: "./enhanceManifest.js"},
	escapeNonAsciiCharacters: {path: "./escapeNonAsciiCharacters.js"},
	executeJsdocSdkTransformation: {path: "./jsdoc/executeJsdocSdkTransformation.js"},
	generateApiIndex: {path: "./jsdoc/generateApiIndex.js"},
	generateJsdoc: {path: "./jsdoc/generateJsdoc.js"},
	minify: {path: "./minify.js"},
	buildThemes: {path: "./buildThemes.js"},
	transformBootstrapHtml: {path: "./transformBootstrapHtml.js"},
	generateLibraryManifest: {path: "./generateLibraryManifest.js"},
	generateVersionInfo: {path: "./generateVersionInfo.js"},
	generateFlexChangesBundle: {path: "./bundlers/generateFlexChangesBundle.js"},
	generateComponentPreload: {path: "./bundlers/generateComponentPreload.js"},
	generateResourcesJson: {path: "./generateResourcesJson.js"},
	generateThemeDesignerResources: {path: "./generateThemeDesignerResources.js"},
	generateStandaloneAppBundle: {path: "./bundlers/generateStandaloneAppBundle.js"},
	generateBundle: {path: "./bundlers/generateBundle.js"},
	generateLibraryPreload: {path: "./bundlers/generateLibraryPreload.js"},
	generateCachebusterInfo: {path: "./generateCachebusterInfo.js"}
};


/**
 * TaskInfo object returned by the getTask function
 *
 * @private
 * @typedef {object} @ui5/builder/tasks/taskRepository~TaskInfo
 * @property {Function} task Task function
 */

/**
 * Returns the module for a given task name
 *
 * @private
 * @static
 * @param {string} taskName Name of the task to retrieve
 * @throws {Error} In case the specified task does not exist
 * @returns {Promise<@ui5/builder/tasks/taskRepository~TaskInfo>} Object containing the task module
 */
export async function getTask(taskName) {
	const taskInfo = taskInfos[taskName];

	if (!taskInfo) {
		if (getRemovedTaskNames().includes(taskName)) {
			throw new Error(
				`Standard task ${taskName} has been removed in UI5 Tooling 3.0. ` +
				`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`);
		}
		throw new Error(`taskRepository: Unknown Task ${taskName}`);
	}
	try {
		const {default: task} = await import(taskInfo.path);
		return {
			task
		};
	} catch (err) {
		throw new Error(`taskRepository: Failed to require task module for ${taskName}: ${err.message}`);
	}
}

/**
 * Returns a list of the names of all available tasks
 *
 * @private
 * @static
 * @returns {string[]} Array containing the names of all available tasks
 */
export function getAllTaskNames() {
	return Object.keys(taskInfos);
}

/**
 * Returns a list of the names of all tasks that have been removed
 * in this or previous versions of ui5-builder.
 *
 * @private
 * @static
 * @returns {string[]} Array containing the names of all removed tasks
 */
export function getRemovedTaskNames() {
	return ["createDebugFiles", "uglify", "generateManifestBundle"];
}

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);
function getVersion(pkg) {
	return require(`${pkg}/package.json`).version;
}

/**
 * Object containing the versions of the ui5-builder module and relevant dependencies
 *
 * @private
 * @typedef {object} @ui5/builder/tasks/taskRepository~Versions
 * @property {string} builderVersion Version of the ui5-builder module
 * @property {string} fsVersion Version of the ui5-fs module in use
 */

/**
 * Provides version information on all relevant modules, used by ui5-builder
 *
 * @private
 * @static
 * @returns {@ui5/builder/tasks/taskRepository~Versions} Object containing version information
 */
export async function getVersions() {
	return {
		builderVersion: getVersion("@ui5/builder"),
		fsVersion: getVersion("@ui5/fs"),
	};
}

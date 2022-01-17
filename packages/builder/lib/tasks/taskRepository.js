const taskInfos = {
	replaceCopyright: {path: "./replaceCopyright"},
	replaceVersion: {path: "./replaceVersion"},
	replaceBuildtime: {path: "./replaceBuildtime"},
	escapeNonAsciiCharacters: {path: "./escapeNonAsciiCharacters"},
	executeJsdocSdkTransformation: {path: "./jsdoc/executeJsdocSdkTransformation"},
	generateApiIndex: {path: "./jsdoc/generateApiIndex"},
	generateJsdoc: {path: "./jsdoc/generateJsdoc"},
	minify: {path: "./minify"},
	buildThemes: {path: "./buildThemes"},
	transformBootstrapHtml: {path: "./transformBootstrapHtml"},
	generateLibraryManifest: {path: "./generateLibraryManifest"},
	generateVersionInfo: {path: "./generateVersionInfo"},
	generateManifestBundle: {path: "./bundlers/generateManifestBundle"},
	generateFlexChangesBundle: {path: "./bundlers/generateFlexChangesBundle"},
	generateComponentPreload: {path: "./bundlers/generateComponentPreload"},
	generateResourcesJson: {path: "./generateResourcesJson"},
	generateThemeDesignerResources: {path: "./generateThemeDesignerResources"},
	generateStandaloneAppBundle: {path: "./bundlers/generateStandaloneAppBundle"},
	generateBundle: {path: "./bundlers/generateBundle"},
	generateLibraryPreload: {path: "./bundlers/generateLibraryPreload"},
	generateCachebusterInfo: {path: "./generateCachebusterInfo"}
};

function getTask(taskName) {
	const taskInfo = taskInfos[taskName];

	if (!taskInfo) {
		if (["createDebugFiles", "uglify"].includes(taskName)) {
			throw new Error(
				`Standard task ${taskName} has been removed in UI5 Tooling 3.0. ` +
				`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`);
		}
		throw new Error(`taskRepository: Unknown Task ${taskName}`);
	}
	try {
		const task = require(taskInfo.path);
		return {
			task,
			specVersion: taskInfo.specVersion
		};
	} catch (err) {
		throw new Error(`taskRepository: Failed to require task module for ${taskName}: ${err.message}`);
	}
}

function addTask({name, specVersion, taskPath}) {
	if (taskInfos[name]) {
		throw new Error(`taskRepository: A task with the name ${name} has already been registered`);
	}
	taskInfos[name] = {
		path: taskPath,
		specVersion
	};
}

function getAllTaskNames() {
	return Object.keys(taskInfos);
}

module.exports = {
	getTask,
	addTask,
	getAllTaskNames
};

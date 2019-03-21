const tasks = {
	replaceCopyright: require("./replaceCopyright"),
	replaceVersion: require("./replaceVersion"),
	createDebugFiles: require("./createDebugFiles"),
	executeJsdocSdkTransformation: require("./jsdoc/executeJsdocSdkTransformation"),
	generateApiIndex: require("./jsdoc/generateApiIndex"),
	generateJsdoc: require("./jsdoc/generateJsdoc"),
	uglify: require("./uglify"),
	buildThemes: require("./buildThemes"),
	transformBootstrapHtml: require("./transformBootstrapHtml"),
	generateLibraryManifest: require("./generateLibraryManifest"),
	generateVersionInfo: require("./generateVersionInfo"),
	generateManifestBundle: require("./bundlers/generateManifestBundle"),
	generateFlexChangesBundle: require("./bundlers/generateFlexChangesBundle"),
	generateComponentPreload: require("./bundlers/generateComponentPreload"),
	generateStandaloneAppBundle: require("./bundlers/generateStandaloneAppBundle"),
	generateBundle: require("./bundlers/generateBundle"),
	generateLibraryPreload: require("./bundlers/generateLibraryPreload")
};

function getTask(taskName) {
	const task = tasks[taskName];

	if (!task) {
		throw new Error(`taskRepository: Unknown Task ${taskName}`);
	}
	return task;
}

function addTask(name, task) {
	if (tasks[name]) {
		throw new Error(`taskRepository: Task ${name} already registered`);
	}
	tasks[name] = task;
}

function getAllTasks() {
	return tasks;
}

module.exports = {
	getTask: getTask,
	addTask: addTask,
	getAllTasks: getAllTasks
};

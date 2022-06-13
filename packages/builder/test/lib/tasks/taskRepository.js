const test = require("ava");

const taskRepository = require("../../../lib/tasks/taskRepository");

test("Task retrieval", (t) => {
	const escapeNonAsciiCharacters = require("../../../lib/tasks/escapeNonAsciiCharacters");
	const taskInfo = taskRepository.getTask("escapeNonAsciiCharacters");
	t.deepEqual(taskInfo, {
		task: escapeNonAsciiCharacters
	}, "Expected task retrieved");
});

test("getAllTaskNames", (t) => {
	const taskNames = taskRepository.getAllTaskNames();
	t.deepEqual(taskNames, [
		"replaceCopyright",
		"replaceVersion",
		"replaceBuildtime",
		"escapeNonAsciiCharacters",
		"executeJsdocSdkTransformation",
		"generateApiIndex",
		"generateJsdoc",
		"minify",
		"buildThemes",
		"transformBootstrapHtml",
		"generateLibraryManifest",
		"generateVersionInfo",
		"generateManifestBundle",
		"generateFlexChangesBundle",
		"generateComponentPreload",
		"generateResourcesJson",
		"generateThemeDesignerResources",
		"generateStandaloneAppBundle",
		"generateBundle",
		"generateLibraryPreload",
		"generateCachebusterInfo",
	], "Returned list of all standard tasks");
});

test("Unknown task retrieval", (t) => {
	const error = t.throws(() => {
		taskRepository.getTask("not-existing");
	});
	t.deepEqual(error.message, "taskRepository: Unknown Task not-existing", "Correct exception");
});

test("Removed task retrieval", (t) => {
	const error = t.throws(() => {
		taskRepository.getTask("createDebugFiles");
	});
	t.deepEqual(error.message,
		`Standard task createDebugFiles has been removed in UI5 Tooling 3.0. ` +
		`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`,
		"Correct exception");

	const error2 = t.throws(() => {
		taskRepository.getTask("uglify");
	});
	t.deepEqual(error2.message,
		`Standard task uglify has been removed in UI5 Tooling 3.0. ` +
		`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`,
		"Correct exception");
});

import test from "ava";
import {getTask, getAllTaskNames} from "../../../lib/tasks/taskRepository.js";

test("Task retrieval", async (t) => {
	const escapeNonAsciiCharacters = (await import("../../../lib/tasks/escapeNonAsciiCharacters.js")).default;
	const taskInfoPromise = getTask("escapeNonAsciiCharacters");
	t.true(taskInfoPromise instanceof Promise);
	const taskInfo = await taskInfoPromise;
	t.deepEqual(taskInfo, {
		task: escapeNonAsciiCharacters
	}, "Expected task retrieved");
});

test("getAllTaskNames", (t) => {
	const taskNames = getAllTaskNames();
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

test("Unknown task retrieval", async (t) => {
	const error = await t.throwsAsync(getTask("not-existing"));
	t.is(error.message, "taskRepository: Unknown Task not-existing", "Correct exception");
});

test("Removed task retrieval", async (t) => {
	const error = await t.throwsAsync(getTask("createDebugFiles"));
	t.deepEqual(error.message,
		`Standard task createDebugFiles has been removed in UI5 Tooling 3.0. ` +
		`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`,
		"Correct exception");

	const error2 = await t.throwsAsync(getTask("uglify"));
	t.deepEqual(error2.message,
		`Standard task uglify has been removed in UI5 Tooling 3.0. ` +
		`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`,
		"Correct exception");

	const error3 = await t.throwsAsync(getTask("generateManifestBundle"));
	t.deepEqual(error3.message,
		`Standard task generateManifestBundle has been removed in UI5 Tooling 3.0. ` +
		`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`,
		"Correct exception");
});

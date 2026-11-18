import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

const FixtureTester = createFixtureTesterFactory("versionInfo");
registerBuildHooks(test);

/**
 * Reads the generateVersionInfo task status for a project from the recorded
 * `ui5.project-build-status` events of the most recent build. The stub history is reset at the
 * start of every `buildProject`, so this reflects only the latest build.
 *
 * @param {import("ava").ExecutionContext} t AVA execution context
 * @param {string} projectName Project to inspect
 * @returns {{executed: boolean, skipped: boolean}} Whether generateVersionInfo ran or was skipped
 */
function versionInfoTaskStatus(t, projectName) {
	const events = t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
	const match = (status) => events.some((e) =>
		e.projectName === projectName && e.taskName === "generateVersionInfo" && e.status === status);
	return {executed: match("task-start"), skipped: match("task-skip")};
}

test.serial("Build with dependencies: Verify sap-ui-version.json generation and regeneration", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	const versionInfoPath = `${destPath}/resources/sap-ui-version.json`;

	// Build #1: Full build with all dependencies in JSDoc mode
	// JSDoc mode enables generateVersionInfo task which creates sap-ui-version.json
	await fixtureTester.buildProject({
		config: {
			destPath,
			cleanDest: true,
			jsdoc: true,
			dependencyIncludes: {includeAllDependencies: true}
		},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {}
			}
		}
	});

	const versionInfo1Content = await fs.readFile(versionInfoPath, {encoding: "utf8"});
	t.truthy(versionInfo1Content, "sap-ui-version.json should exist");
	const versionInfo1 = JSON.parse(versionInfo1Content);

	// Root project metadata
	t.is(versionInfo1.name, "application.a", "Root project name");
	t.is(versionInfo1.version, "1.0.0", "Root project version");
	t.is(typeof versionInfo1.buildTimestamp, "string", "buildTimestamp is string");

	// Libraries array
	t.true(Array.isArray(versionInfo1.libraries), "libraries is array");
	const libraryNames = versionInfo1.libraries.map((lib) => lib.name).sort();
	t.deepEqual(libraryNames, ["library.a", "library.b", "library.c", "library.d"],
		"Contains all dependency libraries");

	// Each library has required fields
	versionInfo1.libraries.forEach((lib) => {
		t.is(typeof lib.name, "string", `Library ${lib.name} has name`);
		t.is(typeof lib.version, "string", `Library ${lib.name} has version`);
		t.is(typeof lib.buildTimestamp, "string", `Library ${lib.name} has buildTimestamp`);
	});

	const firstBuildTimestamp = versionInfo1.buildTimestamp;

	// Build #2: No changes, expect full cache hit
	await fixtureTester.buildProject({
		config: {
			destPath,
			cleanDest: true,
			jsdoc: true,
			dependencyIncludes: {includeAllDependencies: true}
		},
		assertions: {
			projects: {} // All projects cached
		}
	});

	// Verify sap-ui-version.json was reused from cache (timestamp unchanged)
	const versionInfo2Content = await fs.readFile(versionInfoPath, {encoding: "utf8"});
	const versionInfo2 = JSON.parse(versionInfo2Content);
	t.is(versionInfo2.buildTimestamp, firstBuildTimestamp,
		"buildTimestamp unchanged when cached (no source changes)");
});

test.serial("Build application.a with --exclude-task=generateVersionInfo", async (t) => {
	// This test verifies that when task generateVersionInfo is excluded,
	// the sap-ui-version.json file is NOT generated in the output
	// AND the dependencies are not automatically built.

	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 Build with empty cache and exclude generateVersionInfo task
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, excludedTasks: ["generateVersionInfo"]},
		assertions: {
			projects: {
				// Only application.a is built, dependencies are skipped
				"application.a": {}
			}
		}
	});

	// Verify that sap-ui-version.json does NOT exist in the output
	const versionInfoPath = `${destPath}/resources/sap-ui-version.json`;
	await t.throwsAsync(fs.readFile(versionInfoPath, {encoding: "utf8"}), undefined,
		"sap-ui-version.json should NOT exist when generateVersionInfo task is excluded");


	// #2 Build with empty cache and include all default tasks now
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {
				// All dependencies are built now
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {}
			}
		}
	});

	// Verify that sap-ui-version.json DOES exist in the output now
	await t.notThrowsAsync(fs.readFile(versionInfoPath, {encoding: "utf8"}), undefined,
		"sap-ui-version.json should exist when generateVersionInfo task is included");
});

test.serial("Resolved framework change invalidates the generateVersionInfo stage cache", async (t) => {
	// Regression guard for versionInfo consuming ProjectGraph#getResolvedFrameworkInfo() at task
	// execution time (recorded as the `resolvedFrameworkInfo` non-resource cache input). For an app
	// with no framework config, the effective framework is derived from the reachable framework
	// projects: a reachable @openui5/sap.ui.core yields {name: "OpenUI5", version: <core version>}.
	// Bumping sap.ui.core's version therefore changes the resolved framework, which must miss the
	// generateVersionInfo stage cache and re-emit an updated framework object.
	//
	// Note: this is an end-to-end guard, not a pure input-channel isolation — for OpenUI5 the
	// resolved version IS sap.ui.core's version, which the task also lists under `libraries`. The
	// decisive property it pins is that the framework is resolved from the graph at task time: a
	// regression to the old raw-ui5.yaml-config resolution would report {name: "", version: ""} here
	// (the app configures no framework) and fail build #1.
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	const versionInfoPath = `${destPath}/resources/sap-ui-version.json`;
	const buildConfig = {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}};

	await fixtureTester._initialize();
	await fixtureTester.addSapUiCoreDependency("1.120.0");

	// Build #1: resolves OpenUI5 / 1.120.0 from the reachable sap.ui.core
	await fixtureTester.buildProject({config: buildConfig});
	t.true(versionInfoTaskStatus(t, "application.a").executed,
		"generateVersionInfo runs on the first build");
	const versionInfo1 = JSON.parse(await fs.readFile(versionInfoPath, {encoding: "utf8"}));
	t.deepEqual(versionInfo1.framework, {name: "OpenUI5", version: "1.120.0"},
		"framework resolved from the reachable sap.ui.core");

	// Build #2: no change → the whole project result is restored from cache (no task events), and the
	// previously written sap-ui-version.json is reused verbatim (buildTimestamp unchanged).
	await fixtureTester.buildProject({config: buildConfig});
	t.false(versionInfoTaskStatus(t, "application.a").executed,
		"generateVersionInfo does not re-execute when nothing changed");
	const versionInfo2 = JSON.parse(await fs.readFile(versionInfoPath, {encoding: "utf8"}));
	t.is(versionInfo2.buildTimestamp, versionInfo1.buildTimestamp,
		"sap-ui-version.json reused from cache (buildTimestamp unchanged)");
	t.deepEqual(versionInfo2.framework, {name: "OpenUI5", version: "1.120.0"}, "framework unchanged on cache hit");

	// Build #3: bump the resolved framework version → cache miss, task re-executes, output updated
	await fixtureTester.setSapUiCoreDependencyVersion("2.0.0");
	await fixtureTester.buildProject({config: buildConfig});
	t.true(versionInfoTaskStatus(t, "application.a").executed,
		"generateVersionInfo re-executes when the resolved framework changes");
	const versionInfo3 = JSON.parse(await fs.readFile(versionInfoPath, {encoding: "utf8"}));
	t.deepEqual(versionInfo3.framework, {name: "OpenUI5", version: "2.0.0"},
		"framework reflects the new resolved version");
});

import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

const FixtureTester = createFixtureTesterFactory("versionInfo");
registerBuildHooks(test);

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

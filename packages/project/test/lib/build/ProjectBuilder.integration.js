import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";
import {setLogLevel} from "@ui5/logger";

// Ensures that all logging code paths are tested
setLogLevel("silly");

test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.logEventStub = sinon.stub();
	t.context.buildMetadataEventStub = sinon.stub();
	t.context.projectBuildMetadataEventStub = sinon.stub();
	t.context.buildStatusEventStub = sinon.stub();
	t.context.projectBuildStatusEventStub = sinon.stub();

	process.on("ui5.log", t.context.logEventStub);
	process.on("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.on("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.on("ui5.build-status", t.context.buildStatusEventStub);
	process.on("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	delete process.env.UI5_DATA_DIR;

	process.off("ui5.log", t.context.logEventStub);
	process.off("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.off("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.off("ui5.build-status", t.context.buildStatusEventStub);
	process.off("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

test.serial("Build application.a project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						// Note: replaceCopyright is skipped because no copyright is configured in the project
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");


	// #4 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
			}
		}
	});


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// #6 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// #6 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// #7 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// #8 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Change a source file with existing source map in application.a
	const fileWithSourceMapPath =
		`${fixtureTester.fixturePath}/webapp/thirdparty/scriptWithSourceMap.js`;
	const fileWithSourceMapContent = await fs.readFile(fileWithSourceMapPath, {encoding: "utf8"});
	await fs.writeFile(
		fileWithSourceMapPath,
		fileWithSourceMapContent.replace(
			`This is a script with a source map.`,
			`This is a CHANGED script with a source map.`
		)
	);
	const sourceMapPath = `${fixtureTester.fixturePath}/webapp/thirdparty/scriptWithSourceMap.js.map`;
	const sourceMapContent = await fs.readFile(sourceMapPath, {encoding: "utf8"});
	await fs.writeFile(
		sourceMapPath,
		sourceMapContent.replace(
			`This is a script with a source map.`,
			`This is a CHANGED script with a source map.`
		)
	);

	// #9 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright"
					]
				}
			}
		}
	});


	// Add a new file to application.a
	await fs.writeFile(`${fixtureTester.fixturePath}/webapp/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #10 build (with cache, with changes - someNew.js added)
	// Tasks that don't depend on someNew.js can reuse their caches from build #9.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"application.a": {
				skippedTasks: [
					"enhanceManifest",
					"escapeNonAsciiCharacters",
					"generateFlexChangesBundle",
					"replaceCopyright",
				]
			}}
		}
	});

	await fs.rm(`${fixtureTester.fixturePath}/webapp/someNew.js`);

	// #11 build (with cache, with changes - someNew.js removed)
	// Source state matches build #9's cached result -> cache reused, everything skipped
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});
});

test.serial("Build application.a (custom task and tag handling)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// Create new file which should get tagged as "OmitFromBuildResult" by a custom task
	await fs.writeFile(`${fixtureTester.fixturePath}/webapp/fileToBeOmitted.js`,
		`console.log("this file should be omitted in the build result")`);

	// #2 build (with cache, with changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						// Note: replaceCopyright is skipped because no copyright is configured in the project
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Check that fileToBeOmitted.js is not in dist
	await t.throwsAsync(fs.readFile(`${destPath}/fileToBeOmitted.js`, {encoding: "utf8"}));


	// #3 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});

	// Check that fileToBeOmitted.js is not in dist again
	await t.throwsAsync(fs.readFile(`${destPath}/fileToBeOmitted.js`, {encoding: "utf8"}));


	// Delete the file again
	await fs.rm(`${fixtureTester.fixturePath}/webapp/fileToBeOmitted.js`);

	// #4 build (with cache, with changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {} // everything should be skipped (already done in very first build)
		}
	});
});

test.serial("Build application.a (multiple custom tasks)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// This test should cover a scenario with multiple custom tasks.
	// Specifically, a tag is set in custom-task-1 on a resource which is read in custom-task-0 and custom-task-2.
	// The expected behavior is that the tag is not present in custom-task-0 (which runs before custom-task-1),
	// but is present in custom-task-2 (which runs after custom-task-1).
	// (for testing purposes, the custom tasks already check for this tag by themselves and handle errors accordingly)

	// #1 build (no cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// #2 build (with cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Create a new file to allow a new build:
	// Logic of custom-task-1 will NOT handle this file, while custom-task-0 and 2 WILL DO it,
	// resulting in custom-task-1 getting skipped (cache reuse).
	// The test should then verify that the tag is still only readable for custom-task-2.
	// This ensures that the build result is exactly the same with or without using the cache.
	// (as in #1 build, the custom tasks already check for this tag by themselves and handle errors accordingly)
	await fs.cp(`${fixtureTester.fixturePath}/webapp/test.js`,
		`${fixtureTester.fixturePath}/webapp/test2.js`);

	// #3 build (with cache, with changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"custom-task-1", // SHOULD BE SKIPPED
						// remaining skipped tasks don't matter here:
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright",
					]
				}
			}
		}
	});
});

test.serial.skip("Build application.a (multiple custom tasks 2)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// This test should cover a scenario with multiple custom tasks.
	// Specifically, it's invalidating the task cache by only modifying tags on resources,
	// but not the resources themselves.

	// #1 build (no cache, no changes, with custom tasks)
	// During this build, "custom-task-0" sets the tag "isDebugVariant" to test.js.
	// "custom-task-1" checks if it's able to read this tag.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks-2.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// #2 build (with cache, no changes, with custom tasks)
	// During this build, "custom-task-0" sets a different tag to test.js (namely "OmitFromBuildResult").
	// "custom-task-1" again checks if it's able to read this different tag.
	// It's expected that both custom tasks are not getting skipped during this build,
	// even though any resources weren't modified.
	// FIXME: Currently, the entire build is skipped and therefore the custom tasks are not executed.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks-2.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {} // TODO: add non-relevant skippedTasks here, once the tag handling works
			}
		}
	});

	// Check that test.js is omitted from build output:
	await t.throwsAsync(fs.readFile(`${destPath}/test.js`, {encoding: "utf8"}));
});

test.serial.skip("Build application.a (dependency content changes)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// This test should cover a scenario with an application depending on a library.
	// Specifically, we're directly modifying the contents of the library
	// which should have effects on the application because a custom task will detect it
	// and modify the application's resources. The application is expected to get rebuilt.

	// #1 build (no cache, no changes, no dependencies)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-dependency-change.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});


	// #2 build (with cache, no changes, no dependencies)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-dependency-change.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change content of library.d (this will not affect application.a):
	const someJsOfLibrary = `${fixtureTester.fixturePath}/node_modules/library.d/main/src/library/d/some.js`;
	await fs.appendFile(someJsOfLibrary, `\ntest("line added");\n`);

	// #3 build (with cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-dependency-change.yaml"},
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
			}
		}
	});

	// Check if library contains correct changed content:
	const builtFileContent = await fs.readFile(`${destPath}/resources/library/d/some.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");


	// Change content of library.d again (this time it affects application.a):
	await fs.writeFile(`${fixtureTester.fixturePath}/node_modules/library.d/main/src/library/d/newLibraryFile.js`,
		`console.log("SOME NEW CONTENT");`);

	// #4 build (no cache, with changes, with dependencies)
	// This build should execute the custom task "task.dependency-change.js" again which now detects "newLibraryFile.js"
	// and modifies a resource of application.a (namely "test.js").
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-dependency-change.yaml"},
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"application.a": { // FIXME: currently failing (getting skipped entirely)
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright",
					]
				},
			}
		}
	});

	// Check that application.a contains correct changed content (test.js):
	const builtFileContent2 = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(builtFileContent2.includes(`console.log('something new');`), "Build dest contains changed file content");
});

test.serial("Build application.a (JSDoc build)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// This test should cover a scenario with an application depending on a library.
	// We're executing a JSDoc build including dependencies (as with "ui5 build jsdoc --all")
	// and testing if the output contains the expected JSDoc contents.
	// Then, we're adding some additional JSDoc annotations to the library
	// and testing the same again.

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, jsdoc: "jsdoc", dependencyIncludes: {includeAllDependencies: true}},
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

	// Check that JSDoc build ran successfully:
	await t.throwsAsync(fs.readFile(`${destPath}/resources/library/d/some-dbg.js`, {encoding: "utf8"}));
	await t.throwsAsync(fs.readFile(`${destPath}/resources/library/d/some.js.map`, {encoding: "utf8"}));
	const builtFileContent = await fs.readFile(`${destPath}/resources/library/d/some.js`, {encoding: "utf8"});
	// Check that output contains correct file content:
	t.false(builtFileContent.includes(`//# sourceMappingURL=some.js.map`),
		"Build dest does not contain source map reference");


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, jsdoc: "jsdoc", dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Add additional JSDoc annotations to library.d:
	const jsdocContent = `/*!
* ` + "${copyright}" + `
*/

/**
* Example JSDoc annotation
*
* @public
* @static
* @param {object} param
* @returns {string} output
*/
function functionWithJSDoc(param) {return "test"}`;

	await fs.writeFile(`${fixtureTester.fixturePath}/node_modules/library.d/main/src/library/d/some.js`,
		jsdocContent);

	// #3 build (no cache, with changes)
	// application.a should get skipped:
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, jsdoc: "jsdoc", dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {
					skippedTasks: [
						"buildThemes",
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"executeJsdocSdkTransformation",
					]
				}
			}
		}
	});

	// Check that JSDoc build ran successfully:
	await t.throwsAsync(fs.readFile(`${destPath}/resources/library/d/some-dbg.js`, {encoding: "utf8"}));
	await t.throwsAsync(fs.readFile(`${destPath}/resources/library/d/some.js.map`, {encoding: "utf8"}));
	const builtFileContent2 = await fs.readFile(`${destPath}/resources/library/d/some.js`, {encoding: "utf8"});
	t.true(builtFileContent2.includes(`Example JSDoc annotation`), "Build dest contains new JSDoc content");
	// Check that output contains new file content:
	t.false(builtFileContent2.includes(`//# sourceMappingURL=some.js.map`),
		"Build dest does not contain source map reference");


	// #4 build (no cache, no changes)
	// Normal build again (non-JSDoc build); should not execute task "generateJsdoc":
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
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

	// Check that normal build ran successfully:
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/d/some-dbg.js`, {encoding: "utf8"}));
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/d/some.js.map`, {encoding: "utf8"}));
	const builtFileContent3 = await fs.readFile(`${destPath}/resources/library/d/some.js`, {encoding: "utf8"});
	t.false(builtFileContent3.includes(`Example JSDoc annotation`), "Build dest doesn't contain JSDoc content anymore");
	// Check that output contains content generated by the normal build:
	t.true(builtFileContent3.includes(`//# sourceMappingURL=some.js.map`),
		"Build dest does contain source map reference");
});

test.serial("Build application.a (Custom Component preload configuration)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// In this test, we're testing the behavior of a custom preload configuration
	// which is defined in "ui5-custom-preload-config.yaml".
	// This custom preload configuration generates a Component-preload.js similar to a default one.
	// However, it will omit a resource ("scriptWithSourceMap.js") from the bundle.

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-preload-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Check that generated preload bundle doesn't contain the omitted file:
	t.false((await fs.readFile(`${destPath}/Component-preload.js`, {encoding: "utf8"}))
		.includes("id1/thirdparty/scriptWithSourceMap.js"));


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-preload-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});
});

test.serial("Build application.a (self-contained build)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// We're executing a self-contained build including dependencies (as with "ui5 build self-contained --all")
	// and testing if the output contains the expected self-contained bundle.
	// Then, we're changing the content only of application.a
	// and testing if the self-contained build output changes accordingly.

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, selfContained: "self-contained",
			dependencyIncludes: {includeAllDependencies: true}},
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

	// Check that output contains the correct content:
	const builtFileContent = await fs.readFile(`${destPath}/resources/sap-ui-custom.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`"id1/test.js":'function test(t){var o=t;console.log(o)}test();\\n'`));


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, selfContained: "self-contained",
			dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Remove the file "test.js" from application.a:
	await fs.rm(`${fixtureTester.fixturePath}/webapp/test.js`);

	// #3 build (with cache, with changes)
	// Dependencies should get skipped, application.a should get rebuilt:
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, selfContained: "self-contained",
			dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright",
						"transformBootstrapHtml",
					]
				}
			}
		}
	});

	// Check that output contains the correct content (test.js should be missing):
	const builtFileContent2 = await fs.readFile(`${destPath}/resources/sap-ui-custom.js`, {encoding: "utf8"});
	t.false(builtFileContent2.includes(`"id1/test.js":`));


	// #4 build (with cache, no changes)
	// Run a self-contained build but with a different config which defines a custom preload.
	// The build should run and the output should still contain the expected self-contained bundle
	// (tasks "generateComponentPreload" and "generateLibraryPreload" should not get executed):
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-preload-config.yaml"},
		config: {destPath, cleanDest: true, selfContained: "self-contained",
			dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Check that output contains still the correct content:
	const builtFileContent3 = await fs.readFile(`${destPath}/resources/sap-ui-custom.js`, {encoding: "utf8"});
	t.false(builtFileContent3.includes(`"id1/test.js":`));


	// #5 build (with cache, no changes)
	// Run a self-contained build but without dependencies:
	// (everything should get skipped)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5.yaml"},
		config: {destPath, cleanDest: true, selfContained: "self-contained"},
		assertions: {
			projects: {}
		}
	});
});

test.serial("Build application.a (Custom bundling)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// In this test, we're testing the behavior of a custom bundling configuration
	// which is defined in "ui5-custom-bundling.yaml".
	// This config generates a custom bundle in various modes.
	// The bundle includes resources by a filter ("Component.js" & "newFile.js") which are added at #3 and #4 build.

	// #1 build with custom bundle configuration (with empty cache)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-bundling.yaml"},
		config: {destPath, cleanDest: false},
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

	// Verify that the custom bundle was created and contains the expected content:
	const customBundlePath = `${destPath}/resources/custom-bundle.js`;
	const customBundleContent = await fs.readFile(customBundlePath, {encoding: "utf8"});
	t.false(customBundleContent.includes("sap.ui.predefine("),
		"preload Mode: Custom bundle should not contain sap.ui.predefine() at this stage"
	);
	t.false(customBundleContent.includes("sap.ui.require.preload("),
		"preload Mode: Custom bundle should not contain sap.ui.require.preload() at this stage"
	);
	// Verify that source map was created:
	const sourceMapPath = `${destPath}/resources/custom-bundle.js.map`;
	const sourceMapContent = JSON.parse(await fs.readFile(sourceMapPath, {encoding: "utf8"}));
	t.true(sourceMapContent.sections.length === 0, "Source map file should not have content at this stage");


	// #2 build with custom bundle (with cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-bundling.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Add a source file which is matched by the filter (UI5 Module):
	const newComponentFilepath = `${fixtureTester.fixturePath}/webapp/Component.js`;
	await fs.appendFile(newComponentFilepath,
		`sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/core/ComponentSupport"], (UIComponent) => {
	"use strict";
	return UIComponent.extend("id1.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"],
		}
	});
});`);

	// #3 build with custom bundle (with cache, with changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-bundling.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright",
					]
				}
			}
		}
	});

	// Verify that the updated custom bundle contains the change:
	// (the bundle should now contain sap.ui.predefine() due to the added UI5 module "Component.js")
	const customBundleContent2 = await fs.readFile(customBundlePath, {encoding: "utf8"});
	t.true(customBundleContent2.includes("sap.ui.predefine("),
		"preload Mode: Custom bundle should contain sap.ui.predefine() now"
	);
	t.false(customBundleContent2.includes("sap.ui.require.preload("),
		"preload Mode: Custom bundle should not contain sap.ui.require.preload() at this stage"
	);
	// Verify that source map was created and contains the change:
	const sourceMapContent2 = JSON.parse(await fs.readFile(sourceMapPath, {encoding: "utf8"}));
	t.true(sourceMapContent2.sections.length > 0, "Source map file should have content now");


	// Add another source file which is matched by the filter (non-UI5 module):
	const newTestFilepath = `${fixtureTester.fixturePath}/webapp/newFile.js`;
	await fs.appendFile(newTestFilepath, `console.log("another source file");`);

	// #4 build with custom bundle (with cache, with changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-bundling.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright",
					]
				}
			}
		}
	});

	// Verify that the custom bundle was created and contains the expected content:
	// (the bundle should now contain sap.ui.require.preload() due to the added non-UI5 module "newFile.js")
	const customBundleContent3 = await fs.readFile(customBundlePath, {encoding: "utf8"});
	t.true(customBundleContent3.includes("sap.ui.predefine("),
		"preload Mode: Custom bundle should contain sap.ui.predefine() still"
	);
	t.true(customBundleContent3.includes("sap.ui.require.preload("),
		"preload Mode: Custom bundle should contain sap.ui.require.preload() now"
	);
	// Verify that source map was created and contains the change:
	const sourceMapContent3 = JSON.parse(await fs.readFile(sourceMapPath, {encoding: "utf8"}));
	t.true(sourceMapContent3.sections.length > 0, "Source map file should have content still");


	// ----------------------------------------------------------------------------------
	// ---------------------------- Test other bundle modes: ----------------------------
	// ----------------------------------------------------------------------------------
	// Switch to "raw" mode:
	const ui5YamlContent = await fs.readFile(`${fixtureTester.fixturePath}/ui5-custom-bundling.yaml`);
	await fs.writeFile(`${fixtureTester.fixturePath}/ui5-custom-bundling.yaml`,
		ui5YamlContent.toString().replace(`- mode: preload`, `- mode: raw`));

	// #5 build with custom bundle configuration (with empty cache)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-bundling.yaml"},
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Verify that the custom bundle was created and contains the expected content:
	// (the bundle should contain sap.ui.define() now)
	const customBundleContent4 = await fs.readFile(customBundlePath, {encoding: "utf8"});
	t.false(customBundleContent4.includes("sap.ui.require.preload("),
		"raw Mode: Custom bundle should not contain sap.ui.require.preload() anymore"
	);
	t.false(customBundleContent4.includes("sap.ui.predefine("),
		"raw Mode: Custom bundle should not contain sap.ui.predefine() anymore"
	);
	t.true(customBundleContent4.includes("sap.ui.define("),
		"raw Mode: Custom bundle should contain sap.ui.define() now"
	);
	t.true(customBundleContent4.includes(`console.log("another source file");`));
	t.true(customBundleContent4.includes(`id1.Component`));
	// Verify that source map was created and contains the change:
	const sourceMapContent4 = JSON.parse(await fs.readFile(sourceMapPath, {encoding: "utf8"}));
	t.true(sourceMapContent4.sections.length > 0, "Source map file should have content still");


	// Switch to "require" mode:
	const ui5YamlContent2 = await fs.readFile(`${fixtureTester.fixturePath}/ui5-custom-bundling.yaml`);
	await fs.writeFile(`${fixtureTester.fixturePath}/ui5-custom-bundling.yaml`,
		ui5YamlContent2.toString().replace(`- mode: raw`, `- mode: require`));

	// #6 build with custom bundle configuration (with empty cache)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-bundling.yaml"},
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Verify that the custom bundle was created and contains the expected content:
	// (the bundle should contain sap.ui.require() now)
	const customBundleContent5 = await fs.readFile(customBundlePath, {encoding: "utf8"});
	t.false(customBundleContent5.includes("sap.ui.require.preload("),
		"require Mode: Custom bundle should not contain sap.ui.require.preload() anymore"
	);
	t.false(customBundleContent5.includes("sap.ui.predefine("),
		"require Mode: Custom bundle should not contain sap.ui.predefine() anymore"
	);
	t.false(customBundleContent5.includes("sap.ui.define("),
		"require Mode: Custom bundle should not contain sap.ui.define() anymore"
	);
	t.true(customBundleContent5.includes("sap.ui.require("),
		"require Mode: Custom bundle should contain sap.ui.require() now"
	);
	t.true(customBundleContent5.includes(`id1/newFile`));
	t.false(customBundleContent5.includes(`console.log("another source file");`));
	t.true(customBundleContent5.includes(`id1/Component`));
	// Verify that source map was created and contains the change:
	const sourceMapContent5 = JSON.parse(await fs.readFile(sourceMapPath, {encoding: "utf8"}));
	t.true(sourceMapContent5.sections.length > 0, "Source map file should have content still");


	// Switch to "bundleInfo" mode:
	const ui5YamlContent3 = await fs.readFile(`${fixtureTester.fixturePath}/ui5-custom-bundling.yaml`);
	await fs.writeFile(`${fixtureTester.fixturePath}/ui5-custom-bundling.yaml`,
		ui5YamlContent3.toString().replace(`- mode: require`, `- mode: bundleInfo`));

	// #7 build with custom bundle configuration (with empty cache)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-bundling.yaml"},
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Verify that the custom bundle was created and contains the expected content:
	// (the bundle should contain sap.ui.loader.config() now)
	const customBundleContent6 = await fs.readFile(customBundlePath, {encoding: "utf8"});
	t.false(customBundleContent6.includes("sap.ui.require.preload("),
		"bundleInfo Mode: Custom bundle should not contain sap.ui.require.preload() anymore"
	);
	t.false(customBundleContent6.includes("sap.ui.predefine("),
		"bundleInfo Mode: Custom bundle should not contain sap.ui.predefine() anymore"
	);
	t.false(customBundleContent6.includes("sap.ui.define("),
		"bundleInfo Mode: Custom bundle should not contain sap.ui.define() anymore"
	);
	t.false(customBundleContent6.includes("sap.ui.require("),
		"bundleInfo Mode: Custom bundle should not contain sap.ui.require() anymore"
	);
	t.true(customBundleContent6.includes("sap.ui.loader.config({bundlesUI5:{"),
		"bundleInfo Mode: Custom bundle should contain sap.ui.loader.config() now"
	);
	t.true(customBundleContent6.includes(`id1/newFile`));
	t.false(customBundleContent6.includes(`console.log("another source file");`));
	t.true(customBundleContent6.includes(`id1/Component`));
	// Verify that source map was created and contains the change:
	const sourceMapContent6 = JSON.parse(await fs.readFile(sourceMapPath, {encoding: "utf8"}));
	t.true(sourceMapContent6.sections.length > 0, "Source map file should have content still");
});

test.serial("Build library.d project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "library.d");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {"library.d": {}}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in library.d
	const changedFilePath = `${fixtureTester.fixturePath}/main/src/library/d/.library`;
	await fs.writeFile(
		changedFilePath,
		(await fs.readFile(changedFilePath, {encoding: "utf8"})).replace(
			`<documentation>Library D</documentation>`,
			`<documentation>Library D (updated #1)</documentation>`
		)
	);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"library.d": {
				skippedTasks: [
					"buildThemes",
					"escapeNonAsciiCharacters",
					"minify",
					"replaceBuildtime",
				]
			}}
		}
	});

	// Check whether the changes are in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/resources/library/d/.library`, {encoding: "utf8"});
	t.true(
		builtFileContent.includes(`<documentation>Library D (updated #1)</documentation>`),
		"Build dest contains changed file content"
	);

	// Check whether the manifest.json was updated with the new documentation
	const manifestContent = await fs.readFile(`${destPath}/resources/library/d/manifest.json`, {encoding: "utf8"});
	t.true(
		manifestContent.includes(`"Library D (updated #1)"`),
		"Build dest contains updated description in manifest.json"
	);


	// #4 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Update copyright in ui5.yaml (should trigger a full rebuild of the project)
	const ui5YamlPath = `${fixtureTester.fixturePath}/ui5.yaml`;
	await fs.writeFile(
		ui5YamlPath,
		(await fs.readFile(ui5YamlPath, {encoding: "utf8"})).replace(
			"copyright: Some fancy copyright",
			"copyright: Some updated fancy copyright"
		)
	);

	await fs.writeFile(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #5 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"library.d": {}}
		}
	});

	await fs.rm(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`);

	// #6 build (with cache, with changes - someNew.js removed)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"library.d": {
				skippedTasks: [
					"buildThemes",
					"enhanceManifest",
					"escapeNonAsciiCharacters",
					"replaceBuildtime",
				]
			}},
		}
	});

	// Re-add someNew.js (restores source state to match build #5)
	await fs.writeFile(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #7 build (with cache, with changes - someNew.js re-added)
	// Source state now matches build #5's cached result -> cache reused
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});

	// Remove someNew.js again
	await fs.rm(`${fixtureTester.fixturePath}/main/src/library/d/someNew.js`);

	// #8 build (with cache, with changes - someNew.js removed again)
	// Source state matches build #6's cached result -> cache reused, everything skipped
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});
});

test.serial("Build library.d (Custom Library preload configuration)", async (t) => {
	const fixtureTester = new FixtureTester(t, "library.d");
	const destPath = fixtureTester.destPath;

	// In this test, we're testing the behavior of a custom preload configuration
	// which is defined in "ui5-custom-preload-config.yaml".
	// This custom preload configuration generates a library-preload.js similar to a default one.
	// However, it will omit a resource ("some.js") from the bundle.

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-preload-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"library.d": {}
			}
		}
	});

	// Check that generated preload bundle doesn't contain the omitted file:
	t.false((await fs.readFile(`${destPath}/resources/library/d/library-preload.js`, {encoding: "utf8"}))
		.includes("library/d/some.js"));


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-preload-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});
});

test.serial("Build theme.library.e project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "theme.library.e");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false},
		assertions: {
			projects: {"theme.library.e": {}}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in theme.library.e
	const librarySourceFilePath =
		`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/library.source.less`;
	await fs.appendFile(librarySourceFilePath, `\n.someNewClass {\n\tcolor: red;\n}\n`);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {}}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.source.less`, {encoding: "utf8"}
	);
	t.true(
		builtFileContent.includes(`.someNewClass`),
		"Build dest contains changed file content"
	);

	// Check whether the build output contains the new CSS rule
	const builtCssContent = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
	);
	t.true(
		builtCssContent.includes(`.someNewClass`),
		"Build dest contains new rule in library.css"
	);


	// Add a new less file and import it in library.source.less
	await fs.writeFile(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`,
		`.someOtherNewClass {\n\tcolor: blue;\n}\n`
	);
	await fs.appendFile(librarySourceFilePath, `\n@import "newImportFile.less";\n`);

	// #4 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {}},
		}
	});

	// Check whether the build output contains the import to the new file
	const builtCssContent2 = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
	);
	t.true(
		builtCssContent2.includes(`.someOtherNewClass`),
		"Build dest contains new rule in library.css"
	);


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});


	// Change content of new less file
	await fs.writeFile(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`,
		`.someOtherNewClass {\n\tcolor: green;\n}\n`
	);

	// #6 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {}},
		}
	});

	// Check whether the build output contains the changed content of the imported file
	const builtCssContent3 = await fs.readFile(
		`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
	);
	t.true(
		builtCssContent3.includes(`.someOtherNewClass{color:green}`),
		"Build dest contains new rule in library.css"
	);


	// Delete import of library.source.less
	const librarySourceFileContent = (await fs.readFile(librarySourceFilePath)).toString();
	await fs.writeFile(librarySourceFilePath,
		librarySourceFileContent.replace(`\n@import "newImportFile.less";\n`, "")
	);

	// Change content of new less file again
	await fs.writeFile(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`,
		`.someOtherNewClass {\n\tcolor: yellow;\n}\n`
	);

	// #7 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"theme.library.e": {
				skippedTasks: ["buildThemes"]
			}},
		}
	});

	// Check if library.css does NOT contain the imported rule anymore
	t.false(
		(await fs.readFile(
			`${destPath}/resources/theme/library/e/themes/my_theme/library.css`, {encoding: "utf8"}
		)).includes(`.someOtherNewClass`),
		"Build dest should NOT contain the rule in library.css anymore"
	);


	// Delete the imported less file
	await fs.rm(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/newImportFile.less`);

	// #8 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}, // -> everything should be skipped
		}
	});
});

test.serial("Build component.a project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "component.a");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"component.a": {}
			}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in component.a
	const changedFilePath = `${fixtureTester.fixturePath}/src/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"component.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						// Note: replaceCopyright is skipped because no copyright is configured in the project
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/resources/id1/test.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");


	// #4 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
			}
		}
	});


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// #6 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Add a new file to component.a
	await fs.writeFile(`${fixtureTester.fixturePath}/src/someNew.js`,
		`console.log("SOME NEW CONTENT");\n`
	);

	// #7 build (with cache, with changes - someNew.js added)
	// Tasks that don't depend on someNew.js can reuse their caches from build #3.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"component.a": {
				skippedTasks: [
					"enhanceManifest",
					"escapeNonAsciiCharacters",
					"generateFlexChangesBundle",
					"replaceCopyright",
				]
			}}
		}
	});

	await fs.rm(`${fixtureTester.fixturePath}/src/someNew.js`);

	// #8 build (with cache, with changes - someNew.js removed)
	// Source state matches build #6's cached result -> cache reused, everything skipped
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {},
		}
	});
});

test.serial("Build component.a (Custom Component preload configuration)", async (t) => {
	const fixtureTester = new FixtureTester(t, "component.a");
	const destPath = fixtureTester.destPath;

	// In this test, we're testing the behavior of a custom preload configuration
	// which is defined in "ui5-custom-preload-config.yaml".
	// This custom preload configuration generates a Component-preload.js similar to a default one.
	// However, it will omit a resource ("test.js") from the bundle.

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-preload-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"component.a": {}
			}
		}
	});

	// Check that generated preload bundle doesn't contain the omitted file:
	t.false((await fs.readFile(`${destPath}/resources/id1/Component-preload.js`, {encoding: "utf8"}))
		.includes("id1/test.js"));


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-custom-preload-config.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});
});

test.serial("Build module.b project multiple times", async (t) => {
	const fixtureTester = new FixtureTester(t, "module.b");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		},
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Change a source file in module.b
	const changedFilePath = `${fixtureTester.fixturePath}/dev/devTools.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);

	// #3 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		}
	});

	// Check whether the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/resources/b/module/dev/devTools.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added");`), "Build dest contains changed file content");


	// Remove a source file in module.b
	await fs.rm(`${fixtureTester.fixturePath}/dev/devTools.js`);

	// #4 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		}
	});

	// Check that the removed file is NOT in the destPath anymore
	// (dist output should be totally empty: no source files -> no build result)
	await t.throwsAsync(fs.readFile(`${destPath}/resources/b/module/dev/devTools.js`, {encoding: "utf8"}));


	// #5 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});


	// Add a new file in module.b
	await fs.mkdir(`${fixtureTester.fixturePath}/dev/newFolder`, {recursive: true});
	await fs.writeFile(`${fixtureTester.fixturePath}/dev/newFolder/newFile.js`,
		`console.log("this is a new file which should be included in the build result")`);

	// #6 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		},
	});

	// Check whether the added file is in the destPath
	const newFile = await fs.readFile(`${destPath}/resources/b/module/dev/newFolder/newFile.js`,
		{encoding: "utf8"});
	t.true(newFile.includes(`this is a new file which should be included in the build result`),
		"Build dest contains correct file content");


	// Add a new path mapping:
	const originalUi5Yaml = await fs.readFile(`${fixtureTester.fixturePath}/ui5.yaml`, {encoding: "utf8"}); // for later
	const newFileName = "someOtherNewFile.js";
	const newFolderName = "newPathmapping";
	const virtualPath = `/resources/b/module/${newFolderName}/`;
	await fs.writeFile(`${fixtureTester.fixturePath}/ui5.yaml`,
		`---
specVersion: "5.0"
type: module
metadata:
  name: module.b
resources:
  configuration:
    paths:
      /resources/b/module/dev/: dev
      ${virtualPath}: ${newFolderName}`
	);

	// Create a resource for this new path mapping:
	await fs.mkdir(`${fixtureTester.fixturePath}/${newFolderName}`, {recursive: true});
	await fs.writeFile(`${fixtureTester.fixturePath}/${newFolderName}/${newFileName}`,
		`console.log("this should be included in the build result if the path mapping has been set")`);

	// #7 build (no cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {"module.b": {}}
		},
	});

	// Check whether the added file is in the destPath
	const someOtherNewFile = await fs.readFile(`${destPath}${virtualPath}${newFileName}`,
		{encoding: "utf8"});
	t.true(someOtherNewFile.includes(`path mapping has been set`), "Build dest contains correct file content");


	// Remove the path mapping again (revert original ui5.yaml):
	await fs.writeFile(`${fixtureTester.fixturePath}/ui5.yaml`, originalUi5Yaml);

	// #8 build (with cache, with changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {} // -> cache can be reused
		},
	});

	// Check that the added resource of the path mapping is NOT in the destPath anymore:
	await t.throwsAsync(fs.readFile(`${destPath}${virtualPath}${newFileName}`,
		{encoding: "utf8"}));


	// #9 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
			}
		},
	});
});

test.serial("Build race condition: file modified during active build", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	await fixtureTester._initialize();
	const testFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	const originalContent = await fs.readFile(testFilePath, {encoding: "utf8"});

	// #1 Build with race condition triggered by custom task
	// The custom task (configured in ui5-race-condition.yaml) modifies test.js during the build,
	// after the source index is created but before tasks that process test.js execute.
	// This creates a race condition where the cached content hash no longer matches the actual file.
	//
	// Expected behavior:
	// - Build should detect that source file hash changed during execution
	// - Build should fail with an error OR mark cache as invalid
	//
	// FIXME: Current behavior:
	// - Build succeeds without detecting the race condition
	// - Cache is written with inconsistent data (index hash != processed content hash)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-race-condition.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Verify the race condition occurred: the modification made by the custom task is in the output
	const builtFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(
		builtFileContent.includes(`RACE CONDITION MODIFICATION`),
		"Build output contains the modification made during build"
	);

	// #2 Revert the source file to original content
	await fs.writeFile(testFilePath, originalContent);

	// #3 Build again after reverting the source
	// FIXME: The cache should be invalidated because the previous build had a race condition,
	// but currently it's reused (projects: {}). Once proper validation is implemented,
	// this should trigger a full rebuild: {"application.a": {}}
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-race-condition.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {} // Current: cache reused | Expected: {"application.a": {}}
		}
	});

	// FIXME: Due to incorrect cache reuse from build #1, the output still contains the modification
	// even though the source was reverted. This demonstrates the cache corruption issue.
	// Expected: finalBuiltContent should NOT contain "RACE CONDITION MODIFICATION"
	const finalBuiltContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(
		finalBuiltContent.includes(`RACE CONDITION MODIFICATION`),
		"Build output incorrectly contains the modification due to corrupted cache"
	);
});

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../tmp/ProjectBuilder/${folderName}`, import.meta.url));
}

async function rmrf(dirPath) {
	return fs.rm(dirPath, {recursive: true, force: true});
}

class FixtureTester {
	constructor(t, fixtureName) {
		this._t = t;
		this._sinon = t.context.sinon;
		this._fixtureName = fixtureName;
		this._initialized = false;

		// Public
		this.fixturePath = getTmpPath(fixtureName);
		this.destPath = getTmpPath(`${fixtureName}/dist`);
	}

	async _initialize() {
		if (this._initialized) {
			return;
		}
		process.env.UI5_DATA_DIR = getTmpPath(`${this._fixtureName}/.ui5`);
		await rmrf(this.fixturePath); // Clean up any previous test runs
		await fs.cp(getFixturePath(this._fixtureName), this.fixturePath, {recursive: true});
		this._initialized = true;
	}

	async buildProject({graphConfig = {}, config = {}, assertions = {}} = {}) {
		await this._initialize();
		this._sinon.resetHistory();

		const graph = await graphFromPackageDependencies({
			...graphConfig,
			cwd: this.fixturePath,
		});

		// Execute the build
		await graph.build(config);

		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
	}

	_assertBuild(assertions) {
		const {projects = {}} = assertions;

		const projectsInOrder = [];
		const seenProjects = new Set();
		const tasksByProject = {};

		// Extract build status to identify built projects and their order
		const buildStatusEvents = this._t.context.buildStatusEventStub.args.map((args) => args[0]);
		for (const event of buildStatusEvents) {
			if (!seenProjects.has(event.projectName)) {
				seenProjects.add(event.projectName);
				if (event.status === "project-build-start") {
					projectsInOrder.push(event.projectName);
				}
			}
		}

		// Extract task status to identify skipped & executed tasks per project
		const projectBuildStatusEvents = this._t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
		for (const event of projectBuildStatusEvents) {
			if (!tasksByProject[event.projectName]) {
				tasksByProject[event.projectName] = {executed: [], skipped: []};
			}
			if (event.status === "task-skip") {
				tasksByProject[event.projectName].skipped.push(event.taskName);
			} else if (event.status === "task-start") {
				tasksByProject[event.projectName].executed.push(event.taskName);
			}
		}

		// Assert projects built in order
		const expectedProjects = Object.keys(projects);
		this._t.deepEqual(projectsInOrder, expectedProjects);

		// Assert skipped tasks per project
		for (const [projectName, expectedSkipped] of Object.entries(projects)) {
			const skippedTasks = expectedSkipped.skippedTasks || [];
			const actualSkipped = (tasksByProject[projectName]?.skipped || []).sort();
			const expectedArray = skippedTasks.sort();
			this._t.deepEqual(actualSkipped, expectedArray);
		}
	}
}

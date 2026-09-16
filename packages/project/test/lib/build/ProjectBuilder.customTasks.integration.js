import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

const FixtureTester = createFixtureTesterFactory("customTasks");
registerBuildHooks(test);

test.serial("Build application.a (custom task and tag handling)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes, with custom tasks)
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask.yaml"},
		config: {destPath, cleanDest: true},
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
						"generateVersionInfo",
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
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
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
						"generateVersionInfo",
					]
				}
			}
		}
	});
});

test.serial("Build application.a (multiple custom tasks 2)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// This test should cover a scenario with multiple custom tasks.

	// #1 build (no cache, no changes, with custom tasks)
	// During this build, "custom-task-0" sets the tag "isDebugVariant" to test.js.
	// "custom-task-1" checks if it's able to read this tag.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks-2.yaml"},
		config: {destPath, cleanDest: true},
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


	// Modify file to trigger a new build
	// (this is related to the custom tasks):
	await fs.appendFile(`${fixtureTester.fixturePath}/webapp/test.js`, `console.log("CHANGED FILE");`);

	// #2 build (with cache, with changes, with custom tasks)
	// During this build, "custom-task-0" sets a different tag to test.js (namely "OmitFromBuildResult").
	// "custom-task-1" again checks if it's able to read this different tag.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks-2.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
						"generateVersionInfo",
					]
				}
			}
		}
	});

	// Check that test.js is omitted from build output:
	await t.throwsAsync(fs.readFile(`${destPath}/test.js`, {encoding: "utf8"}));


	// Add new file to trigger another build
	// (this is unrelated to the custom tasks):
	await fs.writeFile(`${fixtureTester.fixturePath}/webapp/newFile.js`, `console.log("NEW FILE");`);

	// #4 build (with cache, with changes, with custom tasks)
	// During this build, both custom tasks are expected to get skipped.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks-2.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"custom-task-0",
						"custom-task-1",
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateFlexChangesBundle",
						"replaceCopyright",
						"generateVersionInfo",
					]
				}
			}
		}
	});


	// #5 build (with cache, no changes, with custom tasks)
	// During this build, everything should get skipped.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-multiple-customTasks-2.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});
});

// eslint-disable-next-line ava/no-skip-test
test.serial.skip("Build application.a (dependency content changes)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// Scenario: A custom task reads dependency resources via taskUtil.getProject().getReader() and conditionally
	// modifies application resources based on what it finds. When the dependency content changes, the application
	// should be rebuilt so the custom task can react to the new dependency state.
	//
	// Currently skipped: The custom task accesses dependencies through taskUtil.getProject("library.d").getReader()
	// rather than the monitored "dependencies" reader parameter. Reads through this path are not tracked by the
	// caching system's ResourceRequestManager, so dependency changes don't invalidate the application's result cache.
	// Fixing this requires tracking reads made via taskUtil.getProject().getReader() as dependency requests.

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
				"application.a": {
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

test.serial("Build application.a (custom task determineBuildSignature callback)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	await fixtureTester._initialize();

	// The custom task "build-signature-task" implements a determineBuildSignature callback which
	// derives the project's build signature from an on-disk control file at the project root.
	// Changing that file's content changes the returned signature (and nothing else), which must
	// invalidate application.a's build cache — proving the callback is wired into signature
	// computation. A stable content must keep the cache intact.
	const controlFilePath = `${fixtureTester.fixturePath}/buildSignatureControl.txt`;
	await fs.writeFile(controlFilePath, "v1");

	// #1 build (no cache): everything builds
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-buildSignature.yaml"},
		config: {destPath, cleanDest: true},
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

	// #2 build (with cache, signature unchanged): full cache hit, nothing rebuilt
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-buildSignature.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});

	// Change only the control file → determineBuildSignature returns a different value.
	// No source or dependency resource changes.
	await fs.writeFile(controlFilePath, "v2");

	// #3 build (with cache, changed signature): application.a's build signature changed, so its
	// cache is invalidated and it is rebuilt. The dependencies are unaffected.
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-buildSignature.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				// application.a is rebuilt (its build signature changed); none of its tasks can be
				// reused from cache, since the changed signature invalidates the whole project cache.
				"application.a": {}
			}
		}
	});

	// #4 build (with cache, signature unchanged again): full cache hit, nothing rebuilt
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-customTask-buildSignature.yaml"},
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});
});

test.serial("Build application.a (cross-project tag change)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	await fixtureTester._initialize();

	// Modify library.d's ui5.yaml at runtime to add the dep-tag-setter custom task
	const libraryDYamlPath = `${fixtureTester.fixturePath}/node_modules/library.d/ui5.yaml`;
	await fs.writeFile(libraryDYamlPath,
		`---
specVersion: "2.3"
type: library
metadata:
  name: library.d
  copyright: Some fancy copyright
resources:
  configuration:
    paths:
      src: main/src
      test: main/test
builder:
  customTasks:
    - name: dep-tag-setter
      afterTask: minify
`);

	// #1 build (no cache, with all dependencies)
	// dep-tag-setter sets project:FirstBuild on some.js
	// dep-tag-reader verifies project:FirstBuild is present
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-crossProject-tagChange.yaml"},
		config: {
			destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true},
			excludedTasks: ["minify"],
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

	// #2 build (cache, no changes) → all skipped
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-crossProject-tagChange.yaml"},
		config: {
			destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true},
			excludedTasks: ["minify"],
		},
		assertions: {
			projects: {}
		}
	});

	// Change source in library.d to trigger rebuild
	const someJsPath = `${fixtureTester.fixturePath}/node_modules/library.d/main/src/library/d/some.js`;
	await fs.appendFile(someJsPath, `\nconsole.log("tag change trigger");\n`);

	// #3 build (cache, library.d source changed)
	// library.d rebuilt → dep-tag-setter now sets project:SubsequentBuild (different tag than #1)
	// library.d's index signature changes due to the tag change
	// application.a rebuilt because its dependency index changed
	// dep-tag-reader verifies project:SubsequentBuild is present
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-crossProject-tagChange.yaml"},
		config: {
			destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true},
			excludedTasks: ["minify"],
		},
		assertions: {
			projects: {
				"library.d": {
					// FIXME: skippedTasks need empirical determination once runtime bugs are fixed
					skippedTasks: [
						"buildThemes",
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"replaceBuildtime",
					]
				},
				"application.a": {
					// FIXME: skippedTasks need empirical determination once runtime bugs are fixed
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateComponentPreload",
						"generateFlexChangesBundle",
						"replaceCopyright",
						"replaceVersion",
						"generateVersionInfo",
					]
				},
			}
		}
	});

	// #4 build (cache, no changes) → all skipped
	await fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-crossProject-tagChange.yaml"},
		config: {
			destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true},
			excludedTasks: ["minify"],
		},
		assertions: {
			projects: {}
		}
	});
});

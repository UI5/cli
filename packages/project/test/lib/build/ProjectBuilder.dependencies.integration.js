import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

const FixtureTester = createFixtureTesterFactory("deps");
registerBuildHooks(test);

test.serial("Build application.a (with various dependencies)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, dependencyIncludes: {includeAllDependencies: true}},
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


	// #2 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Add a "component" dependency to application.a:
	await fixtureTester.addComponentDependency(`${fixtureTester.fixturePath}/webapp`);

	// #3 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"component.z": {},
				"application.a": {
					skippedTasks: [
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


	// Add a "library" dependency to application.a:
	await fixtureTester.addLibraryDependency(`${fixtureTester.fixturePath}/webapp`);

	// #4 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.z": {},
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


	// Add a "themelib" dependency to application.a:
	await fixtureTester.addThemeLibraryDependency(`${fixtureTester.fixturePath}/webapp`);

	// #5 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"themelib.z": {},
				"application.a": {
					skippedTasks: [
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


	// Add a "module" dependency to application.a:
	await fixtureTester.addModuleDependency(`${fixtureTester.fixturePath}/webapp`);

	// #6 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"module.z": {},
				"application.a": {
					skippedTasks: [
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

test.serial("Build application.a (including only some dependencies)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// In this test, we're testing the "dependencyIncludes" build option
	// which allows to include only a subset of the dependencies of a project in the build result.
	// "application.a" has 4 dependencies defined: library.a, library.b, library.c and library.d.

	// #1 build
	// Only include library.a and library.b as dependencies, but not library.c and library.d:

	// Note: For the initial build, ALL dependencies are built,
	// due to the execution of the "generateVersionInfo" task in application.a which requires dependencies to be built.
	// In subsequent builds, the cached results of the dependencies can be reused,
	// so "includeDependency" can come to effect.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false,
			dependencyIncludes: {includeDependency: ["library.a", "library.b"]}},
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

	// Check that only the included dependencies are in the destPath:
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/a/library-preload.js`,
		{encoding: "utf8"}));
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/b/library-preload.js`,
		{encoding: "utf8"}));

	// Check that the remaining dependencies are NOT in the destPath:
	// (Note: although library.c and library.d were built,
	// they are not included in the build result because of the flag)
	await t.throwsAsync(fs.readFile(`${destPath}/resources/library/c/library-preload.js`,
		{encoding: "utf8"}));
	await t.throwsAsync(fs.readFile(`${destPath}/resources/library/d/library-preload.js`,
		{encoding: "utf8"}));


	// #2 build
	// Exclude library.d as dependency, but include all other dependencies
	// (builds of library.a, library.b and library.c can be reused from cache):
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true,
			dependencyIncludes: {includeAllDependencies: true, excludeDependency: ["library.d"]}},
		assertions: {
			projects: {}
		}
	});

	// Check that only the included dependencies are in the destPath:
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/a/library-preload.js`,
		{encoding: "utf8"}));
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/b/library-preload.js`,
		{encoding: "utf8"}));
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/c/library-preload.js`,
		{encoding: "utf8"}));

	// Check that the excluded dependency is NOT in the destPath:
	await t.throwsAsync(fs.readFile(`${destPath}/resources/library/d/library-preload.js`,
		{encoding: "utf8"}));


	// #3 build
	// Include all dependencies
	// (builds of ALL libraries can be reused from cache):
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true,
			dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});

	// Check that all dependencies are in the destPath:
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/a/library-preload.js`,
		{encoding: "utf8"}));
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/b/library-preload.js`,
		{encoding: "utf8"}));
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/c/library-preload.js`,
		{encoding: "utf8"}));
	await t.notThrowsAsync(fs.readFile(`${destPath}/resources/library/d/library-preload.js`,
		{encoding: "utf8"}));


	// Delete a dependency ("library.d") from application.a:
	await fs.rm(`${fixtureTester.fixturePath}/node_modules/library.d`, {recursive: true, force: true});
	const packageJsonContent = JSON.parse(
		await fs.readFile(`${fixtureTester.fixturePath}/package.json`, {encoding: "utf8"}));
	delete packageJsonContent.dependencies["library.d"];
	await fs.writeFile(`${fixtureTester.fixturePath}/package.json`, JSON.stringify(packageJsonContent, null, 2));

	// #4 build
	// Build application.a again with "includeAllDependencies" and check with assertion "allProjects"
	// that "library.d" isn't even seen.
	//
	// library.a, library.b and library.c each declare library.d as a dependency in their .library, so
	// generateLibraryManifest embeds library.d's version as the dependency minVersion in their
	// manifest.json (manifestCreator resolves it via taskUtil.getProject("library.d").getVersion()).
	// Because that read is tracked as a task input, removing library.d changes the input and
	// re-runs generateLibraryManifest (and the downstream generateLibraryManifest-dependent tasks)
	// for library.a/b/c; their unaffected tasks stay cached. application.a rebuilds because its
	// dependency set changed.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true,
			dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			allProjects: ["library.a", "library.b", "library.c", "application.a"],
			projects: {
				"library.a": {
					skippedTasks: [
						"buildThemes",
						"escapeNonAsciiCharacters",
						"minify",
						"replaceBuildtime",
						"replaceCopyright",
						"replaceVersion",
					]
				},
				"library.b": {
					skippedTasks: [
						"buildThemes",
						"escapeNonAsciiCharacters",
						"minify",
						"replaceBuildtime",
						"replaceCopyright",
						"replaceVersion",
					]
				},
				"library.c": {
					skippedTasks: [
						"buildThemes",
						"escapeNonAsciiCharacters",
						"minify",
						"replaceBuildtime",
						"replaceCopyright",
						"replaceVersion",
					]
				},
				"application.a": {
					skippedTasks: [
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"generateComponentPreload",
						"generateFlexChangesBundle",
						"minify",
						"replaceCopyright",
						"replaceVersion",
					]
				}
			},
		}
	});
});

test.serial("Build library.d (with various dependencies)", async (t) => {
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


	// Add a "library" dependency to library.d:
	await fixtureTester.addLibraryDependency(`${fixtureTester.fixturePath}/main/src/library/d`);

	// #3 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.z": {},
				"library.d": {
					skippedTasks: [
						"buildThemes",
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"replaceBuildtime",
					]
				},
			}
		}
	});


	// Add a "themelib" dependency to library.d:
	await fixtureTester.addThemeLibraryDependency(`${fixtureTester.fixturePath}/main/src/library/d`);

	// #4 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"themelib.z": {},
				"library.d": {
					skippedTasks: [
						"buildThemes",
						"enhanceManifest",
						"escapeNonAsciiCharacters",
						"replaceBuildtime",
					]
				}
			}
		}
	});
});

test.serial("Build theme.library.e (with various dependencies)", async (t) => {
	const fixtureTester = new FixtureTester(t, "theme.library.e");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {"theme.library.e": {}}
		}
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Add a "library" dependency to theme.library.e:
	await fixtureTester.addLibraryDependency(`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme`);

	// #3 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.z": {},
				"theme.library.e": {
					skippedTasks: [
						"buildThemes",
						"replaceCopyright",
						"replaceVersion",
					]
				},
			}
		}
	});
});

test.serial("Build component.a (with various dependencies)", async (t) => {
	const fixtureTester = new FixtureTester(t, "component.a");
	const destPath = fixtureTester.destPath;

	// #1 build (with empty cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"component.a": {}
			}
		}
	});


	// #2 build (with cache, no changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Add a "component" dependency to component.a:
	await fixtureTester.addComponentDependency(`${fixtureTester.fixturePath}/src`);

	// #3 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"component.z": {},
				"component.a": {
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


	// Add a "library" dependency to component.a:
	await fixtureTester.addLibraryDependency(`${fixtureTester.fixturePath}/src`);

	// #4 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.z": {},
				"component.a": {
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


	// Add a "themelib" dependency to component.a:
	await fixtureTester.addThemeLibraryDependency(`${fixtureTester.fixturePath}/src`);

	// #5 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"themelib.z": {},
				"component.a": {
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


	// Add a "module" dependency to component.a:
	await fixtureTester.addModuleDependency(`${fixtureTester.fixturePath}/src`);

	// #6 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"module.z": {},
				"component.a": {
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
});

test.serial("Build module.b (with various dependencies)", async (t) => {
	const fixtureTester = new FixtureTester(t, "module.b");
	const destPath = fixtureTester.destPath;

	// #1 build (no cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"module.b": {}
			}
		},
	});


	// #2 build (with cache, no changes)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {}
		}
	});


	// Add a "library" dependency to module.b:
	await fixtureTester.addLibraryDependency(`${fixtureTester.fixturePath}/dev`);

	// #3 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"library.z": {},
				"module.b": {}
			}
		},
	});


	// Add a "themelib" dependency to module.b:
	await fixtureTester.addThemeLibraryDependency(`${fixtureTester.fixturePath}/dev`);

	// #4 build (no cache, with changes, with dependencies)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
		assertions: {
			projects: {
				"themelib.z": {},
				"module.b": {}
			}
		}
	});
});

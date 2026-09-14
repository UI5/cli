import test from "ava";
import fs from "node:fs/promises";
import Cache from "../../../lib/build/cache/Cache.js";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

const FixtureTester = createFixtureTesterFactory("cacheModes");
registerBuildHooks(test);

test.serial("Build application.a with --cache=Default", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 Build with empty cache --> all tasks execute
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, cache: Cache.Default},
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

	// #2 Build with valid cache, no changes --> nothing rebuilds (all cached)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Default},
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for cache test");\n`);

	// #3 Build with valid cache, source changes --> only affected tasks rebuild
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Default},
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

	// Verify the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added for cache test");`),
		"Build dest contains changed file content");
});

test.serial("Build application.a with --cache=Off", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 Build with cache=Off --> all tasks execute, cache not written
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, cache: Cache.Off},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {},
			}
		}
	});

	// #2 Build with cache=Off (again) --> all tasks execute again (no cache reuse)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Off},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {},
			}
		}
	});

	// #3 Build with cache=Default --> all tasks execute (no cache from previous builds)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Default},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {},
			}
		}
	});

	// #4 Build with cache=Default (again) --> nothing rebuilds (cache now exists)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Default},
		assertions: {
			projects: {}
		}
	});

	// #5 Build with cache=Off --> all tasks execute (ignores existing cache)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Off},
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {},
			}
		}
	});
});

test.serial("Build application.a with --cache=ReadOnly", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1 Build with cache=Default --> all tasks execute, cache written
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, cache: Cache.Default},
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

	// #2 Build with cache=ReadOnly, no changes --> nothing rebuilds (cache used)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.ReadOnly},
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for ReadOnly test");\n`);

	// #3 Build with cache=ReadOnly --> affected tasks rebuild, BUT cache not updated
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.ReadOnly},
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

	// Verify the changed file is in the destPath
	const builtFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(builtFileContent.includes(`test("line added for ReadOnly test");`),
		"Build dest contains changed file content");

	// #4 Build with cache=Default, no new changes --> rebuilds again (cache from #3 missing)
	// This validates that ReadOnly didn't write the cache in step #3
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Default},
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
});

test.serial("Build application.a with --cache=Force (1)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1: Build with cache=Default --> all tasks execute, cache written
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: false, cache: Cache.Default},
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

	// #2: Build with cache=Force, no changes --> nothing rebuilds (cache used)
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true, cache: Cache.Force},
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for Force test");\n`);

	// #3: Build with cache=Force --> ERROR (cache invalid due to source changes)
	const error = await t.throwsAsync(async () => {
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: true, cache: Cache.Force},
		});
	});

	t.truthy(error, "Build with Force mode should throw error when cache is stale");
	t.true(error.message.includes(`Cache is in "Force" mode but cache is stale for project application.a ` +
		`due to 1 changed source file(s). ` +
		`Use "Default", "ReadOnly" or "Off" to rebuild.`));
});

test.serial("Build application.a with --cache=Force (2)", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;

	// #1: Build with cache=Force on empty cache --> ERROR with clear message
	const error = await t.throwsAsync(async () => {
		await fixtureTester.buildProject({
			config: {destPath, cleanDest: false, cache: Cache.Force},
		});
	});

	t.truthy(error, "Build with Force mode should throw error when cache is empty");
	t.true(error.message.includes(`Cache is in "Force" mode but no cache found for project application.a. ` +
		`Use "Default", "ReadOnly" or "Off" to rebuild.`));
});

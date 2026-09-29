import test from "ava";
import esmock from "esmock";
import {setTimeout} from "node:timers/promises";
import fs from "node:fs/promises";
import Cache from "../../../lib/build/cache/Cache.js";
import {
	createParcelWatcherMock, createFixtureTesterFactory, registerBuildHooks,
} from "./__helper__/BuildServerFixtureTester.js";

// Mock @parcel/watcher for the entire import tree reachable from graph.js so the build server's
// WatchHandler does not try to subscribe to real FSEvents/inotify/ReadDirectoryChangesW handles.
// Tests fire watcher events deterministically via FixtureTester#fireWatcherEvent instead of
// waiting for OS-level event delivery, which is both flaky (timing-dependent) and impossible
// inside sandboxed environments where FSEvents/inotify access is restricted.
const watcherMock = createParcelWatcherMock();
const {graphFromPackageDependencies} = await esmock.p("../../../lib/graph/graph.js", {}, {
	"@parcel/watcher": {
		default: watcherMock.api,
		...watcherMock.api,
	},
});

const FixtureTester = createFixtureTesterFactory("cacheModes", {graphFromPackageDependencies, watcherMock});
registerBuildHooks(test, {watcherMock});

test.serial("Serve application.a with --cache=Default", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1: Serve and request with empty cache --> all tasks execute
	await fixtureTester.serveProject({config: {cache: Cache.Default}});
	await fixtureTester.requestResource({
		resource: "/test.js",
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

	// #2: Request with valid cache, no changes --> nothing rebuilds (all cached)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for cache test");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #3: Request with valid cache, source changes --> only affected tasks rebuild
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
						"generateVersionInfo"
					]
				}
			}
		}
	});

	// Verify the changed file is served
	const resource = await fixtureTester.requestResource({resource: "/test.js"});
	const servedFileContent = await resource.getString();
	t.true(servedFileContent.includes(`test("line added for cache test");`),
		"Served resource contains changed file content");
});

test.serial("Serve application.a with --cache=Off", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1: Serve and request with cache=Off --> all tasks execute, cache not written
	await fixtureTester.serveProject({config: {cache: Cache.Off}});
	await fixtureTester.requestResource({
		resource: "/test.js",
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

	// #2: Request with cache=Off (again) --> nothing rebuilds (cache not written, but no changes)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for ReadOnly test");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #3: Request the source file --> all tasks execute (cache still not written, but changes detected)
	await fixtureTester.requestResource({
		resource: "/test.js",
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

	// Verify the changed file is served
	const resource = await fixtureTester.requestResource({resource: "/test.js"});
	const servedFileContent = await resource.getString();
	t.true(servedFileContent.includes(`test("line added for ReadOnly test");`),
		"Served resource contains changed file content");

	// Restart server with cache=Default
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Default}});

	// #4: Request with cache=Default --> all tasks execute (no cache from previous Off mode)
	await fixtureTester.requestResource({
		resource: "/test.js",
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

	// #5: Request with cache=Default (again) --> nothing rebuilds (cache now exists)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Restart server with cache=Off
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Off}});

	// #6: Request with cache=Off --> all tasks execute (ignores existing cache)
	await fixtureTester.requestResource({
		resource: "/test.js",
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
});

test.serial("Serve application.a with --cache=ReadOnly", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1: Serve and request with cache=Default --> all tasks execute, cache written
	await fixtureTester.serveProject({config: {cache: Cache.Default}});
	await fixtureTester.requestResource({
		resource: "/test.js",
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

	// Restart server with ReadOnly mode
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.ReadOnly}});

	// #2: Request with cache=ReadOnly, no changes --> nothing rebuilds (cache used)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for ReadOnly test");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #3: Request with cache=ReadOnly --> affected tasks rebuild, BUT cache not updated
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
						"generateVersionInfo"
					]
				}
			}
		}
	});

	// Verify the changed file is served
	const resource = await fixtureTester.requestResource({resource: "/test.js"});
	const servedFileContent = await resource.getString();
	t.true(servedFileContent.includes(`test("line added for ReadOnly test");`),
		"Served resource contains changed file content");

	// Restart server with Default mode
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Default}});

	// #4: Request with cache=Default, no new changes --> cache from #3 missing
	// --> only affected tasks get re-executed (cache reuse)
	// This validates that ReadOnly didn't write the cache in step #3
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
						"generateVersionInfo"
					]
				}
			}
		}
	});
});

test.serial("Serve application.a with --cache=Force (1)", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1: Serve and request with cache=Default --> all tasks execute, cache written
	await fixtureTester.serveProject({config: {cache: Cache.Default}});
	await fixtureTester.requestResource({
		resource: "/test.js",
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

	// Restart server with Force mode
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Force}, expectBuildErrors: true});

	// #2: Request with cache=Force, no changes --> nothing rebuilds (cache used)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added for Force test");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #3: Request with cache=Force --> ERROR (cache invalid due to source changes)
	const error = await t.throwsAsync(async () => {
		await fixtureTester.requestResource({
			resource: "/test.js",
		});
	});

	t.truthy(error, "Request with Force mode should throw error when cache is stale");
	t.true(error.message.includes(`Cache is in "Force" mode but cache is stale for project application.a`));

	// Wait for async error handling to complete
	await setTimeout(50);
});

test.serial("Serve application.a with --cache=Force (2)", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1: Serve with cache=Force on empty cache --> ERROR when requesting resource
	await fixtureTester.serveProject({config: {cache: Cache.Force}, expectBuildErrors: true});

	const error = await t.throwsAsync(async () => {
		await fixtureTester.requestResource({
			resource: "/test.js",
		});
	});

	t.truthy(error, "Request with Force mode should throw error when cache is empty");
	t.true(error.message.includes(`Cache is in "Force" mode but no cache found for project application.a`));

	// Wait for async error handling to complete
	await setTimeout(50);
});

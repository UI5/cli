import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import {fileURLToPath} from "node:url";
import {setTimeout} from "node:timers/promises";
import fs from "node:fs/promises";
import {appendFileSync} from "node:fs";
import path from "node:path";
import {setLogLevel} from "@ui5/logger";
import Cache from "../../../lib/build/cache/Cache.js";

// Ensures that all logging code paths are tested
setLogLevel("silly");

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

function createParcelWatcherMock() {
	// One entry per active subscription. WatchHandler subscribes once per source path per project,
	// so a single project can produce 1..N entries (e.g. Library has src + test paths).
	// Subscription paths are stored normalized to native separators (path.normalize) so prefix
	// matching works regardless of whether tests pass POSIX-style paths on Windows.
	const subscriptions = [];

	const api = {
		async subscribe(subPath, callback) {
			const subscription = {path: path.normalize(subPath), callback};
			subscriptions.push(subscription);
			return {
				async unsubscribe() {
					const idx = subscriptions.indexOf(subscription);
					if (idx !== -1) {
						subscriptions.splice(idx, 1);
					}
				},
			};
		},
	};

	// Find the subscription whose watched path is the longest path-segment prefix of `filePath`,
	// i.e. the callback that the real watcher would have invoked for an event on that file.
	// `filePath` is expected to already be in native form.
	function findSubscription(filePath) {
		let match = null;
		for (const sub of subscriptions) {
			const isPrefix = filePath === sub.path ||
				filePath.startsWith(sub.path + path.sep);
			if (isPrefix && (!match || sub.path.length > match.path.length)) {
				match = sub;
			}
		}
		return match;
	}

	async function fire(type, filePath) {
		// Tests build paths via template strings ("${fixturePath}/foo/bar"), which produces
		// POSIX-style separators on Windows. The real @parcel/watcher always emits native paths,
		// and WatchHandler/getVirtualPath compare against fsPath.join() output, so normalize
		// before both matching and dispatch.
		const nativePath = path.normalize(filePath);
		const sub = findSubscription(nativePath);
		if (!sub) {
			throw new Error(
				`No watcher subscription registered for path '${nativePath}'. ` +
				`Active subscriptions: ${subscriptions.map((s) => s.path).join(", ") || "(none)"}`);
		}
		sub.callback(null, [{type, path: nativePath}]);
		// Yield to the microtask queue so the synchronous "change" handler in WatchHandler and
		// the resulting BuildServer#_projectResourceChanged invalidation propagate before the
		// next request enqueues a build.
		await new Promise((resolve) => setImmediate(resolve));
	}

	function reset() {
		subscriptions.length = 0;
	}

	return {api, fire, reset};
}

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

test.afterEach.always(async (t) => {
	await t.context.fixtureTester.teardown();
	watcherMock.reset();
	t.context.sinon.restore();

	process.off("ui5.log", t.context.logEventStub);
	process.off("ui5.build-metadata", t.context.buildMetadataEventStub);
	process.off("ui5.project-build-metadata", t.context.projectBuildMetadataEventStub);
	process.off("ui5.build-status", t.context.buildStatusEventStub);
	process.off("ui5.project-build-status", t.context.projectBuildStatusEventStub);
});

// Note: This test should be the first test to run, as it covers initial build scenarios, which are not reproducible
// once the BuildServer has been started and built a project at least once.
// This is independent of caching on file-system level, which is isolated per test via tmp folders.
test.serial("Serve application.a, initial file changes", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	await fixtureTester.serveProject();

	// Directly change a source file in application.a before requesting it
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("initial change");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// Request the changed resource immediately
	const resourceRequestPromise = fixtureTester.requestResource({
		resource: "/test.js"
	});

	// Directly change the source file again, which should abort the current build and trigger a new one
	await fs.appendFile(changedFilePath, `\ntest("second change");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);
	await fs.appendFile(changedFilePath, `\ntest("third change");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// Wait for the resource to be served
	await resourceRequestPromise;

	const resource2 = await fixtureTester.requestResource({
		resource: "/test.js"
	});

	// Check whether the change is reflected
	const servedFileContent = await resource2.getString();
	t.true(servedFileContent.includes(`test("initial change");`), "Resource contains initial changed file content");
	t.true(servedFileContent.includes(`test("second change");`), "Resource contains second changed file content");
	t.true(servedFileContent.includes(`test("third change");`), "Resource contains third changed file content");
});

test.serial("Serve application.a, request application resource", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #3 request with cache and changes
	const res = await fixtureTester.requestResource({
		resource: "/test.js",
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
	const servedFileContent = await res.getString();
	t.true(servedFileContent.includes(`test("line added");`), "Resource contains changed file content");
});

test.serial("Serve application.a, create and delete a source file", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	await fixtureTester.serveProject();

	// Create a new source file in application.a *before* the first resource request
	const createdFilePath = `${fixtureTester.fixturePath}/webapp/created.js`;
	await fs.writeFile(createdFilePath, `test("created file");\n`);
	await fixtureTester.fireWatcherEvent("create", createdFilePath);

	// #1 first request — initial build picks up the just-created file
	const createdRes = await fixtureTester.requestResource({
		resource: "/created.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});
	const createdContent = await createdRes.getString();
	t.true(createdContent.includes(`test("created file");`),
		"Created resource contains the expected content");

	// #2 request again with cache — no rebuild expected
	await fixtureTester.requestResource({
		resource: "/created.js",
		assertions: {
			projects: {}
		}
	});

	// Create a *second* new file after the first build has populated the persistent cache
	const anotherFilePath = `${fixtureTester.fixturePath}/webapp/another.js`;
	await fs.writeFile(anotherFilePath, `test("another file");\n`);
	await fixtureTester.fireWatcherEvent("create", anotherFilePath);

	// #3 request the second created resource — rebuild reuses cached task results
	const anotherRes = await fixtureTester.requestResource({
		resource: "/another.js",
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});
	const anotherContent = await anotherRes.getString();
	t.true(anotherContent.includes(`test("another file");`),
		"Second created resource contains the expected content");

	// Delete the second file again
	await fs.rm(anotherFilePath);
	await fixtureTester.fireWatcherEvent("delete", anotherFilePath);

	// #4 the originally created file is still served and the cache from builds #1 and #2 is reused
	await fixtureTester.requestResource({
		resource: "/created.js",
		assertions: {
			projects: {}
		}
	});

	// #5 the second file is no longer served, but requesting it triggers a build of the dependencies
	// because the file is not known anymore and might come from a different project.
	// Note: This is special for applications, which are served at root level. For libraries, the server
	// can determine whether a resources is inside a project namespace and only trigger a build for the affected
	// project. The logic could be improved, especially like in this case where the requested resource is outside
	// of /resources or /test-resources.
	await fixtureTester.requestResource({
		resource: "/another.js",
		notFound: true,
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
			}
		}
	});

	// Delete the first source file again
	await fs.rm(createdFilePath);
	await fixtureTester.fireWatcherEvent("delete", createdFilePath);

	// #6 request the deleted resource — must no longer be served
	// Partial rebuild is needed as there is no complete cache of the project without the file
	await fixtureTester.requestResource({
		resource: "/created.js",
		notFound: true,
		assertions: {
			projects: {
				"application.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"enhanceManifest",
						"generateFlexChangesBundle",
					]
				}
			}
		}
	});

	// Sanity check: the original /test.js is still served from the rebuilt project
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});
});

test.serial("Serve application.a, request library resource", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResource({
		resource: "/resources/library/a/.library",
		assertions: {
			projects: {
				"library.a": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource({
		resource: "/resources/library/a/.library",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in library.a
	const changedFilePath = `${fixtureTester.fixturePath}/node_modules/collection/library.a/src/library/a/.library`;
	await fs.writeFile(
		changedFilePath,
		(await fs.readFile(changedFilePath, {encoding: "utf8"})).replace(
			`<documentation>Library A</documentation>`,
			`<documentation>Library A (updated #1)</documentation>`
		)
	);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #3 request with cache and changes
	const dotLibraryResource = await fixtureTester.requestResource({
		resource: "/resources/library/a/.library",
		assertions: {
			projects: {
				"library.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"minify",
						"replaceBuildtime",
					]
				}
			}
		}
	});

	// Check whether the changed file is served
	const servedFileContent = await dotLibraryResource.getString();
	t.true(
		servedFileContent.includes(`<documentation>Library A (updated #1)</documentation>`),
		"Resource contains changed file content"
	);

	// #4 request with cache (no changes)
	const manifestResource = await fixtureTester.requestResource({
		resource: "/resources/library/a/manifest.json",
		assertions: {
			projects: {}
		}
	});

	// Check whether the manifest is served correctly with changed .library content reflected
	const manifestContent = JSON.parse(await manifestResource.getString());
	t.is(
		manifestContent["sap.app"]["description"], "Library A (updated #1)",
		"Manifest reflects changed .library content"
	);
});

test.serial("Serve library", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "library.d");

	// #1 request with empty cache
	await fixtureTester.serveProject({
		config: {
			excludedTasks: ["minify"],
		}
	});
	await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {
				"library.d": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {}
		}
	});

	// Change a source file in library.d
	const changedFilePath = `${fixtureTester.fixturePath}/main/src/library/d/some.js`;
	const originalContent = await fs.readFile(changedFilePath, {encoding: "utf8"});
	await fs.writeFile(
		changedFilePath,
		originalContent.replace(
			` */`,
			` */\n// Test 1`
		)
	);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #3 request with cache and changes
	const resourceContent1 = await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {
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

	// Check whether the changed file is served
	const servedFileContent1 = await resourceContent1.getString();
	t.true(
		servedFileContent1.includes(`Test 1`),
		"Resource contains changed file content"
	);

	// Restore original file content

	await fs.writeFile(changedFilePath, originalContent);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// #4 request with cache (no changes)
	const resourceContent2 = await fixtureTester.requestResource({
		resource: "/resources/library/d/some.js",
		assertions: {
			projects: {}
		}
	});

	const servedFileContent2 = await resourceContent2.getString();
	t.false(
		servedFileContent2.includes(`Test 1`),
		"Resource does not contain changed file content"
	);
});

test.serial("Serve application.a, request application resource AND library resource", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1 request with empty cache
	await fixtureTester.serveProject();
	await fixtureTester.requestResources({
		resources: ["/test.js", "/resources/library/a/.library"],
		assertions: {
			projects: {
				"library.a": {},
				"application.a": {}
			}
		}
	});

	// #2 request with cache
	await fixtureTester.requestResources({
		resources: ["/test.js", "/resources/library/a/.library"],
		assertions: {
			projects: {}
		}
	});

	// Change a source file in application.a and library.a
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("line added");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);
	const changedFilePath2 = `${fixtureTester.fixturePath}/node_modules/collection/library.a/src/library/a/.library`;
	await fs.writeFile(
		changedFilePath2,
		(await fs.readFile(changedFilePath2, {encoding: "utf8"})).replace(
			`<documentation>Library A</documentation>`,
			`<documentation>Library A (updated #1)</documentation>`
		)
	);
	await fixtureTester.fireWatcherEvent("update", changedFilePath2);

	// #3 request with cache and changes
	const [resource1, resource2] = await fixtureTester.requestResources({
		resources: ["/test.js", "/resources/library/a/.library"],
		assertions: {
			projects: {
				"library.a": {
					skippedTasks: [
						"escapeNonAsciiCharacters",
						"minify",
						"replaceBuildtime",
					]
				},
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

	// Check whether the changed files contain the correct contents
	const resource1FileContent = await resource1.getString();
	const resource2FileContent = await resource2.getString();
	t.true(resource1FileContent.includes(`test("line added");`), "Resource contains changed file content");
	t.true(
		resource2FileContent.includes(`<documentation>Library A (updated #1)</documentation>`),
		"Resource contains changed file content"
	);
});

test.serial("Serve application.a with --cache=Default", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1: Serve and request with empty cache --> all tasks execute
	await fixtureTester.serveProject({config: {cache: Cache.Default}});
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
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
				"application.a": {}
			}
		}
	});

	// #2: Request with cache=Off (again) --> all tasks execute again (no cache reuse)
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

	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
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

	// #3: Request with cache=Default --> all tasks execute (no cache from previous Off mode)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// #4: Request with cache=Default (again) --> nothing rebuilds (cache now exists)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {}
		}
	});

	// Restart server with cache=Off
	await fixtureTester.teardown();
	await fixtureTester.serveProject({config: {cache: Cache.Off}});

	// #5: Request with cache=Off --> all tasks execute (ignores existing cache)
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
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

	// #4: Request with cache=Default, no new changes --> rebuilds again (cache from #3 missing)
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

// Regression: a non-abort build error used to leave #activeBuild set, deadlocking the BuildServer
// so subsequent resource requests would hang forever. The fix in #processBuildRequests clears
// #activeBuild in a finally block and surfaces the error via ServeLogger instead of throwing —
// verify a second request still rejects (with the same root cause) instead of hanging.
test.serial("Build server recovers from non-abort build error (no deadlock)", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	const errorEvents = [];
	await fixtureTester.serveProject({config: {cache: Cache.Force}, expectBuildErrors: true});
	fixtureTester.buildServer.on("error", (err) => errorEvents.push(err));

	// First request triggers a build that fails because cache=Force has no cache
	const firstError = await t.throwsAsync(async () => {
		await fixtureTester.requestResource({resource: "/test.js"});
	});
	t.true(
		firstError.message.includes(`Cache is in "Force" mode but no cache found for project application.a`),
		"First request rejects with the Force-mode cache miss"
	);

	// Second request must reject again (not hang) — proves #activeBuild was cleared after the failure
	const secondError = await t.throwsAsync(async () => {
		await fixtureTester.requestResource({resource: "/test.js"});
	});
	t.true(
		secondError.message.includes(`Cache is in "Force" mode but no cache found for project application.a`),
		`Second request rejects with the same error instead of deadlocking. Got: ${secondError && secondError.message}`
	);

	// Build errors are surfaced via ServeLogger, not via the "error" event — the latter stays
	// reserved for fatal failures (watcher crash, etc.) that must terminate the server.
	await setTimeout(50);
	t.is(errorEvents.length, 0, "No fatal 'error' events emitted for recoverable build failures");
});

// ProjectBuildCache's StageCache must be cleared correctly when a build is aborted.
// A task that completed during an aborted attempt has already called recordTaskResult,
// which adds its stage to the in-memory StageCache. On retry,
// prepareTaskExecutionAndValidateCache might finds those entries via #findStageCache if not cleaned up.
// It will then emit task-skip events for tasks that the retry should have actually re-executed.
test.serial("Aborted initial build must not leak in-memory StageCache to retry", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "library.d");
	await fixtureTester.serveProject({
		config: {excludedTasks: ["minify"]}
	});
	const project = fixtureTester.graph.getProject("library.d");

	// One-shot trigger: when `replaceBuildtime` (the 4th task for this fixture) ends in the
	// initial build, simulate a watcher event by calling _projectResourceChanged directly.
	// This invalidates library.d, aborts the running build at the next signal check, and
	// re-enqueues it. By that point, tasks 1-4 have completed recordTaskResult and live in
	// the in-memory StageCache. Tasks 5+ never started.
	let aborted = false;
	const abortHandler = (event) => {
		if (
			!aborted &&
			event.projectName === "library.d" &&
			event.status === "task-end" &&
			event.taskName === "replaceBuildtime"
		) {
			aborted = true;
			fixtureTester.buildServer._projectResourceChanged(
				project, "/resources/library/d/some.js", false);
		}
	};
	process.on("ui5.project-build-status", abortHandler);

	try {
		// byPath returns once the retry succeeds, so all events for both attempts are captured.
		await fixtureTester._reader.byPath("/resources/library/d/some.js");
	} finally {
		process.off("ui5.project-build-status", abortHandler);
	}

	t.true(aborted, "Test setup precondition: abort trigger should have fired");

	// On a fresh fixture the persistent cache is empty. After the fix, the retry's
	// prepareTaskExecutionAndValidateCache should find no cached stages (in-memory cache
	// from the aborted build is discarded) and execute every task. No task-skip events
	// should be emitted for library.d.
	const skippedTasks = t.context.projectBuildStatusEventStub.args
		.map(([event]) => event)
		.filter((e) => e.projectName === "library.d" && e.status === "task-skip")
		.map((e) => e.taskName);

	t.deepEqual(skippedTasks, [],
		"Persistent cache is empty and the in-memory StageCache populated by the aborted " +
		"attempt must not be reused on retry");
});

// Same scenario as above but the for a later abort: After `generateLibraryPreload`
test.serial(
	"Aborted initial build must not leak in-memory StageCache to retry (late abort)", async (t) => {
		const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "library.d");
		await fixtureTester.serveProject({
			config: {excludedTasks: ["minify"]}
		});
		const project = fixtureTester.graph.getProject("library.d");

		let aborted = false;
		const abortHandler = (event) => {
			if (
				!aborted &&
				event.projectName === "library.d" &&
				event.status === "task-end" &&
				event.taskName === "generateLibraryPreload"
			) {
				aborted = true;
				fixtureTester.buildServer._projectResourceChanged(
					project, "/resources/library/d/some.js", false);
			}
		};
		process.on("ui5.project-build-status", abortHandler);

		try {
			await fixtureTester._reader.byPath("/resources/library/d/some.js");
		} finally {
			process.off("ui5.project-build-status", abortHandler);
		}

		t.true(aborted, "Test setup precondition: abort trigger should have fired");

		const skippedTasks = t.context.projectBuildStatusEventStub.args
			.map(([event]) => event)
			.filter((e) => e.projectName === "library.d" && e.status === "task-skip")
			.map((e) => e.taskName);

		t.deepEqual(skippedTasks, [],
			"Persistent cache is empty and the in-memory StageCache populated by the aborted " +
			"attempt must not be reused on retry");
	}
);

// Regression: a build that hits the NO_CACHE state in prepareProjectBuildAndValidateCache
// (because the source signature does not match anything in the persistent cache) and then
// throws SourceChangedDuringBuildError from allTasksCompleted used to fail on retry with
// "Unexpected result cache state after restoring dependency indices for project XYZ: no_cache".
// The fix resets #resultCacheState to PENDING_VALIDATION in the source-changed branch.
//
// Repro recipe — must hit *all* of these conditions on the same ProjectBuildCache instance:
//   1. A first build runs to completion, populating the persistent index + result cache.
//   2. The project is invalidated (a real source change observed by the watcher) so the next
//      reader request drives a second build.
//   3. The second build's #initSourceIndex finds an existing index cache and transitions to
//      RESTORING_DEPENDENCY_INDICES (rather than INITIAL, which short-circuits prepare).
//   4. prepareProjectBuildAndValidateCache sees a source-signature mismatch against the
//      persisted result cache and sets #resultCacheState = NO_CACHE.
//   5. A *further* on-disk source change lands during the second build, but the watcher path
//      is stubbed so the abort signal is never set. allTasksCompleted's revalidateSourceIndex
//      then throws SourceChangedDuringBuildError instead of taking the abort path.
test.serial("Source change during second build retries cleanly without no_cache error", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "library.d");
	await fixtureTester.serveProject({
		config: {excludedTasks: ["minify"]}
	});

	const changedFilePath = `${fixtureTester.fixturePath}/main/src/library/d/some.js`;
	const originalContent = await fs.readFile(changedFilePath, {encoding: "utf8"});

	// Build 1 — populates the on-disk index + result cache.
	await fixtureTester.requestResource({resource: "/resources/library/d/some.js"});

	// Invalidate the project for build 2 by touching the source file. Use the live watcher
	// path here: a real modification needs to flow through _projectResourceChanged so the
	// project transitions to INVALIDATED and the next request enqueues a rebuild.
	await fs.writeFile(changedFilePath, originalContent + "\n// pre-build-2 change\n");
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	// Now suppress further watcher-driven aborts. The mid-build modification below is meant
	// to flow through #revalidateSourceIndex inside allTasksCompleted, *not* through the
	// watcher — otherwise the abort path runs first and the no_cache assertion never fires.
	t.context.sinon.stub(fixtureTester.buildServer, "_projectResourceChanged");

	// During build 2's task pipeline, append a second on-disk change. Hook the first task
	// that is *not* short-circuited from cache (replaceCopyright) so the synchronous write
	// lands well before allTasksCompleted's #revalidateSourceIndex reads from disk.
	let triggered = false;
	const handler = (event) => {
		if (
			!triggered &&
			event.projectName === "library.d" &&
			event.status === "task-start" &&
			event.taskName === "replaceCopyright"
		) {
			triggered = true;
			appendFileSync(changedFilePath, "\n// mid-build-2 change\n");
		}
	};
	process.on("ui5.project-build-status", handler);

	let resource;
	try {
		// Without the fix this rejects with
		// "Unexpected result cache state after restoring dependency indices for project XYZ: no_cache".
		resource = await fixtureTester._reader.byPath("/resources/library/d/some.js");
	} finally {
		process.off("ui5.project-build-status", handler);
	}

	t.true(triggered, "Test setup precondition: source change handler fired during build 2");

	const servedContent = await resource.getString();
	t.true(servedContent.includes("pre-build-2 change"),
		"Retry served content reflecting the pre-build-2 change");
	t.true(servedContent.includes("mid-build-2 change"),
		"Retry served content reflecting the mid-build-2 change");
});

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(folderName) {
	return fileURLToPath(new URL(`../../tmp/BuildServer/${folderName}`, import.meta.url));
}

async function rmrf(dirPath) {
	return fs.rm(dirPath, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
}

class FixtureTester {
	// Initialization (rmrf + fs.cp of the fixture into the tmp directory) is done up-front
	// and separately from `serveProject`, so that the build server's file watcher does not
	// race with FS events from the copy.
	static async create(t, fixtureName) {
		const fixtureTester = new FixtureTester(t, fixtureName);
		await fixtureTester._initialize();
		return fixtureTester;
	}

	constructor(t, fixtureName) {
		this._t = t;
		this._sinon = t.context.sinon;
		this._fixtureName = fixtureName;

		// Public
		this.fixturePath = getTmpPath(fixtureName);
		this.ui5DataDir = getTmpPath(`${fixtureName}/.ui5`);
		this.buildServer = null;
		this.graph = null;
	}

	async _initialize() {
		await rmrf(this.fixturePath); // Clean up any previous test runs
		await fs.cp(getFixturePath(this._fixtureName), this.fixturePath, {recursive: true});
	}

	async teardown() {
		if (this.buildServer) {
			try {
				await this.buildServer.destroy();
			} catch {
				// Ignore errors during teardown (e.g., failed Force mode builds)
			}
		}
	}

	async serveProject({graphConfig = {}, config = {}, expectBuildErrors = false} = {}) {
		const graph = this.graph = await graphFromPackageDependencies({
			...graphConfig,
			cwd: this.fixturePath,
		});

		// Execute the build
		this.buildServer = await graph.serve({...config, ui5DataDir: this.ui5DataDir});
		this.buildServer.on("error", (err) => {
			if (!expectBuildErrors) {
				this._t.fail(`Build server error: ${err.message}`);
			}
		});
		this._reader = this.buildServer.getReader();
	}

	async requestResource({resource, notFound = false, assertions}) {
		this._sinon.resetHistory();
		const res = await this._reader.byPath(resource);
		if (notFound) {
			this._t.is(res, null, `Resource '${resource}' must not be served`);
		} else {
			this._t.truthy(res, `Resource '${resource}' must be served`);
		}
		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
		return res;
	}

	async requestResources({resources, assertions}) {
		this._sinon.resetHistory();
		const returnedResources = await Promise.all(resources.map((resource) => this._reader.byPath(resource)));
		// Apply assertions if provided
		if (assertions) {
			this._assertBuild(assertions);
		}
		return returnedResources;
	}

	// Fires a synthetic watcher event through the in-process @parcel/watcher mock. Replaces the
	// real-world cycle of "modify file on disk -> wait for the OS to surface the FS event" with
	// a deterministic in-process call so tests can drive change notifications precisely.
	async fireWatcherEvent(type, filePath) {
		await watcherMock.fire(type, filePath);
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

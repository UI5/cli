import test from "ava";
import esmock from "esmock";
import fs from "node:fs/promises";
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

const FixtureTester = createFixtureTesterFactory("serving", {graphFromPackageDependencies, watcherMock});
registerBuildHooks(test, {watcherMock});

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

// Complements the unit-level transient-failure coverage with a real-timer end-to-end pass: a
// burst of rapid watcher events arrives while a reader request is parked. The extra first-build
// (100 ms) and post-abort/transient (550 ms) settle windows must not hang the request, and the
// transient aborts within the burst must never surface a `serve-error` on the status feed — the
// server reports `serve-settling` while holding, then resolves on the single settled-tree rebuild.
test.serial("Serve application.a, rapid change burst reports settling and never errors", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	const statusEvents = [];
	const statusHandler = (evt) => statusEvents.push(evt.status);
	process.on("ui5.serve-status", statusHandler);
	t.teardown(() => process.off("ui5.serve-status", statusHandler));

	await fixtureTester.serveProject();

	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;

	// Park a request, then fire several rapid changes around it — the shape of an editor save-all
	// or a `git checkout` landing while a build is in flight.
	await fs.appendFile(changedFilePath, `\ntest("burst 1");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	const resourceRequestPromise = fixtureTester.requestResource({resource: "/test.js"});

	await fs.appendFile(changedFilePath, `\ntest("burst 2");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);
	await fs.appendFile(changedFilePath, `\ntest("burst 3");\n`);
	await fixtureTester.fireWatcherEvent("update", changedFilePath);

	await resourceRequestPromise;

	const resource = await fixtureTester.requestResource({resource: "/test.js"});
	const servedFileContent = await resource.getString();
	t.true(servedFileContent.includes(`test("burst 1");`), "Resource reflects the first burst change");
	t.true(servedFileContent.includes(`test("burst 3");`), "Resource reflects the final burst change");

	t.false(statusEvents.includes("serve-error"),
		`No serve-error surfaced during the transient burst; got: ${statusEvents.join(", ")}`);
});

test.serial("Serve application.a, request application resource", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1 request with empty cache
	await fixtureTester.serveProject();
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
						"generateVersionInfo"
					]
				}
			}
		}
	});

	// Check whether the changed file is in the destPath
	const servedFileContent = await res.getString();
	t.true(servedFileContent.includes(`test("line added");`), "Resource contains changed file content");
});

// The incremental cache learns "what changed" only from watcher events. When @parcel/watcher
// reports that events were dropped, a source change may go unreported — a naive rebuild would
// then serve a stale cache hit. The recovery path forces a full re-scan so the un-notified
// change is still picked up.
test.serial("Serve application.a, dropped watcher events force a full re-scan", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	await fixtureTester.serveProject();

	// #1 build and cache the resource.
	const before = await fixtureTester.requestResource({resource: "/test.js"});
	t.false((await before.getString()).includes(`test("dropped-event change");`),
		"baseline content does not yet contain the change");

	// #2 confirm the cache is warm — a repeated request rebuilds nothing.
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {projects: {}},
	});

	// Modify a source file WITHOUT firing a watcher change event: this models the OS dropping
	// the FS event. Without recovery, the cache would keep serving the stale build result.
	const changedFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	await fs.appendFile(changedFilePath, `\ntest("dropped-event change");\n`);

	// The watcher reports the drop instead of the change. Recovery runs asynchronously and
	// emits `sourcesChanged` on completion; await that so the forced re-scan + invalidation
	// have settled before the next request.
	const recovered = new Promise((resolve) => fixtureTester.buildServer.once("sourcesChanged", resolve));
	await fixtureTester.fireWatcherError(
		new Error("Events were dropped by the FSEvents client. File system must be re-scanned."));
	await recovered;

	// #3 the next request must reflect the un-notified change, proving the forced re-scan
	// re-indexed the source tree and invalidated the stale cache.
	const after = await fixtureTester.requestResource({resource: "/test.js"});
	t.true((await after.getString()).includes(`test("dropped-event change");`),
		"resource reflects the change the watcher never reported, after the forced re-scan");
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
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
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
						"generateVersionInfo"
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

	// #5 the second file is no longer served, thus requesting it shouldn't trigger a rebuild
	// (all projects are still cached from the previous builds)
	await fixtureTester.requestResource({
		resource: "/another.js",
		notFound: true,
		assertions: {
			projects: {}
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
						"generateVersionInfo"
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
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
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

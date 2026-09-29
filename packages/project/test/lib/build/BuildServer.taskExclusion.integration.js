import test from "ava";
import esmock from "esmock";
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

const FixtureTester = createFixtureTesterFactory("taskExclusion", {graphFromPackageDependencies, watcherMock});
registerBuildHooks(test, {watcherMock});

test.serial("Serve application.a (test exclusion of generateVersionInfo)", async (t) => {
	// This test verifies that the "generateVersionInfo" task
	// can be excluded from the server build via the "excludedTasks" config option.

	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");

	// #1 Exclude "generateVersionInfo":
	await fixtureTester.serveProject({
		config: {
			excludedTasks: ["generateVersionInfo"],
		}
	});

	// Request a resource to trigger the build:
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"application.a": {
					executedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"replaceVersion",
						"minify",
						"generateFlexChangesBundle",
						"enhanceManifest",
						"generateComponentPreload"
						// "generateVersionInfo" is NOT EXECUTED
					],
				},
			}
		},
	});

	await fixtureTester.teardown();


	// #2 Don't exclude tasks (includes "generateVersionInfo"):
	await fixtureTester.serveProject({
		config: {
			excludedTasks: [],
		}
	});

	// Request a resource to trigger the build:
	await fixtureTester.requestResource({
		resource: "/test.js",
		assertions: {
			projects: {
				"library.d": {},
				"library.a": {},
				"library.b": {},
				"library.c": {},
				"application.a": {
					executedTasks: [
						"escapeNonAsciiCharacters",
						"replaceCopyright",
						"replaceVersion",
						"minify",
						"generateFlexChangesBundle",
						"enhanceManifest",
						"generateComponentPreload",
						"generateVersionInfo" // IS EXECUTED
					],
				},
			}
		},
	});
});

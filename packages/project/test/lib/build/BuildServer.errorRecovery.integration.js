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

const FixtureTester = createFixtureTesterFactory("errorRecovery", {graphFromPackageDependencies, watcherMock});
registerBuildHooks(test, {watcherMock});

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

// A normal build error must gate further rebuilds of the same project: deterministic
// builds recover only when their input changes, so re-running the same build would just
// re-produce the same failure. The gate lifts on any source change that invalidates the
// errored project (directly or via a dependency), routed through _projectResourceChanged.
test.serial("Errored project is not rebuilt until input changes", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "application.a");
	await fixtureTester.serveProject({config: {cache: Cache.Force}, expectBuildErrors: true});

	// First request triggers a build that fails because cache=Force has no cache.
	const firstError = await t.throwsAsync(() => fixtureTester.requestResource({resource: "/test.js"}));

	// Second and third requests must reject with the *same error instance* — the gate
	// short-circuits with the captured error rather than re-running the build (which
	// would produce a new Error instance carrying the same message).
	const secondError = await t.throwsAsync(() => fixtureTester.requestResource({resource: "/test.js"}));
	const thirdError = await t.throwsAsync(() => fixtureTester.requestResource({resource: "/test.js"}));
	t.is(secondError, firstError, "Gate returns the captured error instance instead of rebuilding");
	t.is(thirdError, firstError, "Gate keeps returning the same error until input changes");

	// Simulate a source change that invalidates the errored project. This should lift the
	// gate; the next request attempts a rebuild (still fails since cache=Force has no cache,
	// but with a *new* error instance — proving the gate released and the build ran).
	fixtureTester.buildServer._projectResourceChanged(
		fixtureTester.graph.getProject("application.a"),
		"/resources/application/a/test.js",
		false
	);
	await setTimeout(50);
	const afterChangeError = await t.throwsAsync(() => fixtureTester.requestResource({resource: "/test.js"}));
	t.not(afterChangeError, firstError, "Source change lifted the gate; a fresh build ran");
	t.true(afterChangeError.message.includes(`Cache is in "Force" mode`),
		"Fresh build produced an equivalent error");
});

// A build task that throws (here: buildThemes on a LESS syntax error) leaves the project's
// reused in-memory state holding the failing task's partial output and the previous
// successful build's result signature. Without a failure-path reset, fixing the source and
// re-requesting keeps serving the broken stages: the recovered source signature matches the
// retained result signature, so #findResultCache short-circuits and never re-imports the
// (uncorrupted) cached stages. This is the theme-build "fails to recover" scenario.
test.serial("Failed theme build recovers after the source is fixed", async (t) => {
	const fixtureTester = t.context.fixtureTester = await FixtureTester.create(t, "theme.library.e");
	await fixtureTester.serveProject({expectBuildErrors: true});

	const cssResource = "/resources/theme/library/e/themes/my_theme/library.css";
	const lessFilePath =
		`${fixtureTester.fixturePath}/src/theme/library/e/themes/my_theme/library.source.less`;
	const originalLess = await fs.readFile(lessFilePath, {encoding: "utf8"});

	// #1 initial request builds the theme successfully.
	const initialCss = await fixtureTester.requestResource({resource: cssResource});
	t.true((await initialCss.getString()).includes("background-color"),
		"Initial build produced valid CSS");

	// Inject a LESS syntax error and notify the watcher.
	await fs.writeFile(lessFilePath, `${originalLess}\n@@@ this is not valid less @@@\n`);
	await fixtureTester.fireWatcherEvent("update", lessFilePath);

	// #2 request now fails: buildThemes throws on the malformed input.
	const buildError = await t.throwsAsync(() => fixtureTester.requestResource({resource: cssResource}));
	t.truthy(buildError, "Build fails while the LESS file has a syntax error");

	// Fix the source and notify the watcher.
	await fs.writeFile(lessFilePath, originalLess);
	await fixtureTester.fireWatcherEvent("update", lessFilePath);

	// #3 request after the fix must recover and serve valid CSS — the failed build's partial
	// state was discarded and clean stages were re-imported.
	const recoveredCss = await fixtureTester.requestResource({resource: cssResource});
	const recoveredContent = await recoveredCss.getString();
	t.true(recoveredContent.includes("background-color"),
		"Build recovers and serves valid CSS after the source is fixed");
	t.false(recoveredContent.includes("test{"),
		"Recovered CSS does not contain artifacts of the broken build");
});

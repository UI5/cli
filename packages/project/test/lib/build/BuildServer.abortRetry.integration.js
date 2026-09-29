import test from "ava";
import esmock from "esmock";
import fs from "node:fs/promises";
import {appendFileSync} from "node:fs";
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

const FixtureTester = createFixtureTesterFactory("abortRetry", {graphFromPackageDependencies, watcherMock});
registerBuildHooks(test, {watcherMock});

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

// Regression: a build that hits the NO_CACHE state in validateCache({prepareForBuild: true})
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
//   4. validateCache({prepareForBuild: true}) sees a source-signature mismatch against the
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

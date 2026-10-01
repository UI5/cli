import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import {setLogLevel} from "@ui5/logger";

// Ensures that all logging code paths are tested
setLogLevel("silly");

// Force the native watcher backend so fileWatcher delegates verbatim to the @parcel/watcher mock
// created via createParcelWatcherMock (esmock.p intercepts it throughout the import tree, including
// inside fileWatcher.js). Without this, the module would default to polling whenever the tests run
// inside a container.
process.env.UI5_WATCH_MODE = "native";

/**
 * Creates a fresh @parcel/watcher mock for a single test file. The mock holds per-file subscription
 * state, so each test file creates its own instance and wires it into `esmock.p` when importing
 * graph.js. The returned `api` is passed as the `@parcel/watcher` mock; `fire`/`fireError`/`reset`
 * drive events deterministically and are exposed via FixtureTester.
 *
 * @returns {{api: object, fire: Function, fireError: Function, reset: Function}}
 */
export function createParcelWatcherMock() {
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

	// Deliver an error to every active subscription callback, mirroring how @parcel/watcher
	// surfaces a dropped-events condition ("File system must be re-scanned.").
	async function fireError(err) {
		// Snapshot: recovery destroys/recreates subscriptions while we iterate.
		for (const sub of subscriptions.slice()) {
			sub.callback(err);
		}
		await new Promise((resolve) => setImmediate(resolve));
	}

	return {api, fire, fireError, reset};
}

/**
 * Registers the AVA beforeEach/afterEach hooks that wire up the ui5.* process event stubs and tear
 * down the per-test build server + watcher mock. Each test file calls this with its own AVA `test`
 * object so the hooks register against the file's own test instance.
 *
 * @param {import("ava").TestFn} test The AVA test object of the calling test file
 * @param {object} options
 * @param {object} options.watcherMock The watcher mock created via {@link createParcelWatcherMock}
 */
export function registerBuildHooks(test, {watcherMock}) {
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
}

/**
 * Creates a FixtureTester subclass bound to the given scope, the file's esmock-wrapped
 * `graphFromPackageDependencies` and the file's watcher mock. The scope namespaces the temporary
 * directory tree per test file so that fixtures shared across files (e.g. "application.a") don't
 * collide when AVA runs the files in parallel.
 *
 * The returned class is used as `await FixtureTester.create(t, fixtureName)` in each test file.
 *
 * @param {string} scope Unique scope segment for the calling test file (e.g. "serving")
 * @param {object} options
 * @param {Function} options.graphFromPackageDependencies The esmock.p-wrapped graph factory
 * @param {object} options.watcherMock The watcher mock created via {@link createParcelWatcherMock}
 * @returns {typeof FixtureTester} A FixtureTester subclass bound to `scope`
 */
export function createFixtureTesterFactory(scope, {graphFromPackageDependencies, watcherMock}) {
	return class ScopedFixtureTester extends FixtureTester {
		static async create(t, fixtureName) {
			const fixtureTester = new ScopedFixtureTester(t, fixtureName);
			await fixtureTester._initialize();
			return fixtureTester;
		}

		constructor(t, fixtureName) {
			super(t, fixtureName, scope, graphFromPackageDependencies, watcherMock);
		}
	};
}

function getFixturePath(fixtureName) {
	return fileURLToPath(new URL(`../../../fixtures/${fixtureName}`, import.meta.url));
}

function getTmpPath(scope, folderName) {
	return fileURLToPath(new URL(`../../../tmp/BuildServer/${scope}/${folderName}`, import.meta.url));
}

async function rmrf(dirPath) {
	return fs.rm(dirPath, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
}

class FixtureTester {
	// Initialization (rmrf + fs.cp of the fixture into the tmp directory) is done up-front
	// and separately from `serveProject`, so that the build server's file watcher does not
	// race with FS events from the copy. Instances are created via the ScopedFixtureTester
	// subclass returned by createFixtureTesterFactory (which provides the `create` static).
	constructor(t, fixtureName, scope, graphFromPackageDependencies, watcherMock) {
		this._t = t;
		this._sinon = t.context.sinon;
		this._fixtureName = fixtureName;
		this._graphFromPackageDependencies = graphFromPackageDependencies;
		this._watcherMock = watcherMock;

		// Public
		this.fixturePath = getTmpPath(scope, fixtureName);
		this.ui5DataDir = getTmpPath(scope, `${fixtureName}/.ui5`);
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
		const graph = this.graph = await this._graphFromPackageDependencies({
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

	// `onBuildStatus`, when provided, is attached to the `ui5.project-build-status` process event for
	// the duration of the `byPath` call and detached in a `finally`. It lets a test inject a change
	// mid-build (e.g. to drive an abort/retry) without hand-rolling the process.on/off dance around
	// the request. The handler is registered AFTER resetHistory so it never sees stale events.
	async requestResource({resource, notFound = false, assertions, onBuildStatus}) {
		this._sinon.resetHistory();
		if (onBuildStatus) {
			process.on("ui5.project-build-status", onBuildStatus);
		}
		let res;
		try {
			res = await this._reader.byPath(resource);
		} finally {
			if (onBuildStatus) {
				process.off("ui5.project-build-status", onBuildStatus);
			}
		}
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
		await this._watcherMock.fire(type, filePath);
	}

	// Fires a dropped-events error through the in-process @parcel/watcher mock. Models the
	// real-world "Events were dropped by the FSEvents client. File system must be
	// re-scanned." fault: the incremental change signal is now known to be incomplete.
	async fireWatcherError(err) {
		await this._watcherMock.fireError(err);
	}

	_assertBuild(assertions) {
		/**
		 * assertions object structure:
		 * {
		 *   projects: {
		 *     "projectName": {
		 *       executedTasks: ["task1", "task2"],
		 *       skippedTasks: ["task3", "task4"],
		 *       writtenResources: {
		 *         "taskName": ["/resources/path/a", "/resources/path/b"],
		 *       },
		 *     },
		 *     // ...
		 *   }
		 * }
		 *
		 * writtenResources - optional per project, asserts the exact set of resource paths a task
		 *   wrote (sourced from the `writtenResourcePaths` field of the `task-end` build-status
		 *   event). Only tasks listed are asserted; other tasks are ignored. This is the signal for
		 *   delta-build correctness: it reveals WHAT a task did (which outputs it (re-)wrote), not
		 *   just whether it ran.
		 */
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

		// Extract task status to identify skipped & executed tasks and written resources per project
		const projectBuildStatusEvents = this._t.context.projectBuildStatusEventStub.args.map((args) => args[0]);
		for (const event of projectBuildStatusEvents) {
			if (!tasksByProject[event.projectName]) {
				tasksByProject[event.projectName] = {executed: [], skipped: [], writtenResources: {}};
			}
			if (event.status === "task-skip") {
				tasksByProject[event.projectName].skipped.push(event.taskName);
			} else if (event.status === "task-start") {
				tasksByProject[event.projectName].executed.push(event.taskName);
			} else if (event.status === "task-end") {
				tasksByProject[event.projectName].writtenResources[event.taskName] =
					event.writtenResourcePaths;
			}
		}

		// Assert projects built in order
		const expectedProjects = Object.keys(projects);
		this._t.deepEqual(projectsInOrder, expectedProjects);

		// Optional check: Assert executed tasks
		for (const [projectName, expected] of Object.entries(projects)) {
			if (!expected.executedTasks) {
				continue; // no executedTasks specified -> skip the check
			}
			const expectedArray = expected.executedTasks.sort();
			const actualExecuted = (tasksByProject[projectName]?.executed || []).sort();
			this._t.deepEqual(actualExecuted, expectedArray,
				"Executed tasks for project " + projectName + " do not match expected");
		}

		// Assert skipped tasks and written resources per project
		for (const [projectName, expected] of Object.entries(projects)) {
			const skippedTasks = expected.skippedTasks || [];
			// Dedupe: an abort+retry within a single request window emits a task-skip event per
			// attempt, so the same task can appear twice. "Skipped" is a set — assert it as one.
			const actualSkipped = [...new Set(tasksByProject[projectName]?.skipped || [])].sort();
			const expectedArray = skippedTasks.sort();
			this._t.deepEqual(actualSkipped, expectedArray);

			if (expected.writtenResources) {
				const actualWritten = tasksByProject[projectName]?.writtenResources || {};
				for (const [taskName, expectedPaths] of Object.entries(expected.writtenResources)) {
					this._t.deepEqual(
						[...(actualWritten[taskName] || [])].sort(),
						[...expectedPaths].sort(),
						`Written resources of task '${taskName}' in project '${projectName}' should match expected`
					);
				}
			}
		}
	}
}

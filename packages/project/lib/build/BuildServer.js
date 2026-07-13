import EventEmitter from "node:events";
import {createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";
import BuildReader from "./BuildReader.js";
import WatchHandler from "./helpers/WatchHandler.js";
import {isAbortError} from "./helpers/abort.js";
import {getLogger} from "@ui5/logger";
import ServeLogger from "@ui5/logger/internal/loggers/Serve";
const log = getLogger("build:BuildServer");

// Settle window for the `sourcesChanged` event, in milliseconds.
//
// The event drives live-reload notifications, so a lone edit must reach connected clients as
// fast as possible: the build it triggers can complete in well under 100 ms on small projects,
// and a trailing debounce would then dominate the edit-to-reload latency. The emit is therefore
// leading-edge — the first change of a quiet period fires immediately — followed by this
// suppression window that coalesces the rest of a burst into a single trailing emit.
//
// The value is tied to @parcel/watcher's MAX_WAIT_TIME (500 ms): the watcher caps its own
// coalescing at that interval, so an operation emitting changes continuously (e.g. `git checkout`)
// is delivered as batches up to 500 ms apart rather than one quiet-terminated batch. A window
// below that cap would see quiet between batches and emit once per batch; keeping it above the cap
// lets each batch reset the window so the whole operation collapses to one leading + one trailing
// emit. Do not lower below 500 ms without revisiting that relationship.
const SOURCES_CHANGED_SETTLE_MS = 550;

// Debounce for the request queue. A reader request enqueues a build and triggers the queue after
// this short delay so a batch of near-simultaneous requests builds together. Kept small so the
// first build after a quiet period starts promptly.
const BUILD_REQUEST_DEBOUNCE_MS = 10;

// Settle window for restarting a build that a source change aborted. When a change lands mid-build
// the running build is aborted immediately, but the restart is held until changes have been quiet
// for this long (each further change resets it). During a burst of changes — a `git checkout`, a
// save-all, a bundler writing many files — @parcel/watcher delivers batches up to its MAX_WAIT_TIME
// (500 ms) apart; restarting on the snappy BUILD_REQUEST_DEBOUNCE_MS would spawn a build per batch,
// each aborted by the next. Holding the restart above the watcher's cap collapses the burst into a
// single build against the settled tree. Reader-request-driven builds keep the snappy debounce, so
// this delay only applies to the speculative post-abort restart, not to serving a request.
const ABORTED_BUILD_RESTART_SETTLE_MS = 550;

// Loop protection for watcher recovery. A persistently failing watcher (e.g. a watched
// path that keeps erroring on re-subscribe, or an FS that keeps dropping events) would
// otherwise cycle error → recover → error indefinitely. If more than
// WATCHER_RECOVERY_MAX_ATTEMPTS recoveries complete within WATCHER_RECOVERY_WINDOW_MS, the
// watcher is treated as unrecoverable and the server escalates to the terminal ERROR state.
const WATCHER_RECOVERY_MAX_ATTEMPTS = 5;
const WATCHER_RECOVERY_WINDOW_MS = 60000;

// The server's lifecycle state. Mutated exclusively through #setState.
// Ordering intent: IDLE → STALE → SETTLING → BUILDING.
const SERVER_STATES = Object.freeze({
	IDLE: "idle", // No pending requests, no recent changes, no unvalidated caches.
	STALE: "stale", // Pending changes / pending requests, queue not yet flushed.
	SETTLING: "settling", // Rebuild pending, deferred until changes quiesce. No build is active
	// (#activeBuild === null); the deferred timer moves it to BUILDING.
	BUILDING: "building", // A build is in flight.
	VALIDATING: "validating", // A background cache-validation pass is in flight.
	ERROR: "error", // Last build cycle failed.
});

class AbortBuildError extends Error {
	constructor(message) {
		super(message);
		this.name = "AbortBuildError";
	}
};

/**
 * Development server that provides access to built project resources with automatic rebuilding
 *
 * BuildServer watches project sources for changes and automatically rebuilds affected projects
 * on-demand. It provides readers for accessing built resources and emits events for build
 * completion and source changes.
 *
 * The server maintains separate readers for:
 * - All projects (root + dependencies)
 * - Root project only
 * - Dependencies only
 *
 * Projects are built lazily when their resources are first requested, and rebuilt automatically
 * when source files change.
 *
 * @class
 * @extends EventEmitter
 * @fires BuildServer#buildFinished
 * @fires BuildServer#sourcesChanged
 * @fires BuildServer#error
 */
class BuildServer extends EventEmitter {
	#graph;
	#projectBuilder;
	#watchHandler;
	#rootProjectName;
	#resourceChangeQueue = new Map();
	#projectBuildStatus = new Map();
	#pendingBuildRequest = new Set();
	#activeBuild = null;
	#processBuildRequestsTimeout;
	// True while a source-change-aborted build waits out its settle window before restarting.
	// A further source change during the window reschedules the restart (resetting the timer)
	// instead of leaving the fired-once restart to race the still-arriving burst.
	#pendingDeferredRestart = false;
	#sourcesChangedTimeout;
	// True while a final `sourcesChanged` emit is owed. The event drives live-reload: the first
	// change in a quiet period emits it immediately (leading edge); a change arriving inside the
	// settle window instead sets this flag, so the changes coalesced during the window are reported
	// by one final emit when the timer fires. Cleared when that emit fires or the server is destroyed.
	#pendingFinalSourcesChanged = false;
	#destroyed = false;
	#allReader;
	#rootReader;
	#dependenciesReader;
	#serveLogger = new ServeLogger("build:BuildServer");
	// Server lifecycle state. Starts as `null` so the first #setState call
	// always emits the initial state.
	#serverState = null;
	// Background cache validation state. `#activeValidation` is the promise of the
	// currently running validation pass (or null when idle); `#validationAbort`
	// is its controller, used to preempt validation when a real build is requested.
	#activeValidation = null;
	#validationAbort = null;
	// Watcher recovery state. `#recoveringWatcher` guards against re-entrant recovery while a
	// recovery pass is in flight (a dropped-events fault emits one error per subscribed path
	// in a synchronous burst). `#watcherRecoveryTimestamps` holds the completion times of
	// recent recoveries for the loop-protection window.
	#recoveringWatcher = false;
	#watcherRecoveryTimestamps = [];

	/**
	 * Creates a new BuildServer instance
	 *
	 * Initializes readers for different project combinations. File watching and any initial
	 * builds are set up separately via {@link BuildServer.create}, which awaits watcher
	 * readiness before enqueueing initial builds and returning.
	 *
	 * @private
	 * @param {@ui5/project/graph/ProjectGraph} graph Project graph containing all projects
	 * @param {@ui5/project/build/ProjectBuilder} projectBuilder Builder instance for executing builds
	 */
	constructor(graph, projectBuilder) {
		super();
		this.#graph = graph;
		this.#rootProjectName = graph.getRoot().getName();
		this.#projectBuilder = projectBuilder;

		const buildServerInterface = {
			getReaderForProject: this.#getReaderForProject.bind(this),
			getReaderForProjects: this.#getReaderForProjects.bind(this),
			getCachedReadersForProjects: this.#getCachedReadersForProjects.bind(this),
		};

		this.#allReader = new BuildReader(
			"Build Server: All Projects Reader", Array.from(this.#graph.getProjects()), buildServerInterface);

		const rootProject = this.#graph.getRoot();
		this.#rootReader = new BuildReader("Build Server: Root Project Reader", [rootProject], buildServerInterface);

		const dependencies = graph.getTransitiveDependencies(rootProject.getName()).map((dep) => graph.getProject(dep));
		this.#dependenciesReader = new BuildReader(
			"Build Server: Dependencies Reader", dependencies, buildServerInterface);

		// Initialize cache states
		this.#projectBuildStatus.set(
			this.#rootProjectName, new ProjectBuildStatus(() => this.#enqueueBuild(this.#rootProjectName)));

		for (const dep of dependencies) {
			const depName = dep.getName();
			this.#projectBuildStatus.set(depName, new ProjectBuildStatus(() => this.#enqueueBuild(depName)));
		}
	}

	/**
	 * Creates a BuildServer and waits for its file watcher to be ready before resolving.
	 *
	 * Awaiting watcher readiness avoids a race where source changes made immediately after
	 * <code>graph.serve()</code> resolves would be missed. The race is most pronounced on
	 * Windows, where the <code>ReadDirectoryChangesW</code> backend has noticeably
	 * higher startup latency than FSEvents/inotify.
	 *
	 * Initial builds are enqueued only after the watcher is ready, so any source changes
	 * occurring during those builds are reliably detected.
	 *
	 * @public
	 * @param {@ui5/project/graph/ProjectGraph} graph Project graph containing all projects
	 * @param {@ui5/project/build/ProjectBuilder} projectBuilder Builder instance for executing builds
	 * @param {boolean} initialBuildRootProject Whether to build the root project in the initial build
	 * @param {string[]} initialBuildIncludedDependencies Project names to include in initial build
	 * @param {string[]} initialBuildExcludedDependencies Project names to exclude from initial build
	 * @returns {Promise<BuildServer>} Resolves once the watcher is ready
	 */
	static async create(
		graph, projectBuilder,
		initialBuildRootProject, initialBuildIncludedDependencies, initialBuildExcludedDependencies
	) {
		const buildServer = new BuildServer(graph, projectBuilder);
		await buildServer.#initWatcher();
		buildServer.#enqueueInitialBuilds(
			initialBuildRootProject, initialBuildIncludedDependencies, initialBuildExcludedDependencies
		);
		return buildServer;
	}

	#enqueueInitialBuilds(
		initialBuildRootProject, initialBuildIncludedDependencies, initialBuildExcludedDependencies
	) {
		if (initialBuildRootProject) {
			log.verbose("Enqueueing root project for initial build");
			this.#enqueueBuild(this.#rootProjectName);
		}
		if (initialBuildIncludedDependencies.length > 0) {
			for (const projectName of initialBuildIncludedDependencies) {
				if (!initialBuildExcludedDependencies.includes(projectName)) {
					log.verbose(`Enqueueing project '${projectName}' for initial build`);
					this.#enqueueBuild(projectName);
				}
			}
		}
		if (this.#pendingBuildRequest.size === 0) {
			// No initial build was requested. Signal "idle" / "ready" right away.
			this.#setState(SERVER_STATES.IDLE);
		}
	}

	async #initWatcher() {
		const watchHandler = new WatchHandler();
		this.#watchHandler = watchHandler;
		this.#wireWatchHandler(watchHandler);
		await watchHandler.watch(this.#graph.getProjects());
	}

	/**
	 * Wires the change and error listeners onto a WatchHandler instance. Shared by the
	 * initial setup and the recovery path so both attach identical handlers.
	 *
	 * @param {WatchHandler} watchHandler Handler to wire listeners onto
	 */
	#wireWatchHandler(watchHandler) {
		watchHandler.on("error", (err) => {
			this.#recoverWatcher(err);
		});
		watchHandler.on("change", (eventType, resourcePath, project) => {
			log.verbose(`Source change detected: ${eventType} ${resourcePath} in project '${project.getName()}'`);
			this._projectResourceChanged(project, resourcePath, ["create", "delete"].includes(eventType));
		});
	}

	/**
	 * Recovers from a WatchHandler error by recreating the watch subscriptions and forcing a
	 * full source re-scan of every project.
	 *
	 * The incremental build cache derives "what changed" solely from discrete watcher events
	 * (see {@link #_projectResourceChanged} → {@link ProjectBuilder#resourcesChanged}). When
	 * the watcher errors — most notably when the OS reports that FS events were dropped and
	 * the file system must be re-scanned — that signal is unreliable: some source changes
	 * were never reported, so cached build results may be stale. Rather than wedging the
	 * server in ERROR (the prior behavior, from which the only exit was a further watcher
	 * event that may never arrive), recreate the watcher and re-scan.
	 *
	 * A successful recovery does not emit the fatal <code>error</code> event; it is reserved
	 * for the terminal fallback when recovery itself fails or loops.
	 *
	 * @param {Error} err The error emitted by the WatchHandler
	 */
	async #recoverWatcher(err) {
		// Collapse the error storm (parcel emits one error per subscribed path synchronously)
		// into a single recovery, and stay out of the way of a server that is shutting down.
		// Set synchronously before the first await so re-entrant emissions bail here.
		if (this.#destroyed || this.#recoveringWatcher) {
			return;
		}
		this.#recoveringWatcher = true;
		log.warn(`File watcher error, attempting to recover: ${err?.message ?? err}`);
		if (err?.stack) {
			log.verbose(err.stack);
		}

		// Loop protection: a persistently failing watcher would otherwise cycle forever, since
		// dropped-events faults arrive via the subscription callback (not a watch() rejection)
		// and so never trip the reject-based fallback below.
		const now = Date.now();
		this.#watcherRecoveryTimestamps = this.#watcherRecoveryTimestamps
			.filter((ts) => now - ts < WATCHER_RECOVERY_WINDOW_MS);
		if (this.#watcherRecoveryTimestamps.length >= WATCHER_RECOVERY_MAX_ATTEMPTS) {
			this.#recoveringWatcher = false;
			log.error(`File watcher failed to recover after ${WATCHER_RECOVERY_MAX_ATTEMPTS} attempts ` +
				`within ${WATCHER_RECOVERY_WINDOW_MS} ms. Giving up.`);
			this.#setState(SERVER_STATES.ERROR, {error: err});
			this.emit("error", err);
			return;
		}

		try {
			// Quiesce in-flight work so ProjectBuilder.forceFullRescan() can claim the builder.
			// #buildIsRunning only clears in the builder's finally after cache writes, so the
			// active build must be awaited to completion — not merely aborted — before the
			// re-scan. The build promise swallows abort errors, so this resolves cleanly.
			await this.#stopActiveValidation("Watcher recovery");
			if (this.#activeBuild) {
				try {
					await this.#activeBuild;
				} catch (buildErr) {
					log.verbose(`Active build settled during watcher recovery: ${buildErr?.message ?? buildErr}`);
				}
			}
			if (this.#destroyed) {
				return;
			}

			// Recreate the watcher. The old handler's listeners stay attached on purpose: a
			// teardown "error" (from a failed unsubscribe) then re-enters #recoverWatcher, which
			// bails on the #recoveringWatcher guard set above. Removing the listeners instead
			// would let destroy()'s emit("error") throw, since Node's EventEmitter throws when
			// "error" has no listener.
			const oldHandler = this.#watchHandler;
			await oldHandler.destroy();

			const watchHandler = new WatchHandler();
			this.#watchHandler = watchHandler;
			this.#wireWatchHandler(watchHandler);
			// Subscribe before the re-scan: a change during the teardown window is then caught
			// either by the re-glob below or by the freshly-armed watcher.
			await watchHandler.watch(this.#graph.getProjects());

			// Force the full re-scan. forceFullRescan re-arms each project's source index so the
			// next build re-globs and diffs against the persisted index, and invalidate() drops
			// cached readers (fileAddedOrRemoved) so the rebuild re-reads the tree.
			this.#projectBuilder.forceFullRescan();
			for (const status of this.#projectBuildStatus.values()) {
				status.invalidate({reason: "File watcher recovery", fileAddedOrRemoved: true});
			}

			this.#watcherRecoveryTimestamps.push(Date.now());
			log.info(`File watcher recovered. Re-scanning all project sources.`);

			// Every project is now non-fresh. Surface STALE and prompt connected clients to
			// reload, which drives the lazy rebuild against the re-scanned index.
			this.#setState(SERVER_STATES.STALE, {staleProjects: this.#getStaleProjectNames()});
			this.emit("sourcesChanged");
		} catch (recoveryErr) {
			// Recreation itself failed (e.g. watch() rejected). The watcher is genuinely broken;
			// fall back to the terminal ERROR behavior.
			log.error(`File watcher recovery failed: ${recoveryErr?.message ?? recoveryErr}`);
			this.#setState(SERVER_STATES.ERROR, {error: recoveryErr});
			this.emit("error", recoveryErr);
			return;
		} finally {
			this.#recoveringWatcher = false;
		}
		// Drain reader requests parked before the error (and any suppressed during recovery):
		// invalidate() alone does not enqueue their builds, so without this they would hang
		// until a brand-new request arrives.
		this.#triggerRequestQueue();
	}


	async destroy() {
		this.#destroyed = true;
		clearTimeout(this.#processBuildRequestsTimeout);
		this.#pendingDeferredRestart = false;
		clearTimeout(this.#sourcesChangedTimeout);
		this.#pendingFinalSourcesChanged = false;
		await this.#watchHandler.destroy();
		try {
			// Cancel any running background validation pass and wait for it to settle.
			await this.#stopActiveValidation("Server destroyed");
			if (this.#activeBuild) {
				// Await active build to finish
				await this.#activeBuild;
			}
		} finally {
			// Always release the cache manager, even when the active build rejected
			// (e.g. Force-mode stale-cache errors). Otherwise the SQLite handle leaks
			// and subsequent fs.rm of the cache directory fails with EBUSY on Windows.
			this.#projectBuilder.closeCacheManager();
		}
	}

	/**
	 * Gets a reader for all projects (root and dependencies)
	 *
	 * Returns a reader that provides access to built resources from all projects in the graph.
	 * Projects are built on-demand when their resources are requested.
	 *
	 * @public
	 * @returns {BuildReader} Reader for all projects
	 */
	getReader() {
		return this.#allReader;
	}

	/**
	 * Gets a reader for the root project only
	 *
	 * Returns a reader that provides access to built resources from only the root project,
	 * excluding all dependencies. The root project is built on-demand when its resources
	 * are requested.
	 *
	 * @public
	 * @returns {BuildReader} Reader for root project
	 */
	getRootReader() {
		return this.#rootReader;
	}

	/**
	 * Gets a reader for dependencies only (excluding root project)
	 *
	 * Returns a reader that provides access to built resources from all transitive
	 * dependencies of the root project. Dependencies are built on-demand when their
	 * resources are requested.
	 *
	 * @public
	 * @returns {BuildReader} Reader for all dependencies
	 */
	getDependenciesReader() {
		return this.#dependenciesReader;
	}

	/**
	 * Gets a reader for a single project, building it if necessary
	 *
	 * Checks if the project has already been built and returns its reader from cache.
	 * If not built, enqueues the project for building and returns a promise that
	 * resolves when the reader is available.
	 *
	 * @param {string} projectName Name of the project to get reader for
	 * @returns {Promise<@ui5/fs/AbstractReader>} Reader for the built project
	 */
	async #getReaderForProject(projectName) {
		if (!this.#projectBuildStatus.has(projectName)) {
			throw new Error(`Project '${projectName}' not found in project graph`);
		}
		const projectBuildStatus = this.#projectBuildStatus.get(projectName);

		// When cache=Off, always rebuild - don't use in-memory cached readers
		if (projectBuildStatus.isFresh()) {
			return projectBuildStatus.getReader();
		}

		// Last build failed and nothing has changed since. Rebuilding would re-produce the same
		// error (builds are deterministic), so short-circuit with the captured error. The gate
		// lifts as soon as a source change in this project or one of its (transitive) dependencies
		// invalidates the status via #_projectResourceChanged.
		const lastError = projectBuildStatus.getError();
		if (lastError) {
			throw lastError;
		}

		const {promise, resolve, reject} = Promise.withResolvers();
		// Always queue the request on the status. It owns the "who resolves this"
		// contract: a running validation pass drains its own queue via setReader
		// on cache hit and via releaseValidating (which re-enqueues a build when
		// the queue is non-empty) on cache miss. Callers uniformly enqueue and
		// forget.
		projectBuildStatus.addReaderRequest({resolve, reject});

		if (!projectBuildStatus.isValidating()) {
			log.verbose(`Reader for project '${projectName}' is not fresh. Enqueuing build request.`);
			this.#enqueueBuild(projectName);
		} else {
			log.verbose(`Reader for project '${projectName}' is validating. ` +
				`Waiting on validation pass.`);
		}
		return promise;
	}

	/**
	 * Gets a combined reader for multiple projects, building them if necessary
	 *
	 * Enqueues all projects that need to be built and waits for all of them to complete.
	 * Returns a prioritized collection reader combining all requested projects.
	 *
	 * @param {string[]} projectNames Array of project names to get readers for
	 * @returns {Promise<@ui5/fs/ReaderCollection>} Combined reader for all requested projects
	 */
	async #getReaderForProjects(projectNames) {
		if (projectNames.length === 1) {
			return await this.#getReaderForProject(projectNames[0]);
		}
		const readers = await Promise.all(projectNames.map((projectName) => this.#getReaderForProject(projectName)));
		return createReaderCollectionPrioritized({
			name: `Build Server: Reader for projects: ${projectNames.join(", ")}`,
			readers
		});
	}

	#getCachedReadersForProjects(projectNames) {
		const readers = [];
		for (const projectName of projectNames) {
			const projectBuildStatus = this.#projectBuildStatus.get(projectName);
			const reader = projectBuildStatus.getReader();
			if (reader) {
				readers.push(reader);
			}
		}
		if (!readers.length) {
			return;
		}

		return createReaderCollectionPrioritized({
			name: `Build Server: Cached readers for projects: ${projectNames.join(", ")}`,
			readers
		});
	}

	/**
	 * Several projects might be affected by the source file change.
	 * However, at this time we can't tell for sure which ones:
	 * Only the project builder can determine the affected projects for a given (set of) source file changes.
	 * This check is only possible while no build is running, and is therefore only done in the batched change handler.
	 *
	 * Assuming that the change in source files might corrupt a currently running (or about to be started) build,
	 * we abort all active builds affecting the changed project or any of its dependents.
	 *
	 * @param {@ui5/project/specifications/Project} project Project where the resource change occurred
	 * @param {string} filePath Path of the affected file
	 * @param {boolean} fileAddedOrRemoved Whether a file was added or removed
	 */
	_projectResourceChanged(project, filePath, fileAddedOrRemoved) {
		// First, invalidate all potentially affected projects (which also aborts any running builds)
		for (const {project: affectedProject} of this.#graph.traverseDependents(project.getName(), true)) {
			const projectBuildStatus = this.#projectBuildStatus.get(affectedProject.getName());
			projectBuildStatus.invalidate({
				reason: `Source change in project '${project.getName()}'`,
				fileAddedOrRemoved,
			});
		}

		// Lift ERRORED gates on the changed project's transitive dependencies too.
		// #getReaderForProject short-circuits ERRORED projects with the captured error,
		// so a request for e.g. library.a would keep returning HTTP 500 until library.a
		// itself sees a file change — even after every dependent has rebuilt cleanly.
		// The change here isn't proof that the dependency's inputs shifted, but it IS
		// user activity: retry with a real build instead of replaying the old error.
		// Kept narrow (transitive deps only, not the whole graph): a change on an
		// unrelated sibling project shouldn't clear a genuinely-failing dep either.
		// The broader lift lives in #clearErroredGatesAfterSuccessfulBuild, invoked
		// when a build cycle completes successfully.
		for (const depName of this.#graph.getTransitiveDependencies(project.getName())) {
			const depStatus = this.#projectBuildStatus.get(depName);
			if (depStatus?.clearError()) {
				log.verbose(`Lifted ERRORED gate on dependency '${depName}' ` +
					`after source change in dependent project '${project.getName()}'`);
			}
		}

		// Enqueue resource change for processing before next build
		const queuedChanges = this.#resourceChangeQueue.get(project.getName());
		if (queuedChanges) {
			queuedChanges.add(filePath);
		} else {
			this.#resourceChangeQueue.set(project.getName(), new Set([filePath]));
		}

		// Surface the new STALE state right away from any "quiet" state.
		// IDLE and ERROR are both quiet — ERROR is sticky, but a change lifts it because
		// the input tree has moved and the previous failure isn't the final word anymore.
		// VALIDATING is quiet in the same sense: the change is already registered here, so
		// reporting VALIDATING any longer would mislead consumers. The validation pass's
		// finally clause guards on `#serverState === VALIDATING` and bails when the state
		// has moved on, so there's no double-transition risk.
		// BUILDING already implies progress, so don't disturb it.
		if (this.#serverState === SERVER_STATES.IDLE ||
			this.#serverState === SERVER_STATES.VALIDATING ||
			this.#serverState === SERVER_STATES.ERROR) {
			this.#setState(SERVER_STATES.STALE);
		}

		// Reschedule a pending post-abort/transient restart so its settle window measures quiet
		// from this change, not from the abort. Only fires while a restart is waiting (no active
		// build); the state is already SETTLING and stays there. #triggerRequestQueue clears the
		// armed timer and re-arms it at the settle delay.
		if (this.#pendingDeferredRestart) {
			this.#triggerRequestQueue(ABORTED_BUILD_RESTART_SETTLE_MS);
		}

		// Leading-edge emit with a trailing settle window. The first change of a quiet period
		// notifies immediately (a lone edit reaches clients at the watcher's own latency floor);
		// further changes within the window only push the trailing emit out, so a burst collapses
		// into one leading + one trailing notification.
		if (this.#sourcesChangedTimeout) {
			clearTimeout(this.#sourcesChangedTimeout);
			this.#pendingFinalSourcesChanged = true;
		} else {
			this.emit("sourcesChanged");
		}
		this.#sourcesChangedTimeout = setTimeout(() => {
			this.#sourcesChangedTimeout = null;
			if (this.#pendingFinalSourcesChanged) {
				this.#pendingFinalSourcesChanged = false;
				this.emit("sourcesChanged");
			}
		}, SOURCES_CHANGED_SETTLE_MS);
	}

	#flushResourceChanges() {
		if (this.#resourceChangeQueue.size === 0) {
			return;
		}
		const changes = this.#resourceChangeQueue;
		this.#resourceChangeQueue = new Map();

		// Inform project builder
		// This is essential so that the project builder can determine changed resources as it does not
		// use file watchers or check for all changed files by itself
		this.#projectBuilder.resourcesChanged(changes);
	}

	/**
	 * Enqueues a project for building and returns a promise that resolves with its reader
	 *
	 * If the project is already queued, returns the existing promise. Otherwise, creates
	 * a new promise, adds the project to the pending build queue, and triggers queue processing.
	 *
	 * @param {string} projectName Name of the project to enqueue
	 */
	#enqueueBuild(projectName) {
		if (this.#pendingBuildRequest.has(projectName)) {
			// Already queued
			return;
		}

		log.verbose(`Enqueuing project '${projectName}' for build`);

		// Add to pending build requests
		this.#pendingBuildRequest.add(projectName);

		this.#triggerRequestQueue();
	}

	#triggerRequestQueue(delay = BUILD_REQUEST_DEBOUNCE_MS) {
		if (this.#destroyed || this.#activeBuild || this.#recoveringWatcher) {
			// While recovering the watcher, suppress builds so ProjectBuilder.forceFullRescan()
			// can claim the builder without racing a build the abort/re-queue path may start.
			// #recoverWatcher re-triggers the queue once recovery completes.
			return;
		}
		// If no build is active, trigger queue processing debounced
		if (this.#processBuildRequestsTimeout) {
			clearTimeout(this.#processBuildRequestsTimeout);
		}
		this.#processBuildRequestsTimeout = setTimeout(async () => {
			// The restart (if this was the post-abort one) is now running; further source
			// changes should schedule a fresh restart rather than reset this fired timer.
			this.#pendingDeferredRestart = false;
			// Abort any in-flight background validation pass so the build can claim
			// the builder's "buildIsRunning" lock. Validation will be re-scheduled
			// after the build cycle drains.
			await this.#stopActiveValidation("Build request received");
			if (this.#destroyed || this.#recoveringWatcher) {
				// A watcher recovery claimed the builder during the await above (or is about
				// to). #recoverWatcher re-triggers the queue once it completes.
				return;
			}
			// A concurrent timer may have claimed the build slot during the await
			// above — validation's finally can fire onBuildRequired, which schedules
			// a second timer. Bail so we don't call projectBuilder.build twice; the
			// active build's #reconcileServerState hook drains #pendingBuildRequest.
			if (this.#activeBuild) {
				return;
			}
			const cycleStart = process.hrtime();
			this.#setState(SERVER_STATES.BUILDING);
			this.#processBuildRequests().then(() => {
				const hrtime = process.hrtime(cycleStart);
				// #processBuildRequests captures individual build failures on the
				// server state and continues the queue, so it resolves normally
				// even when the build errored. #reconcileServerState's first check
				// bails on state === ERROR, so the post-build validation pass is
				// skipped without needing a second guard in #scheduleBackgroundValidation.
				this.#reconcileServerState({hrtime, mayValidate: true});
			}).catch((err) => {
				// Reached only for unexpected failures outside the per-build catch inside
				// #processBuildRequests (which handles task errors itself). Surface via
				// ServeLogger; keep the server alive.
				this.#setState(SERVER_STATES.ERROR, {error: err});
			});
		}, delay);
	}

	/**
	 * Processes the build queue by batching pending projects and building them
	 *
	 * Runs while there are pending build requests. Collects all pending projects,
	 * builds them in a single batch, resolves/rejects promises for built projects,
	 * and handles errors with proper isolation.
	 *
	 * @returns {Promise<void>} Promise that resolves when queue processing is complete
	 */
	async #processBuildRequests() {
		// Process queue while there are pending requests
		while (this.#pendingBuildRequest.size > 0) {
			// Each iteration is a fresh build attempt — ensure the state machine
			// reflects that even on re-entries after a transient failure or a
			// normal error whose queue survived. #setState is a no-op when
			// already BUILDING, so the initial-entry case (state was set by
			// #triggerRequestQueue) is unaffected.
			this.#setState(SERVER_STATES.BUILDING);
			// Collect all pending projects for this batch
			const projectsToBuild = Array.from(this.#pendingBuildRequest);
			let buildRootProject = false;
			let dependenciesToBuild;
			const rootProjectIdx = projectsToBuild.indexOf(this.#rootProjectName);
			if (rootProjectIdx !== -1) {
				buildRootProject = true;
				dependenciesToBuild = projectsToBuild.toSpliced(rootProjectIdx, 1);
			} else {
				dependenciesToBuild = projectsToBuild;
			}
			this.#pendingBuildRequest.clear();

			log.verbose(`Building projects: ${projectsToBuild.join(", ")}`);
			const abortSignals = projectsToBuild.map((projectName) => {
				const status = this.#projectBuildStatus.get(projectName);
				status.markBuilding();
				return status.getAbortSignal();
			});
			const signal = AbortSignal.any(abortSignals);

			// Process any queued resource changes (must be done before starting the build)
			this.#flushResourceChanges();

			// Set active build to prevent concurrent builds
			let buildError = null;
			let transientFailure = false;
			const buildPromise = this.#activeBuild = this.#projectBuilder.build({
				includeRootProject: buildRootProject,
				includedDependencies: dependenciesToBuild,
				signal,
			}, (projectName, project) => {
				// Project has been built and result can be used.
				const projectBuildStatus = this.#projectBuildStatus.get(projectName);
				projectBuildStatus.setReader(project.getReader({style: "runtime"}));
			}).catch((err) => {
				if (isAbortError(err)) {
					log.info("Build aborted");
					log.verbose(`Projects affected by abort: ${projectsToBuild.join(", ")}`);
					// Build was aborted - do not log as error
					// Re-queue any outstanding projects
					for (const projectName of projectsToBuild) {
						const projectBuildStatus = this.#projectBuildStatus.get(projectName);
						if (!projectBuildStatus.isFresh()) {
							log.verbose(`Re-enqueueing project '${projectName}' after aborted build`);
							this.#pendingBuildRequest.add(projectName);
						}
					}
				} else if (signal.aborted || this.#resourceChangeQueue.size > 0) {
					// Task threw while sources were changing (e.g. mid-`git checkout`). The build
					// state is untrustworthy but the error itself is very likely spurious — a fresh
					// build against the settled tree will typically succeed. Re-queue affected
					// projects and leave the reader-request queue intact so held requests resolve on
					// the retry, then route through the same defer-and-report path as an abort (see
					// below): the doomed build must not park the server on `building`/`error`; it
					// reports SETTLING and retries once the tree is quiet.
					log.warn(
						`Build failed during concurrent source change — treating as transient: ${err.message}`);
					transientFailure = true;
					for (const projectName of projectsToBuild) {
						const projectBuildStatus = this.#projectBuildStatus.get(projectName);
						if (!projectBuildStatus.isFresh()) {
							this.#pendingBuildRequest.add(projectName);
						}
					}
				} else {
					log.error(`Build failed: ${err.message}`);
					if (err?.stack) {
						log.verbose(err.stack);
					}
					// Build failed - reject promises for projects that weren't built
					for (const projectName of projectsToBuild) {
						const projectBuildStatus = this.#projectBuildStatus.get(projectName);
						projectBuildStatus.rejectReaderRequests(err);
					}
					// Capture the error so the outer loop can surface it via ServeLogger without
					// re-throwing, keeping the queue alive so future requests re-enqueue builds
					// via #getReaderForProject.
					buildError = err;
				}
			});

			let builtProjects;
			try {
				builtProjects = await buildPromise;
			} finally {
				// Always clear the active build, even on error, so that future requests can enqueue new builds.
				this.#activeBuild = null;
			}
			if (buildError) {
				this.#setState(SERVER_STATES.ERROR, {error: buildError});
				// Surfaced via ServeLogger.serveError from #setState. The "error" event
				// stays reserved for fatal, non-recoverable failures (e.g. watcher crash);
				// build errors keep the server alive so the user can fix the source and
				// trigger a rebuild.
				// Continue processing any remaining pending requests for unaffected projects.
				continue;
			}
			this.emit("buildFinished", builtProjects);
			if (signal.aborted || transientFailure) {
				log.verbose(`Build ${signal.aborted ? "aborted" : "failed transiently"} ` +
					`for projects: ${projectsToBuild.join(", ")}`);
				// A source change aborted this build, or the build failed while sources were still
				// A source change aborted this build, or the build failed while sources were still
				// changing. Re-trigger processing so the re-queued projects rebuild — but hold the
				// restart until changes settle rather than restarting on the short request debounce.
				// A burst (git checkout, save-all) arrives as watcher batches up to MAX_WAIT_TIME
				// apart; restarting between batches would spawn a build per batch, each aborted by
				// the next. The settle delay collapses the burst into a single rebuild against the
				// settled tree. Each further source change reschedules this restart (see
				// #_projectResourceChanged), so the window measures quiet from the last change.
				//
				// Report SETTLING for the duration of the window: the server is waiting for changes
				// to quiesce before rebuilding, so leaving the banner on `building` (abort) or
				// flipping it to `error` (transient failure) would misdescribe what's happening.
				this.#pendingDeferredRestart = true;
				this.#setState(SERVER_STATES.SETTLING, {pendingProjects: this.#getStaleProjectNames()});
				this.#triggerRequestQueue(ABORTED_BUILD_RESTART_SETTLE_MS);
				return;
			}
			// A successful build cycle proves the environment can build. Lift ERRORED gates on any
			// *other* project (the graph-local case is handled in _projectResourceChanged; this
			// broadens it to unrelated projects a dependent-change never reaches). The next reader
			// request for such a project re-enqueues a real build instead of replaying its captured
			// error indefinitely.
			this.#clearErroredGatesAfterSuccessfulBuild(projectsToBuild);
		}
	}

	/**
	 * Sweep all project statuses and lift any lingering ERRORED gates that a
	 * successful build cycle has effectively refuted. The freshly-built projects
	 * themselves are FRESH at this point (or, if invalidated mid-cycle, back to
	 * INVALIDATED via setReader's short-circuit) — they can't be ERRORED, so the
	 * sweep is a no-op for them.
	 *
	 * @param {string[]} justBuiltProjects Names of projects the completed cycle
	 *   built. Logged for the verbose trace; not otherwise consulted.
	 */
	#clearErroredGatesAfterSuccessfulBuild(justBuiltProjects) {
		for (const [name, status] of this.#projectBuildStatus) {
			if (status.clearError()) {
				log.verbose(`Lifted ERRORED gate on '${name}' after successful build of ` +
					`${justBuiltProjects.join(", ")}`);
			}
		}
	}

	#getStaleProjectNames() {
		// "Stale" here means "needs a rebuild if requested" — invalidated projects
		// that the next request will re-enqueue. Errored projects are NOT stale in
		// that sense: their rebuild is gated until the input changes, so surfacing
		// them as stale would understate the situation (the user needs to fix the
		// error, not just wait for the next request).
		const stale = [];
		for (const [name, status] of this.#projectBuildStatus) {
			if (!status.isFresh() && !status.getError()) {
				stale.push(name);
			}
		}
		return stale;
	}

	/**
	 * Aborts the in-flight background validation pass (if any) and awaits its settlement.
	 * Swallows the resulting abort rejection — callers use this to make room for a build
	 * or to drain on destroy, neither of which surfaces validation errors.
	 *
	 * @param {string} reason Reason forwarded to AbortBuildError for verbose logging.
	 */
	async #stopActiveValidation(reason) {
		if (!this.#activeValidation) {
			return;
		}
		this.#validationAbort?.abort(new AbortBuildError(reason));
		try {
			await this.#activeValidation;
		} catch (err) {
			// Expected — validation rejects with an AbortBuildError on cancellation.
			log.verbose(`Background validation settled (${reason}): ${err?.message ?? err}`);
		}
	}

	/**
	 * Single point of truth for the terminal state at the end of a producer cycle
	 * (build cycle, background validation pass). Each producer that used to open-code
	 * an IDLE-vs-STALE-vs-VALIDATING guard now calls this after its own work settles;
	 * the reconciler picks the target state from the current fields — <code>#activeBuild</code>,
	 * <code>#pendingBuildRequest</code>, <code>#serverState</code>, the stale set — rather
	 * than trusting each producer to check them.
	 *
	 * Bails when another actor already owns the next transition:
	 *
	 * - <code>#destroyed</code> — server shutting down; state is irrelevant.
	 * - <code>#serverState === ERROR</code> — a producer already settled us on ERROR;
	 *   don't paint over it with a successful cycle close.
	 * - <code>#serverState === SETTLING</code> — a deferred restart is armed; the timer owns
	 *   the SETTLING → BUILDING transition. Every SETTLING entry leaves
	 *   <code>#pendingBuildRequest</code> non-empty (so the check below already bails), but the
	 *   explicit guard keeps a stray reconcile from flipping SETTLING to IDLE/STALE should that
	 *   invariant ever break.
	 * - <code>#activeBuild || #pendingBuildRequest.size > 0</code> — a build cycle owns
	 *   the next transition. Notably fires when this call comes from the post-validation
	 *   finally and <code>releaseValidating</code>'s <code>onBuildRequired</code> callback
	 *   just enqueued a build for a project with pending readers.
	 *
	 * Otherwise: fully-fresh → IDLE. Any stale projects → try
	 * {@link #scheduleBackgroundValidation} when <code>mayValidate</code> is true and
	 * fall back to STALE. When called from the post-validation finally
	 * (<code>mayValidate=false</code>), goes straight to STALE — the pass just settled
	 * on those projects, so re-scheduling would be pointless and would recurse this
	 * finally into a new pass.
	 *
	 * @param {object} [opts]
	 * @param {Array<number>} [opts.hrtime] Build duration to forward to
	 *   {@link #setState}. Only the post-build path supplies this.
	 * @param {boolean} [opts.mayValidate=false] Whether the reconciler is allowed to
	 *   schedule a background validation pass. Post-build → true, post-validation → false.
	 */
	#reconcileServerState({hrtime, mayValidate = false} = {}) {
		if (this.#destroyed || this.#serverState === SERVER_STATES.ERROR ||
				this.#serverState === SERVER_STATES.SETTLING) {
			return;
		}
		if (this.#activeBuild || this.#pendingBuildRequest.size > 0) {
			// Another producer (a build cycle) owns the next transition.
			return;
		}
		const staleProjects = this.#getStaleProjectNames();
		log.verbose(`Reconciling server state. Stale projects: ` +
			`${staleProjects.length} (${staleProjects.join(", ")})`);
		if (staleProjects.length === 0) {
			this.#setState(SERVER_STATES.IDLE, {hrtime});
			return;
		}
		// Some projects are still non-FRESH. Try to validate any that are merely
		// INITIAL (cache validity unknown but possibly fresh) in the background.
		// If a pass actually starts, the transition to VALIDATING happens inside
		// #scheduleBackgroundValidation; otherwise we fall back to STALE.
		if (mayValidate && this.#scheduleBackgroundValidation({hrtime})) {
			return;
		}
		this.#setState(SERVER_STATES.STALE, {hrtime, staleProjects});
	}

	/**
	 * Kick off a background cache-validation pass for projects that have never been built or
	 * validated yet. Runs as a fire-and-forget promise; the result is tracked on
	 * <code>#activeValidation</code> so {@link #triggerRequestQueue} and {@link #destroy} can
	 * abort it.
	 *
	 * Drives the server lifecycle through VALIDATING → IDLE/STALE on completion. Caller
	 * supplies the post-build hrtime so the BUILDING → VALIDATING transition can emit a
	 * <code>buildDone</code> event with the correct duration.
	 *
	 * Idempotent while a validation pass is already in flight. Skipped while a build is
	 * active — the post-build cycle-end hook will schedule the next pass.
	 *
	 * @param {object} [opts]
	 * @param {Array<number>} [opts.hrtime] Build hrtime to forward to the VALIDATING state
	 *   transition. Only relevant when called from a post-build cycle-end hook.
	 * @returns {boolean} True if a validation pass was actually scheduled, false otherwise.
	 *   When false, callers may want to transition the server to STALE explicitly.
	 */
	#scheduleBackgroundValidation({hrtime} = {}) {
		if (this.#destroyed || this.#activeValidation || this.#activeBuild || this.#recoveringWatcher) {
			// While recovering the watcher, a validation pass would claim the builder's
			// buildIsRunning lock and make forceFullRescan() throw. Recovery re-triggers the
			// queue on completion, which drives the next validation/build.
			return false;
		}
		const projectsToValidate = [];
		const projectAbortSignals = [];
		for (const [name, status] of this.#projectBuildStatus) {
			if (status.isInitial()) {
				projectsToValidate.push(name);
				// Capture the per-project abort signal now, before any invalidate() rotates it.
				// A source change for any of these projects fires invalidate(), which aborts the
				// signal and cancels the in-flight validation pass via the composite signal below.
				projectAbortSignals.push(status.getAbortSignal());
			}
		}
		if (projectsToValidate.length === 0) {
			return false;
		}
		log.verbose(`Scheduling background cache validation for projects: ${projectsToValidate.join(", ")}`);
		this.#setState(SERVER_STATES.VALIDATING, {hrtime, validatingProjects: projectsToValidate});
		this.#validationAbort = new AbortController();
		const signal = AbortSignal.any([this.#validationAbort.signal, ...projectAbortSignals]);
		this.#activeValidation = this.#runBackgroundValidation(projectsToValidate, signal)
			.catch((err) => {
				if (isAbortError(err)) {
					log.verbose(`Background cache validation aborted: ${err?.message ?? err}`);
					return;
				}
				// Non-abort failure: mirror the build error path so consumers (the banner,
				// integration tests, the yargs fail-handler) can react. The ERROR transition
				// here doubles as the signal to the finally clause to skip its post-pass
				// IDLE/STALE transition.
				this.#setState(SERVER_STATES.ERROR, {error: err});
				this.emit("error", err);
			})
			.finally(() => {
				this.#activeValidation = null;
				this.#validationAbort = null;
				// mayValidate=false: a validation pass just finished; it would be pointless
				// (and stack-recursive) to schedule another for the projects it left non-FRESH.
				this.#reconcileServerState({mayValidate: false});
			});
		return true;
	}

	async #runBackgroundValidation(projectNames, signal) {
		try {
			await this.#projectBuilder.validateCaches({
				projects: projectNames,
				signal,
				willValidate: (projectName) => {
					// Claim the project for validation. If the project is no longer INITIAL
					// (invalidated mid-pass, or a build started concurrently), the transition is
					// a no-op and validateCache below will run without claiming the project;
					// the subsequent setReader call sees a non-VALIDATING state and drops.
					const projectBuildStatus = this.#projectBuildStatus.get(projectName);
					projectBuildStatus?.markValidating();
				},
			}, (projectName, project, projectBuildContext, usesCache) => {
				const projectBuildStatus = this.#projectBuildStatus.get(projectName);
				if (!projectBuildStatus) {
					return;
				}
				if (!usesCache) {
					// Cache is stale; leave the project in INITIAL so a future reader request
					// triggers a real build. We don't pre-emptively rebuild dependencies.
					projectBuildStatus.releaseValidating();
					return;
				}
				log.verbose(`Background validation: marking project '${projectName}' as fresh`);
				// setReader is a no-op if state isn't VALIDATING (e.g. invalidated mid-validation
				// or claimed by a build) — the cycle-end logic will re-schedule or rebuild.
				projectBuildStatus.setReader(project.getReader({style: "runtime"}));
			});
		} finally {
			// Whether the pass completed normally, was aborted, or threw, ensure no project
			// is left stuck in VALIDATING — otherwise the next scheduleBackgroundValidation
			// pass (which picks up only INITIAL projects) would skip them and a reader request
			// would still incur the lazy validation cost.
			//
			// Reader requests issued during VALIDATING skip #enqueueBuild (see
			// #getReaderForProject) so the validation pass can run to completion without being
			// aborted by its own queue tick. releaseValidating owns the pick-up-the-slack side
			// of that contract: if the project didn't reach FRESH and callers are still waiting
			// on a reader, it invokes the onBuildRequired callback wired at construction, which
			// enqueues a build. #enqueueBuild is idempotent, so re-enqueueing one already
			// scheduled by the watcher or a concurrent caller is harmless.
			for (const projectName of projectNames) {
				this.#projectBuildStatus.get(projectName)?.releaseValidating();
			}
		}
	}

	/**
	 * Single source of truth for the server lifecycle state. Mutates
	 * <code>#serverState</code> and emits the matching ServeLogger event for the
	 * transition. A no-op when <code>next</code> equals the current state, so a
	 * burst of source changes collapses into one IDLE→STALE emission.
	 *
	 * Transition policy:
	 * <ul>
	 *   <li>BUILDING → IDLE: buildDone(hrtime) then ready()</li>
	 *   <li>BUILDING → STALE: buildDone(hrtime) then stale(names)</li>
	 *   <li>BUILDING → VALIDATING: buildDone(hrtime) then validating(names)</li>
	 *   <li>BUILDING → SETTLING: settling(names) only — no buildDone, since no successful
	 *       cycle closed (mirrors the BUILDING → ERROR carve-out)</li>
	 *   <li>BUILDING → ERROR: serveError(err) only — buildDone is skipped so
	 *       consumers don't see a successful cycle close before the error</li>
	 *   <li>VALIDATING → IDLE/STALE: ready()/stale() — no buildDone (no build happened)</li>
	 *   <li>* → SETTLING: settling(names)</li>
	 *   <li>SETTLING → BUILDING: building()</li>
	 *   <li>any → ERROR: serveError(err)</li>
	 *   <li>* → IDLE/STALE/BUILDING/VALIDATING: ready()/stale()/building()/validating() as appropriate</li>
	 * </ul>
	 *
	 * @param {string} next One of the SERVER_STATES values.
	 * @param {object} [opts]
	 * @param {Array<number>} [opts.hrtime] Build duration as a [seconds, nanoseconds]
	 *     tuple produced by <code>process.hrtime(start)</code>; required when leaving
	 *     BUILDING for IDLE/STALE/VALIDATING.
	 * @param {string[]} [opts.staleProjects] Stale project names; required when transitioning to STALE.
	 * @param {string[]} [opts.pendingProjects] Names of projects awaiting the deferred rebuild;
	 *     used when transitioning to SETTLING. Defaults to the stale project set.
	 * @param {string[]} [opts.validatingProjects] Names of projects undergoing background cache
	 *     validation; required when transitioning to VALIDATING.
	 * @param {Error} [opts.error] Error instance; required when transitioning to ERROR.
	 */
	#setState(next, {hrtime, staleProjects, pendingProjects, validatingProjects, error} = {}) {
		if (this.#serverState === next) {
			return;
		}
		const previous = this.#serverState;
		this.#serverState = next;

		if (previous === SERVER_STATES.BUILDING &&
				next !== SERVER_STATES.ERROR && next !== SERVER_STATES.SETTLING) {
			this.#serveLogger.buildDone(hrtime ?? [0, 0]);
		}

		switch (next) {
		case SERVER_STATES.IDLE:
			this.#serveLogger.ready();
			break;
		case SERVER_STATES.STALE:
			this.#serveLogger.stale(staleProjects ?? this.#getStaleProjectNames());
			break;
		case SERVER_STATES.SETTLING:
			this.#serveLogger.settling(pendingProjects ?? this.#getStaleProjectNames());
			break;
		case SERVER_STATES.BUILDING:
			this.#serveLogger.building();
			break;
		case SERVER_STATES.VALIDATING:
			this.#serveLogger.validating(validatingProjects ?? []);
			break;
		case SERVER_STATES.ERROR:
			this.#serveLogger.serveError(error);
			break;
		}
	}
}

const PROJECT_STATES = Object.freeze({
	INITIAL: "initial",
	INVALIDATED: "invalidated",
	VALIDATING: "validating",
	BUILDING: "building",
	FRESH: "fresh",
	// Last build failed with a non-transient error. Held in this state until
	// something invalidates the project — either a direct source change or a
	// change in a (transitive) dependency, both of which route through
	// #_projectResourceChanged → invalidate(). This gate prevents deterministic
	// rebuild loops on failing builds: repeat requests reject immediately with
	// the captured error until the input actually changes.
	ERRORED: "errored",
});

class ProjectBuildStatus {
	#state = PROJECT_STATES.INITIAL;
	#readerQueue = [];
	#reader;
	#abortController = new AbortController();
	#onBuildRequired;
	#lastError = null;

	/**
	 * @param {Function} [onBuildRequired] Invoked when the status leaves the VALIDATING
	 *   phase without becoming FRESH while at least one reader request is queued.
	 *   The owning {@link BuildServer} wires this to <code>#enqueueBuild</code> so the
	 *   status alone decides when a follow-up build is required — reader-request
	 *   handling stays a single-owner protocol instead of a three-site coordination.
	 */
	constructor(onBuildRequired) {
		this.#onBuildRequired = onBuildRequired;
	}

	/**
	 * Flip the project to INVALIDATED, aborting any in-flight build.
	 *
	 * @param {object|string} [opts] Either a reason string (legacy shorthand)
	 *   or an options object.
	 * @param {string} [opts.reason="Project invalidated"] Reason passed to the
	 *   AbortBuildError so the build server can distinguish abort causes.
	 * @param {boolean} [opts.fileAddedOrRemoved=false] When true, the cached reader
	 *   is also dropped so a subsequent build re-reads the underlying tree.
	 *   Pure modifications keep the reader so callers waiting on its promise still resolve.
	 */
	invalidate(opts = {}) {
		const {reason = "Project invalidated", fileAddedOrRemoved = false} =
			typeof opts === "string" ? {reason: opts} : opts;
		if (fileAddedOrRemoved) {
			// Always evict the cached reader, even when already invalidated:
			// a stale reader must not survive a file add/remove.
			this.#reader = null;
		}
		// Any invalidation lifts the ERRORED gate — the input changed, so a
		// fresh build has a chance of succeeding even if the previous one
		// failed deterministically.
		this.#lastError = null;
		if (this.#state === PROJECT_STATES.INVALIDATED) {
			return;
		}
		this.#state = PROJECT_STATES.INVALIDATED;
		// Ensure any running build is aborted. Then reset the abort controller
		this.#abortController.abort(new AbortBuildError(reason));
		this.#abortController = new AbortController();
	}

	/**
	 * Marks the project as currently being built. Called at the start of each
	 * build pass for projects in the batch. If a source change invalidates the
	 * project mid-build, the state flips back to INVALIDATED via
	 * <code>invalidate()</code>, which causes <code>setReader()</code> to drop
	 * the late-arriving result.
	 *
	 * Unlike <code>markValidating</code>, this transition is unconditional —
	 * <code>#processBuildRequests</code> always intends to claim the project
	 * regardless of its prior state. The asymmetry is deliberate; the call sites
	 * pull from <code>#pendingBuildRequest</code>, which a FRESH project never
	 * enters (see <code>#getReaderForProject</code>).
	 */
	markBuilding() {
		this.#state = PROJECT_STATES.BUILDING;
	}

	/**
	 * Marks the project as being validated by a background cache-validation pass.
	 * Only takes effect for projects in INITIAL state — projects that have been
	 * invalidated, are already being built, or are FRESH must not be claimed by
	 * a validation pass.
	 *
	 * Used in place of {@link #markBuilding} for the validation flow so the state
	 * accurately reflects that no build work is taking place. <code>setReader()</code>
	 * accepts both VALIDATING and BUILDING as legitimate prior states, so the
	 * validation callback can promote a project to FRESH the same way a real build
	 * does. If a source change invalidates the project mid-validation,
	 * <code>invalidate()</code> flips VALIDATING → INVALIDATED and aborts the
	 * per-project signal so the validation pass cancels.
	 *
	 * @returns {boolean} True if the transition happened, false otherwise.
	 */
	markValidating() {
		if (this.#state !== PROJECT_STATES.INITIAL) {
			return false;
		}
		this.#state = PROJECT_STATES.VALIDATING;
		return true;
	}

	/**
	 * Reverts a VALIDATING project back to INITIAL — used when validation found the
	 * cache to be stale and the project should remain lazy. No-op for the state
	 * transition on any other state (e.g. when invalidate() already moved the
	 * project to INVALIDATED mid-validation, or a build claimed it in the meantime).
	 *
	 * Regardless of the prior state, if the project is not FRESH and reader requests
	 * are still queued, fires the <code>onBuildRequired</code> callback: those callers
	 * skipped enqueueing a build themselves while the pass owned the project, so
	 * releasing without resolving them requires a follow-up build.
	 */
	releaseValidating() {
		if (this.#state === PROJECT_STATES.VALIDATING) {
			this.#state = PROJECT_STATES.INITIAL;
		}
		if (this.#state !== PROJECT_STATES.FRESH && this.#readerQueue.length > 0) {
			this.#onBuildRequired?.();
		}
	}

	abortBuild(reason) {
		this.#abortController.abort(reason);
	}

	getAbortSignal() {
		return this.#abortController.signal;
	}

	isFresh() {
		return this.#state === PROJECT_STATES.FRESH;
	}

	isInitial() {
		return this.#state === PROJECT_STATES.INITIAL;
	}

	isValidating() {
		return this.#state === PROJECT_STATES.VALIDATING;
	}

	/**
	 * Returns the captured error when the project is gated in ERRORED state, else
	 * <code>null</code>. Callers should use this to short-circuit rebuild attempts
	 * when the input hasn't changed since the failure.
	 */
	getError() {
		return this.#state === PROJECT_STATES.ERRORED ? this.#lastError : null;
	}

	/**
	 * Lifts the ERRORED gate without asserting that this project's input tree
	 * changed — used by the {@link BuildServer} when a source change or a
	 * successful build elsewhere in the graph signals that the earlier failure
	 * may have been environmental rather than deterministic. The project drops
	 * back to INVALIDATED so the next reader request re-enqueues a real build.
	 *
	 * No-op unless the project is currently ERRORED. Does not abort any in-flight
	 * build (there can't be one; ERRORED is a terminal cycle-end state) and does
	 * not touch the cached reader (which is always <code>null</code> in ERRORED,
	 * since a failed build never called <code>setReader</code>).
	 *
	 * @returns {boolean} True if the gate was lifted, false if the project was
	 *   not in ERRORED to begin with.
	 */
	clearError() {
		if (this.#state !== PROJECT_STATES.ERRORED) {
			return false;
		}
		this.#lastError = null;
		this.#state = PROJECT_STATES.INVALIDATED;
		return true;
	}

	getReader() {
		return this.#reader;
	}

	setReader(reader) {
		if (this.#state !== PROJECT_STATES.BUILDING && this.#state !== PROJECT_STATES.VALIDATING) {
			// Project was re-invalidated mid-build (or mid-validation); drop the stale reader
			// and let the cycle-end logic re-queue a fresh build.
			return;
		}
		this.#reader = reader;
		this.#state = PROJECT_STATES.FRESH;
		// Resolve any queued getReader promises
		for (const {resolve} of this.#readerQueue) {
			resolve(reader);
		}
		this.#readerQueue = [];
	}

	addReaderRequest(promiseResolvers) {
		this.#readerQueue.push(promiseResolvers);
	}

	rejectReaderRequests(error) {
		// Latch the error and gate future rebuilds on invalidate(). Deterministic
		// builds don't recover without input change, so re-running the same build
		// would just re-produce the same failure.
		this.#state = PROJECT_STATES.ERRORED;
		this.#lastError = error;
		for (const {reject} of this.#readerQueue) {
			reject(error);
		}
		this.#readerQueue = [];
	}
}

/**
 * Build finished event
 *
 * Emitted when one or more projects have finished building.
 *
 * @event BuildServer#buildFinished
 * @param {string[]} projectNames Array of project names that were built
 */

/**
 * Sources changed event
 *
 * Emitted when source files have changed and affected projects have been invalidated.
 *
 * @event BuildServer#sourcesChanged
 * @param {string[]} changedResourcePaths Array of changed resource paths
 */

/**
 * Error event
 *
 * Emitted when an error occurs during watching or building.
 *
 * @event BuildServer#error
 * @param {Error} error The error that occurred
 */


export default BuildServer;

// Export internals for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	BuildServer.__internals__ = {
		SOURCES_CHANGED_SETTLE_MS,
		BUILD_REQUEST_DEBOUNCE_MS,
		ABORTED_BUILD_RESTART_SETTLE_MS
	};
}

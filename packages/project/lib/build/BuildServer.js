import EventEmitter from "node:events";
import {createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";
import BuildReader from "./BuildReader.js";
import WatchHandler from "./helpers/WatchHandler.js";
import {isAbortError} from "./helpers/abort.js";
import {getLogger} from "@ui5/logger";
import ServeLogger from "@ui5/logger/internal/loggers/Serve";
const log = getLogger("build:BuildServer");

// Debounce window for the `sourcesChanged` event so a burst of file changes
// results in a single notification.
const SOURCES_CHANGED_DEBOUNCE_MS = 100;

// The server's lifecycle state. Mutated exclusively through #setState.
const SERVER_STATES = Object.freeze({
	IDLE: "idle", // No pending requests, no recent changes, no unvalidated caches.
	STALE: "stale", // Pending changes / pending requests, queue not yet flushed.
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
	#sourcesChangedTimeout;
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
		this.#projectBuildStatus.set(this.#rootProjectName, new ProjectBuildStatus());

		for (const dep of dependencies) {
			this.#projectBuildStatus.set(dep.getName(), new ProjectBuildStatus());
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
		watchHandler.on("error", (err) => {
			this.#setState(SERVER_STATES.ERROR, {error: err});
			this.emit("error", err);
		});
		watchHandler.on("change", (eventType, resourcePath, project) => {
			log.verbose(`Source change detected: ${eventType} ${resourcePath} in project '${project.getName()}'`);
			this._projectResourceChanged(project, resourcePath, ["create", "delete"].includes(eventType));
		});
		await watchHandler.watch(this.#graph.getProjects());
	}

	async destroy() {
		this.#destroyed = true;
		clearTimeout(this.#processBuildRequestsTimeout);
		clearTimeout(this.#sourcesChangedTimeout);
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
		const {promise, resolve, reject} = Promise.withResolvers();
		projectBuildStatus.addReaderRequest({resolve, reject});

		// Skip the build-request enqueue while a background validation pass owns the
		// project. If validation finds the cache fresh, it resolves the queued reader
		// via setReader; if it finds the cache stale, #runBackgroundValidation enqueues
		// a build for it (since pending reader requests can't wait for the next ad-hoc
		// reader request). Enqueuing here unconditionally would fire #triggerRequestQueue's
		// 10 ms timer, abort the validation pass mid-flight, and cause a needless
		// VALIDATING → BUILDING → VALIDATING flicker even when validation would have
		// served the request itself.
		if (projectBuildStatus.isValidating()) {
			log.verbose(`Reader for project '${projectName}' is validating. ` +
				`Waiting on validation pass.`);
			return promise;
		}

		log.verbose(`Reader for project '${projectName}' is not fresh. Enqueuing build request.`);
		this.#enqueueBuild(projectName);
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

		// Enqueue resource change for processing before next build
		const queuedChanges = this.#resourceChangeQueue.get(project.getName());
		if (queuedChanges) {
			queuedChanges.add(filePath);
		} else {
			this.#resourceChangeQueue.set(project.getName(), new Set([filePath]));
		}

		// If the server is currently idle, surface the new STALE state right away.
		// During VALIDATING, the same shortcut applies: the change is already registered
		// here, so reporting VALIDATING any longer would mislead consumers. The validation
		// pass's finally clause guards on `#serverState === VALIDATING` and bails when the
		// state has moved on, so there's no double-transition risk.
		if (this.#serverState === SERVER_STATES.IDLE ||
			this.#serverState === SERVER_STATES.VALIDATING) {
			this.#setState(SERVER_STATES.STALE);
		}

		// Debounced emit so a burst of file changes results in a single reload notification
		if (this.#sourcesChangedTimeout) {
			clearTimeout(this.#sourcesChangedTimeout);
		}
		this.#sourcesChangedTimeout = setTimeout(() => {
			this.#sourcesChangedTimeout = null;
			this.emit("sourcesChanged");
		}, SOURCES_CHANGED_DEBOUNCE_MS);
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

	#triggerRequestQueue() {
		if (this.#destroyed || this.#activeBuild) {
			return;
		}
		// If no build is active, trigger queue processing debounced
		if (this.#processBuildRequestsTimeout) {
			clearTimeout(this.#processBuildRequestsTimeout);
		}
		this.#processBuildRequestsTimeout = setTimeout(async () => {
			// Abort any in-flight background validation pass so the build can claim
			// the builder's "buildIsRunning" lock. Validation will be re-scheduled
			// after the build cycle drains.
			await this.#stopActiveValidation("Build request received");
			if (this.#destroyed) {
				return;
			}
			const cycleStart = process.hrtime();
			this.#setState(SERVER_STATES.BUILDING);
			this.#processBuildRequests().then(() => {
				const hrtime = process.hrtime(cycleStart);
				// #processBuildRequests captures individual build failures on the
				// server state and continues the queue, so it resolves normally
				// even when the build errored. Leave the state as-is (ERROR) and
				// skip the post-build validation pass — the pass would surface
				// yet more Force-mode / cache errors on top of the build error
				// that already fired.
				if (this.#serverState === SERVER_STATES.ERROR) {
					return;
				}
				const staleProjects = this.#getStaleProjectNames();
				log.verbose(`Build cycle done. Stale projects: `+
					`${staleProjects.length} (${staleProjects.join(", ")})`);
				if (staleProjects.length === 0) {
					this.#setState(SERVER_STATES.IDLE, {hrtime});
					return;
				}
				// Some projects are still non-FRESH. Try to validate any that are merely
				// INITIAL (cache validity unknown but possibly fresh) in the background.
				// If a pass actually starts, the transition to VALIDATING happens inside
				// #scheduleBackgroundValidation; otherwise we fall back to STALE.
				if (!this.#scheduleBackgroundValidation({hrtime})) {
					this.#setState(SERVER_STATES.STALE, {hrtime, staleProjects});
				}
			}).catch((err) => {
				this.#setState(SERVER_STATES.ERROR, {error: err});
				this.emit("error", err);
			});
		}, 10);
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
				} else {
					log.error(`Build failed: ${err.message}`);
					// Build failed - reject promises for projects that weren't built
					for (const projectName of projectsToBuild) {
						const projectBuildStatus = this.#projectBuildStatus.get(projectName);
						projectBuildStatus.rejectReaderRequests(err);
					}
					// Capture the error for emission below; do NOT re-throw so the queue keeps processing
					// and #activeBuild is cleared. Subsequent requests for affected projects will re-enqueue
					// builds via #getReaderForProject.
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
				this.emit("error", buildError);
				// Continue processing any remaining pending requests for unaffected projects.
				continue;
			}
			this.emit("buildFinished", builtProjects);
			if (signal.aborted) {
				log.verbose(`Build aborted for projects: ${projectsToBuild.join(", ")}`);
				// Do not continue processing the queue if the build was aborted, but re-trigger processing debounced
				// to ensure that any source changes are properly queued before the next build.
				// This is also essential to re-trigger the build in case all resources changes have already been
				// processed while the build was still aborting. Otherwise the build would not be re-triggered.
				this.#triggerRequestQueue();
				return;
			}
		}
	}

	#getStaleProjectNames() {
		const stale = [];
		for (const [name, status] of this.#projectBuildStatus) {
			if (!status.isFresh()) {
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
		if (this.#destroyed || this.#activeValidation || this.#activeBuild) {
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
				// If a build is queued or running, leave state to #triggerRequestQueue's
				// BUILDING transition. Otherwise (and unless validation failed — in which
				// case the catch above has already settled state on ERROR) reflect the
				// outcome of the validation pass: fully fresh → IDLE, anything else → STALE.
				if (this.#destroyed || this.#activeBuild ||
					this.#pendingBuildRequest.size > 0 ||
					this.#serverState === SERVER_STATES.BUILDING ||
					this.#serverState === SERVER_STATES.ERROR) {
					return;
				}
				const staleProjects = this.#getStaleProjectNames();
				if (staleProjects.length === 0) {
					this.#setState(SERVER_STATES.IDLE);
				} else {
					this.#setState(SERVER_STATES.STALE, {staleProjects});
				}
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
				if (signal.aborted) {
					return;
				}
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
			// aborted by its own queue tick. Pick up the slack here: any project the pass
			// didn't promote to FRESH but which has callers waiting on a reader must now be
			// built. #enqueueBuild is idempotent, so re-enqueueing one already scheduled by
			// the watcher or a concurrent caller is harmless.
			for (const projectName of projectNames) {
				const status = this.#projectBuildStatus.get(projectName);
				if (!status) {
					continue;
				}
				status.releaseValidating();
				if (!status.isFresh() && status.hasPendingReaderRequests()) {
					this.#enqueueBuild(projectName);
				}
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
	 *   <li>BUILDING → ERROR: serveError(err) only — buildDone is skipped so
	 *       consumers don't see a successful cycle close before the error</li>
	 *   <li>VALIDATING → IDLE/STALE: ready()/stale() — no buildDone (no build happened)</li>
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
	 * @param {string[]} [opts.validatingProjects] Names of projects undergoing background cache
	 *     validation; required when transitioning to VALIDATING.
	 * @param {Error} [opts.error] Error instance; required when transitioning to ERROR.
	 */
	#setState(next, {hrtime, staleProjects, validatingProjects, error} = {}) {
		if (this.#serverState === next) {
			return;
		}
		const previous = this.#serverState;
		this.#serverState = next;

		if (previous === SERVER_STATES.BUILDING && next !== SERVER_STATES.ERROR) {
			this.#serveLogger.buildDone(hrtime ?? [0, 0]);
		}

		switch (next) {
		case SERVER_STATES.IDLE:
			this.#serveLogger.ready();
			break;
		case SERVER_STATES.STALE:
			this.#serveLogger.stale(staleProjects ?? this.#getStaleProjectNames());
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
});

class ProjectBuildStatus {
	#state = PROJECT_STATES.INITIAL;
	#readerQueue = [];
	#reader;
	#abortController = new AbortController();

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
	 * cache to be stale and the project should remain lazy. No-op for any other state
	 * (e.g. when invalidate() already moved the project to INVALIDATED mid-validation,
	 * or a build claimed it in the meantime).
	 */
	releaseValidating() {
		if (this.#state === PROJECT_STATES.VALIDATING) {
			this.#state = PROJECT_STATES.INITIAL;
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

	hasPendingReaderRequests() {
		return this.#readerQueue.length > 0;
	}

	rejectReaderRequests(error) {
		this.#state = PROJECT_STATES.INVALIDATED;
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
		SOURCES_CHANGED_DEBOUNCE_MS
	};
}

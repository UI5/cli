import EventEmitter from "node:events";
import {createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";
import BuildReader from "./BuildReader.js";
import WatchHandler from "./helpers/WatchHandler.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:BuildServer");

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
	#allReader;
	#rootReader;
	#dependenciesReader;

	/**
	 * Creates a new BuildServer instance
	 *
	 * Initializes readers for different project combinations, sets up file watching,
	 * and optionally performs an initial build of specified dependencies.
	 *
	 * @public
	 * @param {@ui5/project/graph/ProjectGraph} graph Project graph containing all projects
	 * @param {@ui5/project/build/ProjectBuilder} projectBuilder Builder instance for executing builds
	 * @param {boolean} initialBuildRootProject Whether to build the root project in the initial build
	 * @param {string[]} initialBuildIncludedDependencies Project names to include in initial build
	 * @param {string[]} initialBuildExcludedDependencies Project names to exclude from initial build
	 */
	constructor(
		graph, projectBuilder,
		initialBuildRootProject, initialBuildIncludedDependencies, initialBuildExcludedDependencies
	) {
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

		if (initialBuildRootProject) {
			log.verbose("Enqueueing root project for initial build");
			this.#enqueueBuild(this.#rootProjectName);
		}
		if (initialBuildIncludedDependencies.length > 0) {
			// Enqueue initial build dependencies
			for (const projectName of initialBuildIncludedDependencies) {
				if (!initialBuildExcludedDependencies.includes(projectName)) {
					log.verbose(`Enqueueing project '${projectName}' for initial build`);
					this.#enqueueBuild(projectName);
				}
			}
		}

		const watchHandler = new WatchHandler();
		this.#watchHandler = watchHandler;
		const allProjects = graph.getProjects();
		watchHandler.watch(allProjects).catch((err) => {
			// Error during watch setup
			this.emit("error", err);
		});
		watchHandler.on("error", (err) => {
			this.emit("error", err);
		});
		watchHandler.on("change", (eventType, resourcePath, project) => {
			log.verbose(`Source change detected: ${eventType} ${resourcePath} in project '${project.getName()}'`);
			this._projectResourceChanged(project, resourcePath, ["add", "unlink", "unlinkDir"].includes(eventType));
		});
	}

	async destroy() {
		await this.#watchHandler.destroy();
		if (this.#activeBuild) {
			// Await active build to finish
			await this.#activeBuild;
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

		if (projectBuildStatus.isFresh()) {
			return projectBuildStatus.getReader();
		}
		const {promise, resolve, reject} = Promise.withResolvers();
		projectBuildStatus.addReaderRequest({resolve, reject});

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
			projectBuildStatus.invalidate(`Source change in project '${project.getName()}'`);
			if (fileAddedOrRemoved) {
				// Reset any cached readers in case files were added or removed
				projectBuildStatus.resetReaderCache();
			}
		}

		// Enqueue resource change for processing before next build
		const queuedChanges = this.#resourceChangeQueue.get(project.getName());
		if (queuedChanges) {
			queuedChanges.add(filePath);
		} else {
			this.#resourceChangeQueue.set(project.getName(), new Set([filePath]));
		}

		// : Emit event debounced
		// Emit change event immediately so that consumers can react to it (like browser reloading)
		// const changedResourcePaths = [...changes.values()].flat();
		// this.emit("sourcesChanged", changedResourcePaths);
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
		if (this.#activeBuild) {
			return;
		}
		// If no build is active, trigger queue processing debounced
		if (this.#processBuildRequestsTimeout) {
			clearTimeout(this.#processBuildRequestsTimeout);
		}
		this.#processBuildRequestsTimeout = setTimeout(() => {
			this.#processBuildRequests().catch((err) => {
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
			const signal = AbortSignal.any(projectsToBuild.map((projectName) => {
				return this.#projectBuildStatus.get(projectName).getAbortSignal();
			}));

			// Process any queued resource changes (must be done before starting the build)
			this.#flushResourceChanges();

			// Set active build to prevent concurrent builds
			const buildPromise = this.#activeBuild = this.#projectBuilder.build({
				includeRootProject: buildRootProject,
				includedDependencies: dependenciesToBuild,
				signal,
			}, (projectName, project) => {
				// Project has been built and result can be used
				const projectBuildStatus = this.#projectBuildStatus.get(projectName);
				projectBuildStatus.setReader(project.getReader({style: "runtime"}));
			}).catch((err) => {
				if (err instanceof AbortBuildError) {
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
					// Re-throw to be handled by caller
					// TODO: rather emit 'error' event for the BuildServer and continue processing the queue?
					// Currently, this.#activeBuild will not be cleared.
					throw err;
				}
			});

			const builtProjects = await buildPromise;
			this.emit("buildFinished", builtProjects);
			// Clear active build
			this.#activeBuild = null;
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
}

const PROJECT_STATES = Object.freeze({
	INITIAL: "initial",
	INVALIDATED: "invalidated",
	// TODO: New state BUILDING
	FRESH: "fresh",
});

class ProjectBuildStatus {
	#state = PROJECT_STATES.INITIAL;
	#readerQueue = [];
	#reader;
	#abortController = new AbortController();

	invalidate(reason = "Project invalidated") {
		if (this.#state === PROJECT_STATES.INVALIDATED) {
			// Already invalidated
			return;
		}
		this.#state = PROJECT_STATES.INVALIDATED;
		// Ensure any running build is aborted. Then reset the abort controller
		this.#abortController.abort(new AbortBuildError(reason));
		this.#abortController = new AbortController();
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

	getReader() {
		return this.#reader;
	}

	setReader(reader) {
		this.#reader = reader;
		this.#state = PROJECT_STATES.FRESH;
		// Resolve any queued getReader promises
		for (const {resolve} of this.#readerQueue) {
			resolve(reader);
		}
		this.#readerQueue = [];
	}

	resetReaderCache() {
		this.#reader = null;
	}

	addReaderRequest(promiseResolvers) {
		this.#readerQueue.push(promiseResolvers);
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

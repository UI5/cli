import EventEmitter from "node:events";
import {createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";
import BuildReader from "./BuildReader.js";
import WatchHandler from "./helpers/WatchHandler.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:BuildServer");

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
	#buildQueue = new Map();
	#pendingBuildRequest = new Set();
	#activeBuild = null;
	#allReader;
	#rootReader;
	#dependenciesReader;
	#projectReaders = new Map();

	/**
	 * Creates a new BuildServer instance
	 *
	 * Initializes readers for different project combinations, sets up file watching,
	 * and optionally performs an initial build of specified dependencies.
	 *
	 * @public
	 * @param {@ui5/project/graph/ProjectGraph} graph Project graph containing all projects
	 * @param {@ui5/project/build/ProjectBuilder} projectBuilder Builder instance for executing builds
	 * @param {string[]} initialBuildIncludedDependencies Project names to include in initial build
	 * @param {string[]} initialBuildExcludedDependencies Project names to exclude from initial build
	 */
	constructor(graph, projectBuilder, initialBuildIncludedDependencies, initialBuildExcludedDependencies) {
		super();
		this.#graph = graph;
		this.#projectBuilder = projectBuilder;
		this.#allReader = new BuildReader("Build Server: All Projects Reader",
			Array.from(this.#graph.getProjects()),
			this.#getReaderForProject.bind(this),
			this.#getReaderForProjects.bind(this));
		const rootProject = this.#graph.getRoot();
		this.#rootReader = new BuildReader("Build Server: Root Project Reader",
			[rootProject],
			this.#getReaderForProject.bind(this),
			this.#getReaderForProjects.bind(this));
		const dependencies = graph.getTransitiveDependencies(rootProject.getName()).map((dep) => graph.getProject(dep));
		this.#dependenciesReader = new BuildReader("Build Server: Dependencies Reader",
			dependencies,
			this.#getReaderForProject.bind(this),
			this.#getReaderForProjects.bind(this));

		if (initialBuildIncludedDependencies.length > 0) {
			// Enqueue initial build dependencies
			for (const projectName of initialBuildIncludedDependencies) {
				if (!initialBuildExcludedDependencies.includes(projectName)) {
					this.#pendingBuildRequest.add(projectName);
				}
			}
			this.#processBuildQueue().catch((err) => {
				this.emit("error", err);
			});
		}

		const watchHandler = new WatchHandler();
		const allProjects = graph.getProjects();
		watchHandler.watch(allProjects).catch((err) => {
			// Error during watch setup
			this.emit("error", err);
		});
		watchHandler.on("error", (err) => {
			this.emit("error", err);
		});
		watchHandler.on("sourcesChanged", (changes) => {
			// Inform project builder

			log.verbose("Source changes detected: ", changes);

			const affectedProjects = this.#projectBuilder.resourcesChanged(changes);

			for (const projectName of affectedProjects) {
				log.verbose(`Invalidating built project '${projectName}' due to source changes`);
				this.#projectReaders.delete(projectName);
				// If project is currently in build queue, re-enqueue it for rebuild
				if (this.#buildQueue.has(projectName)) {
					log.verbose(`Re-enqueuing project '${projectName}' for rebuild`);
					this.#pendingBuildRequest.add(projectName);
				}
			}

			const changedResourcePaths = [...changes.values()].flat();
			this.emit("sourcesChanged", changedResourcePaths);
		});
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
		if (this.#projectReaders.has(projectName)) {
			return this.#projectReaders.get(projectName);
		}
		return this.#enqueueBuild(projectName);
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
		// Enqueue all projects that aren't cached yet
		const buildPromises = [];
		for (const projectName of projectNames) {
			if (!this.#projectReaders.has(projectName)) {
				buildPromises.push(this.#enqueueBuild(projectName));
			}
		}
		// Wait for all builds to complete
		if (buildPromises.length > 0) {
			await Promise.all(buildPromises);
		}
		return this.#getReaderForCachedProjects(projectNames);
	}

	/**
	 * Creates a combined reader for already-built projects
	 *
	 * Retrieves readers from the cache for the specified projects and combines them
	 * into a prioritized reader collection.
	 *
	 * @param {string[]} projectNames Array of project names to combine
	 * @returns {@ui5/fs/ReaderCollection} Combined reader for cached projects
	 */
	#getReaderForCachedProjects(projectNames) {
		const readers = [];
		for (const projectName of projectNames) {
			const reader = this.#projectReaders.get(projectName);
			if (reader) {
				readers.push(reader);
			}
		}
		return createReaderCollectionPrioritized({
			name: `Build Server: Reader for projects: ${projectNames.join(", ")}`,
			readers
		});
	}

	/**
	 * Enqueues a project for building and returns a promise that resolves with its reader
	 *
	 * If the project is already queued, returns the existing promise. Otherwise, creates
	 * a new promise, adds the project to the pending build queue, and triggers queue processing.
	 *
	 * @param {string} projectName Name of the project to enqueue
	 * @returns {Promise<@ui5/fs/AbstractReader>} Promise that resolves with the project's reader
	 */
	#enqueueBuild(projectName) {
		// If already queued, return existing promise
		if (this.#buildQueue.has(projectName)) {
			return this.#buildQueue.get(projectName).promise;
		}

		log.verbose(`Enqueuing project '${projectName}' for build`);

		// Create new promise for this project
		let resolve;
		let reject;
		const promise = new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		});

		// Store promise and resolvers in the queue
		this.#buildQueue.set(projectName, {promise, resolve, reject});

		// Add to pending build requests
		this.#pendingBuildRequest.add(projectName);

		// Trigger queue processing if no build is active
		if (!this.#activeBuild) {
			this.#processBuildQueue().catch((err) => {
				this.emit("error", err);
			});
		}

		return promise;
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
	async #processBuildQueue() {
		// Process queue while there are pending requests
		while (this.#pendingBuildRequest.size > 0) {
			// Collect all pending projects for this batch
			const projectsToBuild = Array.from(this.#pendingBuildRequest);
			this.#pendingBuildRequest.clear();

			log.verbose(`Building projects: ${projectsToBuild.join(", ")}`);

			// Set active build to prevent concurrent builds
			const buildPromise = this.#activeBuild = this.#projectBuilder.build({
				includedDependencies: projectsToBuild
			});

			try {
				const builtProjects = await buildPromise;
				this.#projectBuildFinished(builtProjects);

				// Resolve promises for all successfully built projects
				for (const projectName of builtProjects) {
					const queueEntry = this.#buildQueue.get(projectName);
					if (queueEntry) {
						const reader = this.#projectReaders.get(projectName);
						queueEntry.resolve(reader);
						// Only remove from queue if not re-enqueued during build
						if (!this.#pendingBuildRequest.has(projectName)) {
							log.verbose(`Project '${projectName}' build finished. Removing from build queue.`);
							this.#buildQueue.delete(projectName);
						}
					}
				}
			} catch (err) {
				// Build failed - reject promises for projects that weren't built
				for (const projectName of projectsToBuild) {
					log.error(`Project '${projectName}' build failed: ${err.message}`);
					const queueEntry = this.#buildQueue.get(projectName);
					if (queueEntry && !this.#projectReaders.has(projectName)) {
						queueEntry.reject(err);
						this.#buildQueue.delete(projectName);
						this.#pendingBuildRequest.delete(projectName);
					}
				}
				// Re-throw to be handled by caller
				throw err;
			} finally {
				// Clear active build
				this.#activeBuild = null;
			}
		}
	}

	/**
	 * Handles completion of a project build
	 *
	 * Caches readers for all built projects and emits the buildFinished event
	 * with the list of project names that were built.
	 *
	 * @param {string[]} projectNames Array of project names that were built
	 * @fires BuildServer#buildFinished
	 */
	#projectBuildFinished(projectNames) {
		for (const projectName of projectNames) {
			this.#projectReaders.set(projectName,
				this.#graph.getProject(projectName).getReader({style: "runtime"}));
		}
		this.emit("buildFinished", projectNames);
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

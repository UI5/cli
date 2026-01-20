import EventEmitter from "node:events";
import {createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";
import BuildReader from "./BuildReader.js";
import WatchHandler from "./helpers/WatchHandler.js";

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
	#pCurrentBuild;
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
			this.#pCurrentBuild = projectBuilder.build({
				includedDependencies: initialBuildIncludedDependencies,
				excludedDependencies: initialBuildExcludedDependencies
			}).then((builtProjects) => {
				this.#projectBuildFinished(builtProjects);
			}).catch((err) => {
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
			const affectedProjects = this.#projectBuilder.resourcesChanged(changes);

			for (const projectName of affectedProjects) {
				this.#projectReaders.delete(projectName);
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
	 * If not built, waits for any in-progress build, then triggers a build for the
	 * requested project.
	 *
	 * @param {string} projectName Name of the project to get reader for
	 * @returns {Promise<@ui5/fs/AbstractReader>} Reader for the built project
	 */
	async #getReaderForProject(projectName) {
		if (this.#projectReaders.has(projectName)) {
			return this.#projectReaders.get(projectName);
		}
		if (this.#pCurrentBuild) {
			// If set, await currently running build
			await this.#pCurrentBuild;
		}
		if (this.#projectReaders.has(projectName)) {
			return this.#projectReaders.get(projectName);
		}
		this.#pCurrentBuild = this.#projectBuilder.build({
			includedDependencies: [projectName]
		}).catch((err) => {
			this.emit("error", err);
		});
		const builtProjects = await this.#pCurrentBuild;
		this.#projectBuildFinished(builtProjects);

		// Clear current build promise
		this.#pCurrentBuild = null;

		return this.#projectReaders.get(projectName);
	}

	/**
	 * Gets a combined reader for multiple projects, building them if necessary
	 *
	 * Determines which projects need to be built, waits for any in-progress build,
	 * then triggers a build for any missing projects. Returns a prioritized collection
	 * reader combining all requested projects.
	 *
	 * @param {string[]} projectNames Array of project names to get readers for
	 * @returns {Promise<@ui5/fs/ReaderCollection>} Combined reader for all requested projects
	 */
	async #getReaderForProjects(projectNames) {
		let projectsRequiringBuild = [];
		for (const projectName of projectNames) {
			if (!this.#projectReaders.has(projectName)) {
				projectsRequiringBuild.push(projectName);
			}
		}
		if (projectsRequiringBuild.length === 0) {
			// Projects already built
			return this.#getReaderForCachedProjects(projectNames);
		}
		if (this.#pCurrentBuild) {
			// If set, await currently running build
			await this.#pCurrentBuild;
		}
		projectsRequiringBuild = [];
		for (const projectName of projectNames) {
			if (!this.#projectReaders.has(projectName)) {
				projectsRequiringBuild.push(projectName);
			}
		}
		if (projectsRequiringBuild.length === 0) {
			// Projects already built
			return this.#getReaderForCachedProjects(projectNames);
		}
		this.#pCurrentBuild = this.#projectBuilder.build({
			includedDependencies: projectsRequiringBuild
		}).catch((err) => {
			this.emit("error", err);
		});
		const builtProjects = await this.#pCurrentBuild;
		this.#projectBuildFinished(builtProjects);

		// Clear current build promise
		this.#pCurrentBuild = null;

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

	// async #getReaderForAllProjects() {
	// 	if (this.#pCurrentBuild) {
	// 		// If set, await initial build
	// 		await this.#pCurrentBuild;
	// 	}
	// 	if (this.#allProjectsReader) {
	// 		return this.#allProjectsReader;
	// 	}
	// 	this.#pCurrentBuild = this.#projectBuilder.build({
	// 		includedDependencies: ["*"]
	// 	}).catch((err) => {
	// 		this.emit("error", err);
	// 	});
	// 	const builtProjects = await this.#pCurrentBuild;
	// 	this.#projectBuildFinished(builtProjects);

	// 	// Clear current build promise
	// 	this.#pCurrentBuild = null;

	// 	// Create a combined reader for all projects
	// 	this.#allProjectsReader = createReaderCollectionPrioritized({
	// 		name: "All projects build reader",
	// 		readers: [...this.#projectReaders.values()]
	// 	});
	// 	return this.#allProjectsReader;
	// }

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

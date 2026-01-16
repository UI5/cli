import EventEmitter from "node:events";
import {createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";
import BuildReader from "./BuildReader.js";
import WatchHandler from "./helpers/WatchHandler.js";

class BuildServer extends EventEmitter {
	#graph;
	#projectBuilder;
	#pCurrentBuild;
	#allReader;
	#rootReader;
	#dependenciesReader;
	#projectReaders = new Map();

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

	getReader() {
		return this.#allReader;
	}

	getRootReader() {
		return this.#rootReader;
	}

	getDependenciesReader() {
		return this.#dependenciesReader;
	}

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

	#projectBuildFinished(projectNames) {
		for (const projectName of projectNames) {
			this.#projectReaders.set(projectName,
				this.#graph.getProject(projectName).getReader({style: "runtime"}));
		}
		this.emit("buildFinished", projectNames);
	}
}


export default BuildServer;

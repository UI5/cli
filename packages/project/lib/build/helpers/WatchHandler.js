import EventEmitter from "node:events";
import chokidar from "chokidar";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:helpers:WatchHandler");

/**
 * Context of a build process
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class WatchHandler extends EventEmitter {
	#buildContext;
	#updateBuildResult;
	#closeCallbacks = [];
	#sourceChanges = new Map();
	#ready = false;
	#updateInProgress = false;
	#fileChangeHandlerTimeout;

	constructor(buildContext, updateBuildResult) {
		super();
		this.#buildContext = buildContext;
		this.#updateBuildResult = updateBuildResult;
	}

	setReady() {
		this.#ready = true;
		this.#processQueue();
	}

	async watch(projects) {
		const readyPromises = [];
		for (const project of projects) {
			const paths = project.getSourcePaths();
			log.verbose(`Watching source paths: ${paths.join(", ")}`);

			const watcher = chokidar.watch(paths, {
				ignoreInitial: true,
			});
			this.#closeCallbacks.push(async () => {
				await watcher.close();
			});
			watcher.on("all", (event, filePath) => {
				this.#handleWatchEvents(event, filePath, project);
			});
			const {promise, resolve} = Promise.withResolvers();
			readyPromises.push(promise);
			watcher.on("ready", () => {
				resolve();
			});
			watcher.on("error", (err) => {
				this.emit("error", err);
			});
		}
		return await Promise.all(readyPromises);
	}

	async stop() {
		for (const cb of this.#closeCallbacks) {
			await cb();
		}
	}

	async #handleWatchEvents(eventType, filePath, project) {
		log.verbose(`File changed: ${eventType} ${filePath}`);
		await this.#fileChanged(project, filePath);
	}

	#fileChanged(project, filePath) {
		// Collect changes (grouped by project), then trigger callbacks
		const resourcePath = project.getVirtualPath(filePath);
		const projectName = project.getName();
		if (!this.#sourceChanges.has(projectName)) {
			this.#sourceChanges.set(projectName, new Set());
		}
		this.#sourceChanges.get(projectName).add(resourcePath);

		this.#processQueue();
	}

	#processQueue() {
		if (!this.#ready || this.#updateInProgress || !this.#sourceChanges.size) {
			// Prevent concurrent or premature processing
			return;
		}

		// Trigger callbacks debounced
		if (this.#fileChangeHandlerTimeout) {
			clearTimeout(this.#fileChangeHandlerTimeout);
		}
		this.#fileChangeHandlerTimeout = setTimeout(async () => {
			this.#fileChangeHandlerTimeout = null;

			const sourceChanges = this.#sourceChanges;
			// Reset file changes before processing
			this.#sourceChanges = new Map();

			this.#updateInProgress = true;
			try {
				await this.#handleResourceChanges(sourceChanges);
			} catch (err) {
				this.emit("error", err);
			} finally {
				this.#updateInProgress = false;
			}

			if (this.#sourceChanges.size > 0) {
				// New changes have occurred during processing, trigger queue again
				this.#processQueue();
			}
		}, 100);
	}

	async #handleResourceChanges(sourceChanges) {
		const dependencyChanges = new Map();

		const graph = this.#buildContext.getGraph();
		for (const [projectName, changedResourcePaths] of sourceChanges) {
			// Propagate changes to dependents of the project
			for (const {project: dep} of graph.traverseDependents(projectName)) {
				const depChanges = dependencyChanges.get(dep.getName());
				if (!depChanges) {
					dependencyChanges.set(dep.getName(), new Set(changedResourcePaths));
					continue;
				}
				for (const res of changedResourcePaths) {
					depChanges.add(res);
				}
			}
			const projectBuildContext = this.#buildContext.getBuildContext(projectName);
			projectBuildContext.getBuildCache()
				.projectSourcesChanged(Array.from(changedResourcePaths));
		}

		for (const [projectName, changedResourcePaths] of dependencyChanges) {
			const projectBuildContext = this.#buildContext.getBuildContext(projectName);
			projectBuildContext.getBuildCache()
				.dependencyResourcesChanged(Array.from(changedResourcePaths));
		}

		this.emit("projectResourcesInvalidated");
		await this.#updateBuildResult();
		this.emit("projectResourcesUpdated");
	}
}

export default WatchHandler;

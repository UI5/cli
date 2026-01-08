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
		if (!this.#sourceChanges.has(project)) {
			this.#sourceChanges.set(project, new Set());
		}
		this.#sourceChanges.get(project).add(resourcePath);

		this.#processQueue();
	}

	#processQueue() {
		if (!this.#ready || this.#updateInProgress) {
			// Prevent concurrent updates
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
		let someProjectTasksInvalidated = false;

		const graph = this.#buildContext.getGraph();
		for (const [project, changedResourcePaths] of sourceChanges) {
			// Propagate changes to dependents of the project
			for (const {project: dep} of graph.traverseDependents(project.getName())) {
				const depChanges = dependencyChanges.get(dep);
				if (!depChanges) {
					dependencyChanges.set(dep, new Set(changedResourcePaths));
					continue;
				}
				for (const res of changedResourcePaths) {
					depChanges.add(res);
				}
			}
		}

		await graph.traverseDepthFirst(async ({project}) => {
			if (!sourceChanges.has(project) && !dependencyChanges.has(project)) {
				return;
			}
			const projectSourceChanges = Array.from(sourceChanges.get(project) ?? new Set());
			const projectDependencyChanges = Array.from(dependencyChanges.get(project) ?? new Set());
			const projectBuildContext = this.#buildContext.getBuildContext(project.getName());
			const tasksInvalidated = await projectBuildContext.getBuildCache()
				.resourceChanged(projectSourceChanges, projectDependencyChanges);

			if (tasksInvalidated) {
				someProjectTasksInvalidated = true;
			}
		});

		if (someProjectTasksInvalidated) {
			this.emit("projectResourcesInvalidated");
			await this.#updateBuildResult();
			this.emit("projectResourcesUpdated");
		}
	}
}

export default WatchHandler;

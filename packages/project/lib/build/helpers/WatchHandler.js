import EventEmitter from "node:events";
import path from "node:path";
import {watch} from "node:fs/promises";
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
	#abortControllers = [];
	#sourceChanges = new Map();
	#updateInProgress = false;
	#fileChangeHandlerTimeout;

	constructor(buildContext, updateBuildResult) {
		super();
		this.#buildContext = buildContext;
		this.#updateBuildResult = updateBuildResult;
	}

	watch(projects) {
		for (const project of projects) {
			const paths = project.getSourcePaths();
			log.verbose(`Watching source paths: ${paths.join(", ")}`);

			for (const sourceDir of paths) {
				const ac = new AbortController();
				const watcher = watch(sourceDir, {
					persistent: true,
					recursive: true,
					signal: ac.signal,
				});

				this.#abortControllers.push(ac);
				this.#handleWatchEvents(watcher, sourceDir, project); // Do not await as this would block the loop
			}
		}
	}

	stop() {
		for (const ac of this.#abortControllers) {
			ac.abort();
		}
	}

	async #handleWatchEvents(watcher, basePath, project) {
		try {
			for await (const {eventType, filename} of watcher) {
				log.verbose(`File changed: ${eventType} ${filename}`);
				if (filename) {
					await this.#fileChanged(project, path.join(basePath, filename.toString()));
				}
			}
		} catch (err) {
			if (err.name === "AbortError") {
				return;
			}
			throw err;
		}
	}

	#fileChanged(project, filePath) {
		// Collect changes (grouped by project), then trigger callbacks
		const resourcePath = project.getVirtualPath(filePath);
		if (!this.#sourceChanges.has(project)) {
			this.#sourceChanges.set(project, new Set());
		}
		this.#sourceChanges.get(project).add(resourcePath);

		this.#queueHandleResourceChanges();
	}

	#queueHandleResourceChanges() {
		if (this.#updateInProgress) {
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
			await this.#handleResourceChanges(sourceChanges);
			this.#updateInProgress = false;

			if (this.#sourceChanges.size > 0) {
				// New changes have occurred during processing, trigger queue again
				this.#queueHandleResourceChanges();
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

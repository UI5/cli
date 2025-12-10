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

	async #fileChanged(project, filePath) {
		// Collect changes (grouped by project), then trigger callbacks (debounced)
		const resourcePath = project.getVirtualPath(filePath);
		if (!this.#sourceChanges.has(project)) {
			this.#sourceChanges.set(project, new Set());
		}
		this.#sourceChanges.get(project).add(resourcePath);

		// Trigger callbacks debounced
		if (!this.#fileChangeHandlerTimeout) {
			this.#fileChangeHandlerTimeout = setTimeout(async () => {
				await this.#handleResourceChanges();
				this.#fileChangeHandlerTimeout = null;
			}, 100);
		} else {
			clearTimeout(this.#fileChangeHandlerTimeout);
			this.#fileChangeHandlerTimeout = setTimeout(async () => {
				await this.#handleResourceChanges();
				this.#fileChangeHandlerTimeout = null;
			}, 100);
		}
	}

	async #handleResourceChanges() {
		// Reset file changes before processing
		const sourceChanges = this.#sourceChanges;
		this.#sourceChanges = new Map();
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

		await graph.traverseDepthFirst(({project}) => {
			if (!sourceChanges.has(project) && !dependencyChanges.has(project)) {
				return;
			}
			const projectSourceChanges = sourceChanges.get(project) ?? new Set();
			const projectDependencyChanges = dependencyChanges.get(project) ?? new Set();
			const projectBuildContext = this.#buildContext.getBuildContext(project.getName());
			const tasksInvalidated =
				projectBuildContext.getBuildCache().resourceChanged(projectSourceChanges, projectDependencyChanges);

			if (tasksInvalidated) {
				someProjectTasksInvalidated = true;
			}
		});

		if (someProjectTasksInvalidated) {
			this.emit("projectInvalidated");
			await this.#updateBuildResult();
			this.emit("buildUpdated");
		}
	}
}

export default WatchHandler;

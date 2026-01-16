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
	#closeCallbacks = [];
	#sourceChanges = new Map();
	#ready = false;
	#fileChangeHandlerTimeout;

	constructor() {
		super();
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
			const {promise, resolve: ready} = Promise.withResolvers();
			readyPromises.push(promise);
			watcher.on("ready", () => {
				this.#ready = true;
				ready();
			});
			watcher.on("error", (err) => {
				this.emit("error", err);
			});
		}
		return await Promise.all(readyPromises);
	}

	async destroy() {
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
		if (!this.#ready || !this.#sourceChanges.size) {
			// Prevent premature processing
			return;
		}

		// Trigger change event debounced
		if (this.#fileChangeHandlerTimeout) {
			clearTimeout(this.#fileChangeHandlerTimeout);
		}
		this.#fileChangeHandlerTimeout = setTimeout(async () => {
			this.#fileChangeHandlerTimeout = null;

			const sourceChanges = this.#sourceChanges;
			// Reset file changes
			this.#sourceChanges = new Map();

			try {
				this.emit("sourcesChanged", sourceChanges);
			} catch (err) {
				this.emit("error", err);
			}
		}, 100);
	}
}

export default WatchHandler;

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

	constructor() {
		super();
	}

	async watch(projects) {
		const readyPromises = [];
		for (const project of projects) {
			readyPromises.push(this._watchProject(project));
		}
		await Promise.all(readyPromises);
	}

	async _watchProject(project) {
		let ready = false;
		const paths = project.getSourcePaths();
		log.verbose(`Watching source paths: ${paths.join(", ")}`);

		const watcher = chokidar.watch(paths, {
			ignoreInitial: true,
		});
		this.#closeCallbacks.push(async () => {
			await watcher.close();
		});
		watcher.on("all", (event, filePath) => {
			if (!ready) {
				// Ignore events before ready
				return;
			}
			if (event === "addDir") {
				// Ignore directory creation events
				return;
			}
			this.#handleWatchEvents(event, filePath, project).catch((err) => {
				this.emit("error", err);
			});
		});
		const {promise, resolve} = Promise.withResolvers();

		watcher.on("ready", () => {
			ready = true;
			resolve();
		});
		watcher.on("error", (err) => {
			this.emit("error", err);
		});

		return promise;
	}

	async destroy() {
		for (const cb of this.#closeCallbacks) {
			await cb();
		}
	}

	async #handleWatchEvents(eventType, filePath, project) {
		const resourcePath = project.getVirtualPath(filePath);
		log.verbose(`File changed: ${eventType} ${filePath} (as ${resourcePath} in project '${project.getName()}')`);
		this.emit("change", eventType, resourcePath, project);
	}
}

export default WatchHandler;

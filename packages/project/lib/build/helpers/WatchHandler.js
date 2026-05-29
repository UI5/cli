import EventEmitter from "node:events";
import parcelWatcher from "@parcel/watcher";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:helpers:WatchHandler");

/**
 * Context of a build process
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class WatchHandler extends EventEmitter {
	#subscriptions = [];

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
		const paths = project.getSourcePaths();
		log.verbose(`Watching source path(s): ${paths.join(", ")}`);

		await Promise.all(paths.map(async (path) => {
			const subscription = await parcelWatcher.subscribe(path, (err, events) => {
				if (err) {
					this.emit("error", err);
					return;
				}
				for (const event of events) {
					try {
						this.#handleWatchEvents(event.type, event.path, project);
					} catch (handlerErr) {
						this.emit("error", handlerErr);
					}
				}
			});
			this.#subscriptions.push(subscription);
		}));
	}

	async destroy() {
		// Drain the subscriptions list so a second destroy() is a no-op and a partial
		// failure cannot leave stale handles behind to be unsubscribed twice.
		const subscriptions = this.#subscriptions;
		this.#subscriptions = [];
		// Run in parallel and collect failures so a single misbehaving subscription
		// cannot leak the others.
		const results = await Promise.allSettled(subscriptions.map((s) => s.unsubscribe()));
		const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason);
		if (failures.length) {
			const err = new AggregateError(failures, "Failed to unsubscribe one or more file watchers");
			this.emit("error", err);
		}
	}

	#handleWatchEvents(eventType, filePath, project) {
		const resourcePath = project.getVirtualPath(filePath);
		if (log.isLevelEnabled("silly")) {
			log.silly(`FS event: ${eventType} ${filePath} (as ${resourcePath} in project '${project.getName()}')`);
		}
		this.emit("change", eventType, resourcePath, project);
	}
}

export default WatchHandler;

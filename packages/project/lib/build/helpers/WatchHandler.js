import EventEmitter from "node:events";
import {access} from "node:fs/promises";
import parcelWatcher from "@parcel/watcher";
import {getLogger} from "@ui5/logger";
import {drainSubscriptions} from "./watchSubscriptions.js";
const log = getLogger("build:helpers:WatchHandler");

// Resolves true if the path is accessible, false otherwise. Used to distinguish a subscribe failure
// caused by a vanished source path (skippable) from a genuine watcher fault (must escalate).
async function pathExists(p) {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

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
			let subscription;
			try {
				subscription = await parcelWatcher.subscribe(path, (err, events) => {
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
			} catch (err) {
				if (await pathExists(path)) {
					// Path present but subscribe failed: a genuine watcher fault. Let it propagate so
					// BuildServer's loop-protected recovery/escalation path still applies.
					throw err;
				}
				// Source path vanished (e.g. removed by a branch switch) before we could subscribe.
				// Skip it rather than wedging the whole server in terminal ERROR; the next graph
				// resolution re-targets the watcher. At worst the project stays stale until then.
				log.warn(`Skipping watch on missing source path (moved/removed): ${path}`);
				return;
			}
			this.#subscriptions.push(subscription);
		}));
	}

	async destroy() {
		// Drain the subscriptions list so a second destroy() is a no-op and a partial
		// failure cannot leave stale handles behind to be unsubscribed twice.
		const subscriptions = this.#subscriptions;
		this.#subscriptions = [];
		const failures = await drainSubscriptions(subscriptions);
		if (failures.length) {
			const err = new AggregateError(failures, "Failed to unsubscribe one or more file watchers");
			this.emit("error", err);
		}
	}

	#handleWatchEvents(eventType, filePath, project) {
		let resourcePath;
		try {
			resourcePath = project.getVirtualPath(filePath);
		} catch (err) {
			// Source dir moved/removed under the running watcher (e.g. git checkout): the path no
			// longer maps into the project the watcher was armed with. Drop the event rather than
			// escalating to a fatal watcher error; the definition watcher re-inits the serving stack
			// over the new graph, which re-targets the watcher at the current paths.
			log.verbose(`Dropping watch event for unmappable path ${filePath} ` +
				`in project '${project.getName()}': ${err.message}`);
			return;
		}
		if (log.isLevelEnabled("silly")) {
			log.silly(`FS event: ${eventType} ${filePath} (as ${resourcePath} in project '${project.getName()}')`);
		}
		this.emit("change", eventType, resourcePath, project);
	}
}

export default WatchHandler;

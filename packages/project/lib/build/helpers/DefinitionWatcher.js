import EventEmitter from "node:events";
import path from "node:path";
import parcelWatcher from "@parcel/watcher";
import {getLogger} from "@ui5/logger";
import {drainSubscriptions} from "./watchSubscriptions.js";
import {WATCHER_BURST_SETTLE_MS} from "./watchSettle.js";
import RecoveryBudget, {WATCHER_RECOVERY_MAX_ATTEMPTS, WATCHER_RECOVERY_WINDOW_MS} from "./RecoveryBudget.js";
const log = getLogger("build:helpers:DefinitionWatcher");

// Default filename of the workspace configuration, resolved against cwd.
const WORKSPACE_CONFIG_DEFAULT = "ui5-workspace.yaml";

// Settle window for the `definitionChanged` event, in milliseconds.
//
// A `git checkout` or branch switch writes ui5.yaml + package.json + sources within one operation;
// a trailing timer, reset on each further event, collapses that burst into a single emit. Unlike
// BuildServer's live-reload emit, a re-init needs no leading edge (re-creating the serving stack on
// the first byte of a checkout is wasteful), so this window is trailing-only. Sized to
// WATCHER_BURST_SETTLE_MS so each batch resets the window rather than terminating it (see that
// constant).
const DEFINITION_CHANGED_SETTLE_MS = WATCHER_BURST_SETTLE_MS;

/**
 * Watches the project-definition files (ui5.yaml, package.json, the workspace config, and, in
 * static-graph mode, the dependency-definition file) and emits a settled, coalesced
 * <code>definitionChanged</code> when one changes. A <code>definitionChanging</code> fires on the
 * leading edge of a burst (the first watched event, before the settle window) so an owner can react
 * to a pending change ahead of the coalesced <code>definitionChanged</code>.
 *
 * Separate from the source {@link WatchHandler}: source events drive incremental rebuilds inside
 * the BuildServer, definition events drive a full re-init of the serving stack above it. The watch
 * model is include-based: @parcel/watcher subscribes to each distinct directory and the change
 * callback drops every event whose path is not in the resolved definition-file set. The
 * <code>node_modules</code>/<code>.git</code> ignore globs only reduce OS-level watch load;
 * correctness comes from the include set.
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class DefinitionWatcher extends EventEmitter {
	#subscriptions = [];
	// Absolute paths of the definition files to react to. The subscription callback filters
	// against this set; everything else is dropped.
	#watchedFiles = new Set();
	// dir -> Set<absolute file path>: the distinct directories to subscribe, each mapped to its
	// definition files. Retained so recovery can re-subscribe the same set.
	#watchDirs = new Map();

	#settleTimer = null;
	#lastEvent = null;

	#recovering = false;
	#recoveryBudget = new RecoveryBudget();
	#destroyed = false;

	/**
	 * Resolves the watch set, subscribes to each distinct directory, awaits readiness, and returns
	 * the watcher. Mirrors BuildServer awaiting WatchHandler readiness before serving, so a change
	 * made immediately after startup is not missed.
	 *
	 * @param {object} options
	 * @param {@ui5/project/graph/ProjectGraph} options.graph The resolved project graph
	 * @param {string} [options.rootConfigPath] Custom config path for the root project (--config)
	 * @param {string} [options.workspaceConfigPath] Workspace config path (default ui5-workspace.yaml).
	 *   Omit in static-graph mode, which does not use the workspace.
	 * @param {string} [options.dependencyDefinitionPath] Static dependency-definition file
	 *   (--dependency-definition), watched when present
	 * @param {string} [options.cwd=process.cwd()] Base directory for resolving relative paths
	 * @returns {Promise<DefinitionWatcher>} The armed watcher
	 */
	static async create({graph, rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd} = {}) {
		const watcher = new DefinitionWatcher();
		await watcher.#resolveWatchSet({graph, rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd});
		await watcher.#subscribeAll();
		return watcher;
	}

	// Builds the dir -> {definition files} include set from the graph and the threaded paths.
	async #resolveWatchSet({graph, rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd}) {
		const baseDir = cwd ? path.resolve(cwd) : process.cwd();
		const resolve = (p) => (path.isAbsolute(p) ? p : path.join(baseDir, p));

		const add = (filePath) => {
			const abs = path.resolve(filePath);
			this.#watchedFiles.add(abs);
			const dir = path.dirname(abs);
			let files = this.#watchDirs.get(dir);
			if (!files) {
				files = new Set();
				this.#watchDirs.set(dir, files);
			}
			files.add(abs);
		};

		const rootName = graph.getRoot().getName();
		const rootCustomConfig = rootConfigPath ? resolve(rootConfigPath) : null;

		await graph.traverseBreadthFirst(({project}) => {
			const rootPath = project.getRootPath();
			add(path.join(rootPath, "package.json"));
			if (rootCustomConfig && project.getName() === rootName) {
				// The root carries a custom --config file, which may live outside its root.
				add(rootCustomConfig);
			} else {
				add(path.join(rootPath, "ui5.yaml"));
			}
		});

		// The workspace config lives at cwd. It may not exist yet; a create event on it still
		// matters (it can introduce workspace resolution on the next re-init).
		if (workspaceConfigPath !== undefined) {
			add(resolve(workspaceConfigPath || WORKSPACE_CONFIG_DEFAULT));
		}

		// Static-graph mode: the dependency-definition file is itself a topology definition;
		// editing it changes the graph exactly like package.json does.
		if (dependencyDefinitionPath) {
			add(resolve(dependencyDefinitionPath));
		}
	}

	// Subscribes to every distinct directory in parallel, resolving once all are armed.
	async #subscribeAll() {
		const dirs = [...this.#watchDirs.keys()];
		log.verbose(`Watching definition file(s) in: ${dirs.join(", ")}`);
		await Promise.all(dirs.map((dir) => this.#subscribeDir(dir)));
	}

	async #subscribeDir(dir) {
		const subscription = await parcelWatcher.subscribe(dir, (err, events) => {
			if (err) {
				this.#recoverWatcher(err);
				return;
			}
			for (const event of events) {
				// Include-set filter: drop every event that is not a watched definition file.
				if (!this.#watchedFiles.has(path.resolve(event.path))) {
					continue;
				}
				this.#onDefinitionEvent(event.type, event.path);
			}
		}, {ignore: ["**/node_modules/**", "**/.git/**"]});
		this.#subscriptions.push(subscription);
	}

	// Trailing-only settle: reset the timer on each event so a multi-batch operation collapses to
	// a single emit once changes have been quiet for the window.
	#onDefinitionEvent(eventType, filePath) {
		if (log.isLevelEnabled("silly")) {
			log.silly(`Definition file event: ${eventType} ${filePath}`);
		}
		this.#lastEvent = {eventType, filePath};
		if (this.#settleTimer) {
			clearTimeout(this.#settleTimer);
		} else {
			// Leading edge of a burst: a re-init (and a version change) is now known to be coming,
			// though the trailing `definitionChanged` is still a settle window away. Owners use
			// this to signal the pending change ahead of the re-resolve.
			this.emit("definitionChanging", this.#lastEvent);
		}
		this.#settleTimer = setTimeout(() => {
			this.#settleTimer = null;
			const event = this.#lastEvent;
			this.#lastEvent = null;
			this.emit("definitionChanged", event);
		}, DEFINITION_CHANGED_SETTLE_MS);
	}

	// Recreates the subscriptions after a watcher error. Modeled on BuildServer.#recoverWatcher:
	// a synchronous re-entrancy guard collapses parcel's per-path error storm into one recovery,
	// and loop protection escalates to a terminal "error" if the watcher keeps failing.
	async #recoverWatcher(err) {
		// Set synchronously before the first await so re-entrant emissions bail here.
		if (this.#destroyed || this.#recovering) {
			return;
		}
		this.#recovering = true;
		log.warn(`Definition watcher error, attempting to recover: ${err?.message ?? err}`);
		if (err?.stack) {
			log.verbose(err.stack);
		}

		if (!this.#recoveryBudget.withinBudget()) {
			this.#recovering = false;
			log.error(`Definition watcher failed to recover after ${WATCHER_RECOVERY_MAX_ATTEMPTS} attempts ` +
				`within ${WATCHER_RECOVERY_WINDOW_MS} ms. Giving up.`);
			this.emit("error", err);
			return;
		}

		try {
			// Tear down the current subscriptions and re-subscribe the same watch set. The include
			// set (#watchedFiles / #watchDirs) is unchanged; only the OS-level handles are renewed.
			// Teardown failures are ignored here: the handles are being discarded regardless, and a
			// re-subscribe failure below is what determines whether recovery succeeded.
			const subscriptions = this.#subscriptions;
			this.#subscriptions = [];
			await drainSubscriptions(subscriptions);
			if (this.#destroyed) {
				return;
			}
			await this.#subscribeAll();
			this.#recoveryBudget.recordRecovery();
			log.info(`Definition watcher recovered.`);
		} catch (recoveryErr) {
			log.error(`Definition watcher recovery failed: ${recoveryErr?.message ?? recoveryErr}`);
			this.emit("error", recoveryErr);
		} finally {
			this.#recovering = false;
		}
	}

	/**
	 * Unsubscribes all watchers. Idempotent; a second call is a no-op. Unsubscribe failures are
	 * aggregated into an <code>AggregateError</code> emitted as <code>error</code>.
	 *
	 * @returns {Promise<void>} Resolves once every subscription has been drained
	 */
	async destroy() {
		this.#destroyed = true;
		if (this.#settleTimer) {
			clearTimeout(this.#settleTimer);
			this.#settleTimer = null;
		}
		// Drain the subscriptions list first so a second destroy() is a no-op and a partial
		// failure cannot leave stale handles behind to be unsubscribed twice.
		const subscriptions = this.#subscriptions;
		this.#subscriptions = [];
		const failures = await drainSubscriptions(subscriptions);
		if (failures.length) {
			const err = new AggregateError(failures, "Failed to unsubscribe one or more definition watchers");
			this.emit("error", err);
		}
	}
}

export default DefinitionWatcher;

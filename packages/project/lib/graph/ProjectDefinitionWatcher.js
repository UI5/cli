import EventEmitter from "node:events";
import path from "node:path";
import {getLogger} from "@ui5/logger";
import {subscribe as watchSubscribe} from "../build/helpers/pollingWatcher.js";
import {drainSubscriptions, WATCHER_BURST_SETTLE_MS} from "../build/helpers/watchUtil.js";
import RecoveryBudget, {
	WATCHER_RECOVERY_MAX_ATTEMPTS, WATCHER_RECOVERY_WINDOW_MS,
} from "../build/helpers/RecoveryBudget.js";
import {DEFAULT_WORKSPACE_CONFIG_PATH} from "./helpers/workspaceConstants.js";
const log = getLogger("graph:ProjectDefinitionWatcher");

// Settle window for the `definitionChanged` event, in milliseconds.
//
// A `git checkout` or branch switch writes ui5.yaml + package.json + sources in one operation. A
// watched definition-file event starts a burst; after that, every event below the watched roots
// resets the trailing timer, so re-resolution waits until the whole checkout is quiet, not just
// until definition files stop moving. Unlike BuildServer's live-reload emit, a re-init needs no
// leading edge (re-creating the serving stack on the first byte of a checkout is wasteful), so this
// window is trailing-only. Sized to WATCHER_BURST_SETTLE_MS so each batch resets the window rather
// than ending it (see that constant).
export const DEFINITION_CHANGED_SETTLE_MS = WATCHER_BURST_SETTLE_MS;

/**
 * Watches the project-definition files (ui5.yaml, package.json, the workspace config, and, in
 * static-graph mode, the dependency-definition file) and emits a settled, coalesced
 * <code>definitionChanged</code> when one changes. A <code>definitionChanging</code> fires on the
 * leading edge of a burst (the first watched definition event, before the settle window) so an owner
 * can react to a pending change ahead of <code>definitionChanged</code>. Once the burst is open,
 * every event below the subscribed roots extends the settle window. This keeps the graph from being
 * resolved while a checkout has restored a package.json but not yet the source tree or the symlink
 * targets it references.
 *
 * Separate from the source {@link WatchHandler}: source events drive incremental rebuilds inside
 * the BuildServer, definition events drive a full re-init of the serving stack above it. The watch
 * model is include-based: the watcher subscribes to each distinct definition-file directory, and
 * only resolved definition-file paths can start a burst. Once started, non-definition events from
 * those subscriptions extend the burst's quiet window. The
 * <code>node_modules</code>/<code>.git</code> ignore globs only reduce OS-level watch load;
 * correctness comes from the include set. Project roots below <code>node_modules</code> are watched
 * without the <code>node_modules</code> ignore so their own definition files stay observable.
 *
 * @private
 * @memberof @ui5/project/graph
 */
class ProjectDefinitionWatcher extends EventEmitter {
	#subscriptions = [];
	// Absolute paths of the definition files to react to. The subscription callback filters against
	// this set; everything else is dropped.
	#watchedFiles = new Set();
	// dir -> Set<absolute file path>: the distinct directories to subscribe, each mapped to the
	// definition files that made it relevant. Kept so recovery can re-subscribe the same set.
	#watchDirs = new Map();

	#settleTimer = null;
	#lastEvent = null;

	#recovering = false;
	#recoveryBudget = new RecoveryBudget();
	#destroyed = false;

	/**
	 * Resolves the watch set, subscribes to each distinct directory, awaits readiness, and returns
	 * the watcher. Readiness is awaited before the watcher is handed out so a change made right after
	 * startup is not missed.
	 *
	 * @param {object} options
	 * @param {@ui5/project/graph/ProjectGraph} options.graph The resolved project graph
	 * @param {string} [options.rootConfigPath] Custom config path for the root project (--config)
	 * @param {string} [options.workspaceConfigPath] Workspace config path (default ui5-workspace.yaml).
	 *   Omit in static-graph mode, which does not use the workspace.
	 * @param {string} [options.dependencyDefinitionPath] Static dependency-definition file
	 *   (--dependency-definition), watched when present
	 * @param {string} [options.cwd=process.cwd()] Base directory for resolving relative paths
	 * @returns {Promise<ProjectDefinitionWatcher>} The ready watcher
	 */
	static async create({graph, rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd} = {}) {
		const watcher = new ProjectDefinitionWatcher();
		await watcher.#resolveWatchSet({graph, rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd});
		await watcher.#subscribeAll();
		return watcher;
	}

	// Builds the dir -> {definition files} include set from the graph and the threaded paths.
	async #resolveWatchSet({graph, rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd}) {
		const baseDir = cwd ? path.resolve(cwd) : process.cwd();
		const resolve = (p) => (path.isAbsolute(p) ? p : path.join(baseDir, p));

		const addWatchDir = (dirPath, filePath) => {
			const dir = path.resolve(dirPath);
			let files = this.#watchDirs.get(dir);
			if (!files) {
				files = new Set();
				this.#watchDirs.set(dir, files);
			}
			files.add(filePath);
		};

		const add = (filePath) => {
			const abs = path.resolve(filePath);
			this.#watchedFiles.add(abs);
			addWatchDir(path.dirname(abs), abs);
		};

		const rootName = graph.getRoot().getName();
		const rootCustomConfig = rootConfigPath ? resolve(rootConfigPath) : null;
		await graph.traverseBreadthFirst(({project}) => {
			const rootPath = path.resolve(project.getRootPath());
			add(path.join(rootPath, "package.json"));
			if (rootCustomConfig && project.getName() === rootName) {
				// The root carries a custom --config file, which may live outside its root.
				add(rootCustomConfig);
			} else {
				add(path.join(rootPath, "ui5.yaml"));
			}
		});

		// The workspace config lives at cwd. It may not exist yet, but a create event on it still
		// matters (it can introduce workspace resolution on the next re-init).
		if (workspaceConfigPath !== undefined) {
			add(resolve(workspaceConfigPath || DEFAULT_WORKSPACE_CONFIG_PATH));
		}

		// Static-graph mode: the dependency-definition file is a topology definition, so editing it
		// changes the graph just like editing package.json does.
		if (dependencyDefinitionPath) {
			add(resolve(dependencyDefinitionPath));
		}
	}

	// Always ignore .git: a checkout rewrites it, but it is never a definition file. A top-level root
	// also ignores node_modules to keep the watch small; a root that lives below node_modules keeps it
	// watched so its own ui5.yaml/package.json still fire events.
	#getIgnoreGlobs(dir) {
		const segments = path.resolve(dir).split(path.sep);
		if (segments.includes("node_modules")) {
			return ["**/.git/**"];
		}
		return ["**/node_modules/**", "**/.git/**"];
	}

	// Subscribes to every distinct directory in parallel, resolving once all are ready.
	async #subscribeAll() {
		const dirs = [...this.#watchDirs.keys()];
		log.verbose(`Watching definition file(s) in: ${dirs.join(", ")}`);
		await Promise.all(dirs.map((dir) => this.#subscribeDir(dir)));
	}

	async #subscribeDir(dir) {
		const subscription = await watchSubscribe(dir, (err, events) => {
			if (err) {
				this.#recoverWatcher(err);
				return;
			}
			for (const event of events) {
				if (this.#watchedFiles.has(path.resolve(event.path))) {
					this.#onDefinitionEvent(event.type, event.path);
					continue;
				}

				// Source events must not start a re-init. But once a definition-file event has opened
				// a burst, any further event from parcel means the filesystem is not quiet yet. Reset
				// the timer so graph creation sees the settled checkout, including source files and
				// symlink targets referenced by newly-restored package.json files.
				this.#onNonDefinitionEvent(event.type, event.path);
			}
		}, {ignore: this.#getIgnoreGlobs(dir)});
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
			this.#scheduleSettle();
		} else {
			// Leading edge of a burst: a re-init (and a version change) is now known to be coming,
			// though the trailing `definitionChanged` is still a settle window away. Owners use this
			// to signal the pending change ahead of the re-resolve.
			this.emit("definitionChanging", this.#lastEvent);
			this.#scheduleSettle();
		}
	}

	#onNonDefinitionEvent(eventType, filePath) {
		if (!this.#settleTimer) {
			return;
		}
		if (log.isLevelEnabled("silly")) {
			log.silly(`Definition burst extended by file event: ${eventType} ${filePath}`);
		}
		this.#scheduleSettle();
	}

	#scheduleSettle() {
		if (this.#settleTimer) {
			clearTimeout(this.#settleTimer);
		}
		this.#settleTimer = setTimeout(() => {
			this.#settleTimer = null;
			const event = this.#lastEvent;
			this.#lastEvent = null;
			this.emit("definitionChanged", event);
		}, DEFINITION_CHANGED_SETTLE_MS);
	}

	// Recreates the subscriptions after a watcher error. A synchronous re-entrancy guard collapses
	// parcel's per-path error storm into one recovery, and loop protection escalates to a terminal
	// "error" if the watcher keeps failing.
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
			// Teardown failures are ignored here: the handles are discarded either way, and the
			// re-subscribe below is what decides whether recovery succeeded.
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
		// Drain the subscriptions list first so a second destroy() is a no-op and a partial failure
		// cannot leave stale handles to be unsubscribed twice.
		const subscriptions = this.#subscriptions;
		this.#subscriptions = [];
		const failures = await drainSubscriptions(subscriptions);
		if (failures.length) {
			const err = new AggregateError(failures, "Failed to unsubscribe one or more definition watchers");
			this.emit("error", err);
		}
	}
}

export default ProjectDefinitionWatcher;

// One internal entry point for @ui5/server's live re-resolution support: the definition watcher plus
// the two helpers the Supervisor drives alongside it, the graph-settle acceptance gate and the
// recovery budget.
export {waitForProjectGraphSettled} from "./projectGraphSettleWatcher.js";
export {default as RecoveryBudget} from "../build/helpers/RecoveryBudget.js";

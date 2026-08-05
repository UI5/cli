import path from "node:path";
import {getLogger} from "@ui5/logger";
import {subscribe as watchSubscribe} from "../build/helpers/fileWatcher.js";
import {drainSubscriptions, WATCHER_BURST_SETTLE_MS} from "../build/helpers/watchUtil.js";
import {findExistingDir} from "../utils/fsHelper.js";

const log = getLogger("graph:projectGraphSettleWatcher");

export const PROJECT_GRAPH_SETTLE_MS = WATCHER_BURST_SETTLE_MS;

function isDescendantOf(dir, parentDir) {
	const relative = path.relative(parentDir, dir);
	return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pruneCoveredDirs(dirs) {
	return dirs.filter((dir) => {
		return !dirs.some((otherDir) => otherDir !== dir && isDescendantOf(dir, otherDir));
	});
}

function toGraphArray(graphs) {
	return Array.isArray(graphs) ? graphs : [graphs];
}

async function resolveProjectRootWatchDirs(graphs) {
	const dirs = new Set();
	for (const graph of toGraphArray(graphs)) {
		await graph.traverseBreadthFirst(({project}) => {
			dirs.add(path.resolve(project.getRootPath()));
		});
	}
	const existingDirs = await Promise.all([...dirs].map((dir) => findExistingDir(dir)));
	return pruneCoveredDirs([...new Set(existingDirs)]).sort();
}

function getAbortError(signal) {
	return signal?.reason ?? Object.assign(new Error("Project graph settle wait aborted"), {code: "ABORT_ERR"});
}

/**
 * Waits until the resolved graph's project roots have settled for one watcher settle window.
 *
 * Deliberately broader than {@link ProjectDefinitionWatcher}: this is a short-lived acceptance gate
 * used after a failed re-resolve. At that point a later resolve might succeed while a checkout or
 * install is still restoring sources below newly resolved project roots. The supervisor passes both
 * the candidate graph and the previous last-good graph so roots missing from an early candidate are
 * still observed. Missing roots are watched at their nearest existing ancestor, and no
 * <code>node_modules</code> ignore is used, which scales to nested npm dependency layouts without the
 * long-lived definition watcher having to guess stable ancestors.
 *
 * @param {@ui5/project/graph/ProjectGraph|@ui5/project/graph/ProjectGraph[]} graphs Graph(s) to observe
 * @param {object} [options]
 * @param {number} [options.settleMs=PROJECT_GRAPH_SETTLE_MS] Settle window in milliseconds
 * @param {AbortSignal} [options.signal] Optional cancellation signal
 * @returns {Promise<void>} Resolves after the graph roots have been quiet for the settle window
 * @private
 * @memberof @ui5/project/graph
 */
export async function waitForProjectGraphSettled(graphs, {
	settleMs = PROJECT_GRAPH_SETTLE_MS,
	signal,
} = {}) {
	signal?.throwIfAborted();
	const dirs = await resolveProjectRootWatchDirs(graphs);
	if (!dirs.length) {
		return;
	}

	log.verbose(`Waiting for project graph roots to settle: ${dirs.join(", ")}`);

	const subscriptions = [];
	let settleTimer = null;
	let finished = false;
	let removeAbortListener = null;
	let resolveWait;
	let rejectWait;
	const wait = new Promise((resolve, reject) => {
		resolveWait = resolve;
		rejectWait = reject;
	});

	async function cleanup() {
		if (settleTimer) {
			clearTimeout(settleTimer);
			settleTimer = null;
		}
		removeAbortListener?.();
		removeAbortListener = null;
		const failures = await drainSubscriptions(subscriptions.splice(0));
		if (failures.length) {
			throw new AggregateError(failures, "Failed to unsubscribe one or more graph-settle watchers");
		}
	}

	function finish(err) {
		if (finished) {
			return;
		}
		finished = true;
		Promise.resolve()
			.then(cleanup)
			.then(() => {
				if (err) {
					rejectWait(err);
				} else {
					resolveWait();
				}
			}, (cleanupErr) => {
				if (err) {
					rejectWait(new AggregateError([err, cleanupErr], "Project graph settle wait failed"));
				} else {
					rejectWait(cleanupErr);
				}
			});
	}

	function scheduleSettle() {
		if (finished) {
			return;
		}
		if (settleTimer) {
			clearTimeout(settleTimer);
		}
		settleTimer = setTimeout(() => {
			finish();
		}, settleMs);
	}

	try {
		if (signal) {
			const onAbort = () => finish(getAbortError(signal));
			signal.addEventListener("abort", onAbort, {once: true});
			removeAbortListener = () => signal.removeEventListener("abort", onAbort);
		}

		await Promise.all(dirs.map(async (dir) => {
			const subscription = await watchSubscribe(dir, (err, events) => {
				if (err) {
					finish(err);
					return;
				}
				if (!events.length) {
					return;
				}
				if (log.isLevelEnabled("silly")) {
					for (const event of events) {
						log.silly(`Project graph settle event: ${event.type} ${event.path}`);
					}
				}
				scheduleSettle();
			}, {ignore: ["**/.git/**"]});
			if (finished) {
				await subscription.unsubscribe();
				return;
			}
			subscriptions.push(subscription);
		}));
		signal?.throwIfAborted();
		scheduleSettle();
	} catch (err) {
		finish(err);
	}

	return wait;
}

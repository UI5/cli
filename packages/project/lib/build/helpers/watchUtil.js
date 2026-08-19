import {trace} from "./teardownTrace.js";

/**
 * Settle window (ms) for collapsing a burst of filesystem events into one trailing action. Shared
 * by every Parcel watcher in the build layer.
 *
 * The Parcel watcher coalesces its own events up to MAX_WAIT_TIME (500 ms): during a continuous
 * operation (a `git checkout`, an editor's save-all, a bundler writing many files) it delivers
 * batches up to 500 ms apart, not one batch ended by a quiet period. To collapse such a burst the
 * window must sit above that cap, so each new batch resets it instead of ending it. 550 ms leaves a
 * small margin. Below 500 ms the coalescing breaks.
 *
 * @private
 * @type {number}
 */
export const WATCHER_BURST_SETTLE_MS = 550;


/**
 * Unsubscribes every subscription and returns the failures. Callers drain their list to
 * <code>[]</code> before calling, so a second drain is a no-op and a partial failure cannot leave
 * stale handles to be unsubscribed twice. Each <code>unsubscribe()</code> is attempted even if an
 * earlier one rejects, so one misbehaving subscription cannot leave the others subscribed.
 *
 * Unsubscribes run <b>sequentially</b>, not in parallel: <code>@parcel/watcher</code> has a data
 * race on its global shared-backend registry between subscribe and unsubscribe
 * (parcel-bundler/watcher#259). Firing every <code>unsubscribe()</code> at once raced that registry
 * and access-violated (<code>0xC0000005</code>) mid-teardown on Windows, where all subscriptions
 * share one backend thread. Draining one at a time keeps each native teardown from overlapping the
 * next. The list is small (one subscription per watched directory) and this only runs at teardown,
 * so the lost concurrency does not matter.
 *
 * @private
 * @param {object[]} subscriptions Subscriptions to drain, each exposing an async
 *   <code>unsubscribe()</code>
 * @returns {Promise<Error[]>} The reasons of any rejected <code>unsubscribe()</code> calls, empty
 *   when all succeeded
 */
export async function drainSubscriptions(subscriptions) {
	trace(`drainSubscriptions: draining ${subscriptions.length} subscription(s)`);
	const failures = [];
	let i = 0;
	for (const subscription of subscriptions) {
		trace(`drainSubscriptions: unsubscribe #${i} start`);
		try {
			await subscription.unsubscribe();
			trace(`drainSubscriptions: unsubscribe #${i} done`);
		} catch (err) {
			trace(`drainSubscriptions: unsubscribe #${i} threw: ${err?.message ?? err}`);
			failures.push(err);
		}
		i++;
	}
	trace(`drainSubscriptions: all drained`);
	return failures;
}

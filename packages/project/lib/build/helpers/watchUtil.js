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
 * Unsubscribes every subscription in parallel and returns the failures. Callers drain their list to
 * <code>[]</code> before calling, so a second drain is a no-op and a partial failure cannot leave
 * stale handles to be unsubscribed twice. Running in parallel and collecting failures keeps one
 * misbehaving subscription from taking down the others.
 *
 * @private
 * @param {object[]} subscriptions Subscriptions to drain, each exposing an async
 *   <code>unsubscribe()</code>
 * @returns {Promise<Error[]>} The reasons of any rejected <code>unsubscribe()</code> calls, empty
 *   when all succeeded
 */
export async function drainSubscriptions(subscriptions) {
	trace(`drainSubscriptions: draining ${subscriptions.length} subscription(s)`);
	// UI5_WATCH_SERIAL_DRAIN=1 unsubscribes one at a time instead of in parallel, to test whether
	// concurrent native @parcel/watcher unsubscribe() calls are what trigger the 0xC0000005 crash on
	// Windows. Diagnostic only; the default stays parallel.
	if (process.env.UI5_WATCH_SERIAL_DRAIN === "1") {
		const failures = [];
		for (let i = 0; i < subscriptions.length; i++) {
			trace(`drainSubscriptions: serial unsubscribe ${i + 1}/${subscriptions.length} start`);
			try {
				await subscriptions[i].unsubscribe();
			} catch (err) {
				failures.push(err);
			}
			trace(`drainSubscriptions: serial unsubscribe ${i + 1}/${subscriptions.length} done`);
		}
		trace(`drainSubscriptions: all drained (serial)`);
		return failures;
	}
	const results = await Promise.allSettled(subscriptions.map((s) => s.unsubscribe()));
	trace(`drainSubscriptions: all drained`);
	return results.filter((r) => r.status === "rejected").map((r) => r.reason);
}

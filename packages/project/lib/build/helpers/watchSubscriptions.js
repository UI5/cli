/**
 * Unsubscribes every subscription in parallel and returns the failures. Callers drain their
 * subscription list to <code>[]</code> before calling, so a second drain is a no-op and a partial
 * failure cannot leave stale handles behind to be unsubscribed twice. Running in parallel and
 * collecting failures keeps a single misbehaving subscription from leaking the others.
 *
 * @private
 * @param {object[]} subscriptions Subscriptions to drain, each exposing an async
 *   <code>unsubscribe()</code>
 * @returns {Promise<Error[]>} The reasons of any rejected <code>unsubscribe()</code> calls, empty
 *   when all succeeded
 */
export async function drainSubscriptions(subscriptions) {
	const results = await Promise.allSettled(subscriptions.map((s) => s.unsubscribe()));
	return results.filter((r) => r.status === "rejected").map((r) => r.reason);
}

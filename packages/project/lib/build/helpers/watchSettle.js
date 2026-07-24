/**
 * Settle window (ms) for collapsing a filesystem-event burst into a single trailing action, shared
 * by every @parcel/watcher consumer in the build layer.
 *
 * @parcel/watcher caps its own event coalescing at MAX_WAIT_TIME (500 ms): during a continuous
 * operation (a `git checkout`, an editor's save-all, a bundler writing many files) it delivers
 * events as batches up to 500 ms apart rather than one quiet-terminated batch. A window that
 * collapses such a burst must therefore sit <em>above</em> that cap, so each further batch resets
 * the window rather than prematurely terminating it; 550 ms adds a small margin. Lowering it below
 * 500 ms breaks the coalescing relationship.
 *
 * @private
 * @type {number}
 */
export const WATCHER_BURST_SETTLE_MS = 550;

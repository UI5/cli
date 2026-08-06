/**
 * Recognized error names that signal a cooperative abort — a triggered
 * AbortSignal or a mid-build source change — rather than a genuine build /
 * validation failure. Callers pass the signal so a raced abort (signal
 * aborted, error already thrown from something else) still classifies as
 * an abort.
 *
 * @param {Error} err
 * @param {AbortSignal} [signal] Optional signal; treated as aborted when its
 *   `aborted` flag is set even if `err` doesn't carry a recognized name.
 * @returns {boolean}
 */
export function isAbortError(err, signal) {
	return signal?.aborted === true ||
		err?.name === "AbortBuildError" ||
		err?.name === "SourceChangedDuringBuildError" ||
		err?.name === "AbortError";
}

/**
 * Whether a build error is a filesystem-not-found error, i.e. a source file that
 * disappeared while the build was reading it. During a `git checkout` the watcher
 * delivers its change events in coalesced batches, so a file can already be gone on
 * disk before its delete event lands. A build that reads such a file then fails with
 * ENOENT while `#resourceChangeQueue` is still empty and the signal is not yet aborted,
 * which the timing-based classifier would otherwise treat as a genuine, gate-latching
 * failure. The error nature says otherwise: the tree moved under the build and a retry
 * against the settled tree resolves it, so it is transient regardless of timing.
 *
 * Scoped to `err.code === "ENOENT"`. A missing dependency the build reports through a
 * message string (e.g. a less import that cannot be resolved) has no such code and may
 * be a genuine authoring error, so it stays on the deterministic path.
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isFileNotFoundError(err) {
	return err?.code === "ENOENT";
}


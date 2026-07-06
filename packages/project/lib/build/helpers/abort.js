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

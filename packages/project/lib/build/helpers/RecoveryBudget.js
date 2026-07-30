// Default loop-protection budget for watcher recovery: more than WATCHER_RECOVERY_MAX_ATTEMPTS
// recoveries within WATCHER_RECOVERY_WINDOW_MS is treated as unrecoverable by the owning watcher.
export const WATCHER_RECOVERY_MAX_ATTEMPTS = 5;
export const WATCHER_RECOVERY_WINDOW_MS = 60000;

/**
 * Sliding-window loop protection for watcher recovery. A watcher that keeps failing would otherwise
 * cycle error -> recover -> error forever; this caps recoveries to <code>maxAttempts</code> within a
 * trailing <code>windowMs</code>. Check {@link withinBudget} before a recovery and call
 * {@link recordRecovery} to count one occurrence against the window.
 *
 * The caller chooses what {@link recordRecovery} counts: an owner whose failed recovery is terminal
 * records on success, so the budget catches a recovery that keeps succeeding and recurring; an owner
 * that retries after a failed recovery records at schedule time, so an attempt that never completes
 * still fills the budget and stops the retry loop. Each owner holds its own instance, so a fault in
 * one does not drain another's budget. The owner keeps the re-entrancy guard, the recovery work, and
 * the escalation on exhaustion.
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class RecoveryBudget {
	#timestamps = [];
	#maxAttempts;
	#windowMs;

	constructor(maxAttempts = WATCHER_RECOVERY_MAX_ATTEMPTS, windowMs = WATCHER_RECOVERY_WINDOW_MS) {
		this.#maxAttempts = maxAttempts;
		this.#windowMs = windowMs;
	}

	/**
	 * Prunes recoveries older than the window and reports whether another occurrence fits the budget.
	 *
	 * @returns {boolean} <code>true</code> if fewer than <code>maxAttempts</code> recoveries remain
	 *   within the trailing window
	 */
	withinBudget() {
		this.#prune();
		return this.#timestamps.length < this.#maxAttempts;
	}

	/**
	 * Records one recovery occurrence against the window. What the occurrence means (a completed
	 * recovery or a scheduled attempt) is the caller's choice; see the class description.
	 *
	 * @returns {void}
	 */
	recordRecovery() {
		this.#timestamps.push(Date.now());
	}

	// Drops recoveries that have aged out of the trailing window.
	#prune() {
		const now = Date.now();
		this.#timestamps = this.#timestamps.filter((ts) => now - ts < this.#windowMs);
	}
}

export default RecoveryBudget;

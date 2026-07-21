// Default loop-protection budget for watcher recovery: more than WATCHER_RECOVERY_MAX_ATTEMPTS
// recoveries within WATCHER_RECOVERY_WINDOW_MS is treated as unrecoverable by the owning watcher.
export const WATCHER_RECOVERY_MAX_ATTEMPTS = 5;
export const WATCHER_RECOVERY_WINDOW_MS = 60000;

/**
 * Sliding-window loop protection for watcher recovery. A watcher that keeps failing would otherwise
 * cycle error → recover → error forever; this caps recoveries to <code>maxAttempts</code> within a
 * trailing <code>windowMs</code>. Counts <em>completed</em> recoveries: check {@link withinBudget}
 * before attempting one and call {@link recordRecovery} once it succeeds.
 *
 * Owned per watcher (the source {@link WatchHandler}'s recovery in BuildServer and the
 * {@link DefinitionWatcher} each hold their own), so a fault in one does not consume the other's
 * budget. The re-entrancy guard, the recovery work, and the escalation on exhaustion stay with the
 * owner, which knows how to escalate (a state transition, a terminal event).
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
	 * Prunes recoveries older than the window and reports whether another attempt fits the budget.
	 *
	 * @returns {boolean} <code>true</code> if fewer than <code>maxAttempts</code> recoveries remain
	 *   within the trailing window
	 */
	withinBudget() {
		const now = Date.now();
		this.#timestamps = this.#timestamps.filter((ts) => now - ts < this.#windowMs);
		return this.#timestamps.length < this.#maxAttempts;
	}

	/**
	 * Records a completed recovery against the window.
	 *
	 * @returns {void}
	 */
	recordRecovery() {
		this.#timestamps.push(Date.now());
	}
}

export default RecoveryBudget;

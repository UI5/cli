/**
 * Fixed set of time granularities [TaskUtil#getTime]{@link @ui5/project/build/helpers/TaskUtil#getTime}
 * accepts. Each names the bucket at which a time-derived task output is stable: reading at
 * <code>"year"</code> means "re-run only when the calendar year changes". Sub-hour buckets are
 * deliberately absent, since they rarely name a stable output and would miss the cache on almost
 * every build.
 *
 * @type {string[]}
 */
export const TIME_GRANULARITIES = ["year", "month", "day", "hour"];

function pad(value) {
	return String(value).padStart(2, "0");
}

/**
 * Quantizes a point in time to a stable string for the given granularity.
 *
 * The counterpart accessors [TaskUtil#getTime]{@link @ui5/project/build/helpers/TaskUtil#getTime}
 * (record side) and
 * [ProjectBuildContext#resolveInputValue]{@link @ui5/project/build/helpers/ProjectBuildContext}
 * (lookup side) both quantize through this function,
 * so the value recorded during one build and the value re-derived during a later build are equal
 * whenever they fall in the same bucket. Two builds within the same bucket produce the same string
 * and hit the cache; a rolled-over bucket produces a different string and re-runs the task.
 *
 * Local time throughout, matching the <code>new Date().getFullYear()</code> reads these accessors
 * replace. Record and lookup run on the same machine, so the local-time bucket agrees across builds;
 * a cache shared across machines in different timezones could disagree at a bucket boundary, which
 * mirrors the existing local-machine assumptions of the dev cache.
 *
 * The <code>date</code> is mandatory: both callers pass the build run's shared timestamp (from
 * [BuildContext#getBuildTime]{@link @ui5/project/build/helpers/BuildContext}) so every quantization
 * in a run resolves against the same instant. Requiring it stops a caller from silently falling back
 * to a fresh <code>new Date()</code>, which would reintroduce intra-run divergence.
 *
 * @param {string} granularity One of {@link TIME_GRANULARITIES}
 * @param {Date} date Point in time to quantize (typically the build run's shared timestamp)
 * @returns {string} Stable bucket string, e.g. <code>"2026"</code> for <code>"year"</code> or
 *   <code>"2026-09-25T14"</code> for <code>"hour"</code>
 * @throws {Error} If the granularity is not one of {@link TIME_GRANULARITIES}, or if
 *   <code>date</code> is not a <code>Date</code>
 */
export function quantizeTime(granularity, date) {
	if (!TIME_GRANULARITIES.includes(granularity)) {
		throw new Error(
			`Invalid time granularity "${granularity}". Expected one of: ${TIME_GRANULARITIES.join(", ")}`);
	}
	if (!(date instanceof Date)) {
		throw new Error(`Missing or invalid 'date' argument: expected a Date instance`);
	}
	// Buckets nest, so each coarser bucket is a prefix of the next finer one.
	const year = String(date.getFullYear());
	const month = `${year}-${pad(date.getMonth() + 1)}`;
	const day = `${month}-${pad(date.getDate())}`;
	const hour = `${day}T${pad(date.getHours())}`;
	return {year, month, day, hour}[granularity];
}

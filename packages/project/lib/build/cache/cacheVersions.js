// Anchored pattern for a build-cache version directory name (e.g. "v0_10").
// Rejects leading zeros — only canonical forms are accepted (v0_01 does not match).
const VERSION_DIR_REGEX = /^v(0|[1-9]\d*)_(0|[1-9]\d*)$/;

/**
 * Tests whether a directory name is a canonical build-cache version directory.
 *
 * This is a pure pattern check — the numeric components are never extracted, since the allowlist
 * model in {@link classifyVersionDirs} decides deletion by set membership, not by comparison.
 *
 * @param {string} name Directory name to test (e.g. "v0_10")
 * @returns {boolean} True if `name` matches `^v(0|[1-9]\d*)_(0|[1-9]\d*)$`. The authoritative
 *   current version is {@link CACHE_VERSION} in CacheManager.js.
 */
export function isCacheVersionDir(name) {
	return VERSION_DIR_REGEX.test(name);
}

/**
 * Classifies a list of directory names into three mutually exclusive buckets.
 *
 * The current version is always skipped (handled separately by the caller). As a defense-in-depth
 * measure, `current` is never placed in `deletable` even if it appears in `known`.
 *
 * @param {string[]} names Directory names to classify
 * @param {object} opts
 * @param {string[]} opts.known Allowlist of version names that are safe to delete
 * @param {string} opts.current Current active version — always skipped, never deletable
 * @returns {{deletable: string[], unknown: string[], foreign: string[]}}
 *   - `deletable`: matches version pattern and is in the allowlist (not current) → safe to remove
 *   - `unknown`: matches version pattern, not in allowlist, and not current → warn, never delete
 *   - `foreign`: does not match version pattern → silently ignored
 */
export function classifyVersionDirs(names, {known, current}) {
	const knownSet = new Set(known);
	const deletable = [];
	const unknown = [];
	const foreign = [];

	for (const name of names) {
		if (name === current) {
			continue;
		}
		if (!isCacheVersionDir(name)) {
			foreign.push(name);
			continue;
		}
		if (knownSet.has(name)) {
			deletable.push(name);
		} else {
			unknown.push(name);
		}
	}

	return {deletable, unknown, foreign};
}

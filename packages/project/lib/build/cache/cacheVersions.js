// Anchored pattern; rejects leading zeros (v0_01 is invalid — only canonical forms accepted).
const VERSION_REGEX = /^v(0|[1-9]\d*)_(0|[1-9]\d*)$/;

/**
 * Parses a cache version directory name into its numeric components.
 *
 * @param {string} name Directory name to parse (e.g. "v0_10")
 * @returns {{major: number, minor: number}|null} Parsed version, or null if name does not match
 *   the pattern `^v(0|[1-9]\d*)_(0|[1-9]\d*)$`. Leading zeros are not accepted (e.g. "v0_01"
 *   returns null). The authoritative current version is {@link CACHE_VERSION} in CacheManager.js.
 */
export function parseCacheVersion(name) {
	const match = VERSION_REGEX.exec(name);
	if (!match) {
		return null;
	}
	return {major: parseInt(match[1], 10), minor: parseInt(match[2], 10)};
}

/**
 * Compares two cache version strings numerically (major then minor).
 *
 * Both strings must be valid version names; call {@link parseCacheVersion} first if
 * there is any chance they are malformed — this function throws on invalid input.
 *
 * @param {string} a First version string (e.g. "v0_9")
 * @param {string} b Second version string (e.g. "v0_10")
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 * @throws {Error} If either argument does not match the version pattern
 */
export function compareCacheVersion(a, b) {
	const va = parseCacheVersion(a);
	const vb = parseCacheVersion(b);
	if (!va) throw new Error(`Invalid cache version: "${a}"`);
	if (!vb) throw new Error(`Invalid cache version: "${b}"`);

	if (va.major !== vb.major) {
		return va.major < vb.major ? -1 : 1;
	}
	if (va.minor !== vb.minor) {
		return va.minor < vb.minor ? -1 : 1;
	}
	return 0;
}

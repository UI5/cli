

/**
 * Cache modes for maven consumption
 *
 * @public
 * @readonly
 * @enum {string}
 * @property {string} Default Cache everything, invalidate after 9 hours
 * @property {string} Force Use cache only
 * @property {string} Off Do not use the cache
 * @module @ui5/project/ui5Framework/maven/CacheMode
 */
export default {
	Default: "Default",
	Force: "Force",
	Off: "Off"
};

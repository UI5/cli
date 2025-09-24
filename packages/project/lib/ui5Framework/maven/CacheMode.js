

/**
 * Cache modes for maven consumption
 *
 * @public
 * @readonly
 * @enum {string}
 * @property {string} Default Cache everything, invalidate after 9 hours
 * @property {string} Force Use cache only. Do not send any requests to the repository
 * @property {string} Off Invalidate the cache and update from the repository
 * @module @ui5/project/ui5Framework/maven/CacheMode
 */
export default {
	Default: "Default",
	Force: "Force",
	Off: "Off"
};

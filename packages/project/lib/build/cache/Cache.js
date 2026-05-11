/**
 * Cache modes for building UI5 projects
 *
 * @public
 * @readonly
 * @enum {string}
 * @property {string} Default Use cache if available
 * @property {string} Force Use cache only (if it's unavailable or invalid, the build fails)
 * @property {string} ReadOnly Do not create or update any cache but make use of a cache if available
 * @property {string} Off Do not use any cache and always rebuild
 * @module @ui5/project/build/cache/Cache
 */
export default {
	Default: "Default",
	Force: "Force",
	ReadOnly: "ReadOnly",
	Off: "Off"
};

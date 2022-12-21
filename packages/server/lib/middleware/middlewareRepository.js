const middlewareInfos = {
	compression: {path: "compression"},
	cors: {path: "cors"},
	csp: {path: "./csp.js"},
	serveResources: {path: "./serveResources.js"},
	serveIndex: {path: "./serveIndex.js"},
	discovery: {path: "./discovery.js"},
	versionInfo: {path: "./versionInfo.js"},
	serveThemes: {path: "./serveThemes.js"},
	testRunner: {path: "./testRunner.js"},
	nonReadRequests: {path: "./nonReadRequests.js"}
};

// see  @ui5/server/internal/middlewareRepository#getMiddleware
async function getMiddleware(middlewareName) {
	const middlewareInfo = middlewareInfos[middlewareName];

	if (!middlewareInfo) {
		throw new Error(`middlewareRepository: Unknown Middleware ${middlewareName}`);
	}
	try {
		const {default: middleware} = await import(middlewareInfo.path);
		return {
			middleware
		};
	} catch (err) {
		throw new Error(
			`middlewareRepository: Failed to require middleware module for ${middlewareName}:\n${err.stack}`);
	}
}
/**
 * @private
 * @typedef {object} module:@ui5/server/internal/middlewareRepository~Middleware
 * @property {object} middleware The middleware
 */

/**
 * @private
 * @module @ui5/server/internal/middlewareRepository
 * @borrows getMiddleware as getMiddleware
 */
export default {

	/**
	 * Determines the desired middleware
	 *
	 * @private
	 * @static
	 * @function
	 * @param {string} middlewareName The name of the middleware
	 * @returns {module:@ui5/server/internal/middlewareRepository~Middleware} The middleware
	 */
	getMiddleware: getMiddleware
};

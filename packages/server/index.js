/**
 * @module @ui5/server
 * @public
 */
module.exports = {
	/**
	 * @type {import('./lib/server')}
	 */
	server: "./lib/server",
	/**
	 * @type {import('./lib/sslUtil')}
	 */
	sslUtil: "./lib/sslUtil",
	/**
	 * @type {import('./lib/middleware/middlewareRepository')}
	 */
	middlewareRepository: "./lib/middleware/middlewareRepository"
};

function exportModules(exportRoot, modulePaths) {
	for (const moduleName of Object.keys(modulePaths)) {
		if (typeof modulePaths[moduleName] === "object") {
			exportRoot[moduleName] = {};
			exportModules(exportRoot[moduleName], modulePaths[moduleName]);
		} else {
			Object.defineProperty(exportRoot, moduleName, {
				get() {
					return require(modulePaths[moduleName]);
				}
			});
		}
	}
}

exportModules(module.exports, JSON.parse(JSON.stringify(module.exports)));

/**
 * @module @ui5/server
 * @public
 */
const modules = {
	server: "./lib/server",
	sslUtil: "./lib/sslUtil",
	middlewareRepository: "./lib/middleware/middlewareRepository"
};

function exportModules(exportRoot, modulePaths) {
	for (const moduleName in modulePaths) {
		if (Object.prototype.hasOwnProperty.call(modulePaths, moduleName)) {
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
}
exportModules(module.exports, modules);

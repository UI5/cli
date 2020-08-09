const createVersionInfoProcessor = require("@ui5/builder").processors.versionInfoGenerator;

/**
 * Creates and returns the middleware to create the version info as json object.
 *
 * @module @ui5/server/middleware/versionInfo
 * @param {object} parameters Parameters
 * @param {module:@ui5/server.middleware.MiddlewareManager.middlewareResources} parameters.resources Parameters
 * @param {object} parameters.tree Project tree
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources, tree: project}) {
	return function versionInfo(req, res, next) {
		resources.dependencies.byGlob("/resources/**/.library")
			.then((resources) => {
				resources.sort((a, b) => {
					return a._project.metadata.name.localeCompare(b._project.metadata.name);
				});
				return createVersionInfoProcessor({
					options: {
						rootProjectName: project.metadata.name,
						rootProjectVersion: project.version,
						libraryInfos: resources.map((dotLibResource) => {
							return {
								name: dotLibResource._project.metadata.name,
								version: dotLibResource._project.version
							};
						})
					}
				});
			})
			.then(([versionInfoResource]) => {
				return versionInfoResource.getBuffer();
			})
			.then((versionInfoContent) => {
				res.writeHead(200, {
					"Content-Type": "application/json"
				});
				res.end(versionInfoContent.toString());
			})
			.catch((err) => {
				next(err);
			});
	};
}

module.exports = createMiddleware;

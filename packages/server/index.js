/**
 * @module @ui5/server
 * @public
 */
module.exports = {
	server: require("./lib/server"),
	sslUtil: require("./lib/sslUtil"),
	middlewareRepository: require("./lib/middleware/middlewareRepository"),

	// Legacy middleware export. Still private.
	middleware: {
		csp: require("./lib/middleware/csp"),
		discovery: mapLegacyMiddlewareArguments(require("./lib/middleware/discovery")),
		nonReadRequests: mapLegacyMiddlewareArguments(require("./lib/middleware/discovery")),
		serveIndex: mapLegacyMiddlewareArguments(require("./lib/middleware/serveIndex")),
		serveResources: mapLegacyMiddlewareArguments(require("./lib/middleware/serveResources")),
		serveThemes: mapLegacyMiddlewareArguments(require("./lib/middleware/serveThemes")),
		versionInfo: mapLegacyMiddlewareArguments(require("./lib/middleware/versionInfo")),
	}
};

function mapLegacyMiddlewareArguments(module) {
	// Old arguments was a single object with optional properties
	// - resourceCollections
	// - tree
	return function({resourceCollections, tree} = {}) {
		const resources = {};
		resources.all = resourceCollections.combo;
		resources.rootProject = resourceCollections.source;
		resources.dependencies = resourceCollections.dependencies;

		return module({
			resources,
			tree
		});
	};
}

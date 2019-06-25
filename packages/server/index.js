/**
 * @module @ui5/server
 * @public
 */
const modules = {
	server: "./lib/server",
	sslUtil: "./lib/sslUtil",
	middlewareRepository: "./lib/middleware/middlewareRepository",

	// Legacy middleware export. Still private.
	middleware: {
		csp: "./lib/middleware/csp",
		discovery: "./lib/middleware/discovery",
		nonReadRequests: "./lib/middleware/discovery",
		serveIndex: "./lib/middleware/serveIndex",
		serveResources: "./lib/middleware/serveResources",
		serveThemes: "./lib/middleware/serveThemes",
		versionInfo: "./lib/middleware/versionInfo",
	}
};

const LEGACY_MIDDLEWARE = [
	"discovery", "nonReadRequests", "serveIndex",
	"serveResources", "serveThemes", "versionInfo"
];
function exportModules(exportRoot, modulePaths) {
	for (const moduleName in modulePaths) {
		if (Object.prototype.hasOwnProperty.call(modulePaths, moduleName)) {
			if (typeof modulePaths[moduleName] === "object") {
				exportRoot[moduleName] = {};
				exportModules(exportRoot[moduleName], modulePaths[moduleName]);
			} else {
				Object.defineProperty(exportRoot, moduleName, {
					get() {
						let m = require(modulePaths[moduleName]);
						if (LEGACY_MIDDLEWARE.includes(moduleName)) {
							m = mapLegacyMiddlewareArguments(m);
						}
						return m;
					}
				});
			}
		}
	}
}

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

exportModules(module.exports, modules);

const createVersionInfoProcessor = require("@ui5/builder").processors.versionInfoGenerator;
const createManifestProcessor = require("@ui5/builder").processors.manifestCreator;

const MANIFEST_JSON = "manifest.json";

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
	return async function versionInfo(req, res, next) {
		try {
			const dependencies = resources.dependencies;
			const dotLibResources = await dependencies.byGlob("/resources/**/.library");

			dotLibResources.sort((a, b) => {
				return a._project.metadata.name.localeCompare(b._project.metadata.name);
			});

			const libraryInfosPromises = dotLibResources.map(async (dotLibResource) => {
				const namespace = dotLibResource._project.metadata.namespace;
				const manifestResources = await dependencies.byGlob(`/resources/${namespace}/**/${MANIFEST_JSON}`);
				let libraryManifest = manifestResources.find((manifestResource) => {
					return manifestResource.getPath() === `/resources/${namespace}/${MANIFEST_JSON}`;
				});
				const embeddedManifests =
					manifestResources.filter((manifestResource) => manifestResource !== libraryManifest);
				if (!libraryManifest) {
					const extensions = "js,json,library,less,css,theming,theme,properties";
					const libResources = await dependencies.byGlob(`/resources/${namespace}/**/*.{${extensions}}`);

					libraryManifest = await createManifestProcessor({
						libraryResource: dotLibResource,
						namespace,
						resources: libResources,
						options: {
							omitMinVersions: true
						}
					});
				}
				return {
					libraryManifest,
					embeddedManifests,
					name: dotLibResource._project.metadata.name,
					version: dotLibResource._project.version
				};
			});
			const libraryInfos = await Promise.all(libraryInfosPromises);

			const [versionInfoResource] = await createVersionInfoProcessor({
				options: {
					rootProjectName: project.metadata.name,
					rootProjectVersion: project.version,
					libraryInfos
				}
			});
			const versionInfoContent = await versionInfoResource.getBuffer();

			res.writeHead(200, {
				"Content-Type": "application/json"
			});
			res.end(versionInfoContent.toString());
		} catch (err) {
			next(err);
		}
	};
}

module.exports = createMiddleware;

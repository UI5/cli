import createVersionInfoProcessor from "@ui5/builder/processors/versionInfoGenerator";
import createManifestProcessor from "@ui5/builder/processors/manifestCreator";

const MANIFEST_JSON = "manifest.json";

/**
 * Creates and returns the middleware to create the version info as json object.
 *
 * @module @ui5/server/middleware/versionInfo
 * @param {object} parameters Parameters
 * @param {@ui5/server/internal/MiddlewareManager.middlewareResources} parameters.resources Parameters
 * @param {@ui5/project/graph/ProjectGraph} parameters.graph Project graph
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources, graph}) {
	return async function versionInfo(req, res, next) {
		try {
			const dependencies = resources.dependencies;
			const dotLibResources = await dependencies.byGlob("/resources/**/.library");

			dotLibResources.sort((a, b) => {
				return a.getProject().getName().localeCompare(b.getProject().getName());
			});

			const libraryInfosPromises = dotLibResources.map(async (dotLibResource) => {
				const namespace = dotLibResource.getProject().getNamespace();
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
						},
						getProjectVersion: (projectName) => {
							return graph.getProject(projectName)?.getVersion();
						}
					});
				}
				return {
					libraryManifest,
					embeddedManifests,
					name: dotLibResource.getProject().getName(),
					version: dotLibResource.getProject().getVersion()
				};
			});
			const rootProject = graph.getRoot();
			const libraryInfos = await Promise.all(libraryInfosPromises);
			const [versionInfoResource] = await createVersionInfoProcessor({
				options: {
					rootProjectName: rootProject.getName(),
					rootProjectVersion: rootProject.getVersion(),
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

export default createMiddleware;

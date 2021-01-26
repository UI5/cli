const versionInfoGenerator = require("../processors/versionInfoGenerator");

const MANIFEST_JSON = "manifest.json";

/**
 * Task to create sap-ui-version.json
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateVersionInfo
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Glob pattern for .library resources
 * @param {object} parameters.options.rootProject DuplexCollection to read and write files
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async ({workspace, dependencies, options: {rootProject, pattern}}) => {
	const resources = await dependencies.byGlob(pattern);

	const libraryInfosPromises = resources.map((dotLibResource) => {
		const namespace = dotLibResource._project.metadata.namespace;
		// pass all required resources to the processor
		// the processor will then filter
		return dependencies.byGlob(`/resources/${namespace}/**/${MANIFEST_JSON}`).then((manifestResources) => {
			const libraryManifest = manifestResources.find((manifestResource) => {
				return manifestResource.getPath() === `/resources/${namespace}/${MANIFEST_JSON}`;
			});
			const embeddedManifests =
				manifestResources.filter((manifestResource) => manifestResource !== libraryManifest);
			return {
				libraryManifest,
				embeddedManifests,
				name: dotLibResource._project.metadata.name,
				version: dotLibResource._project.version
			};
		});
	});
	const libraryInfos = await Promise.all(libraryInfosPromises);

	const [versionInfoResource] = await versionInfoGenerator({
		options: {
			rootProjectName: rootProject.metadata.name,
			rootProjectVersion: rootProject.version,
			libraryInfos
		}
	});
	return workspace.write(versionInfoResource);
};

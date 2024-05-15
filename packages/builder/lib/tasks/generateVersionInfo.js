import versionInfoGenerator from "../processors/versionInfoGenerator.js";

const MANIFEST_JSON = "manifest.json";

/**
 * @public
 * @module @ui5/builder/tasks/generateVersionInfo
 */

/**
 * Task to create sap-ui-version.json
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/fs/AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Glob pattern for .library resources
 * @param {object} parameters.options.rootProject DuplexCollection to read and write files
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async ({workspace, dependencies, options: {rootProject, pattern}}) => {
	let resources = await dependencies.byGlob(pattern);

	resources = resources.filter((res) => res.getProject()?.getType() === "library");

	const libraryInfosPromises = resources.map((dotLibResource) => {
		const namespace = dotLibResource.getProject().getNamespace();
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
				name: dotLibResource.getProject().getName(),
				version: dotLibResource.getProject().getVersion()
			};
		});
	});
	const libraryInfos = await Promise.all(libraryInfosPromises);

	const [versionInfoResource] = await versionInfoGenerator({
		options: {
			rootProjectName: rootProject.getName(),
			rootProjectVersion: rootProject.getVersion(),
			libraryInfos
		}
	});
	return workspace.write(versionInfoResource);
};

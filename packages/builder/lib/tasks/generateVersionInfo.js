import versionInfoGenerator from "../processors/versionInfoGenerator.js";

const MANIFEST_JSON = "manifest.json";

/**
 * @public
 * @module @ui5/builder/tasks/generateVersionInfo
 */

/**
 * Determines the UI5 framework (name and version) for the version info.
 *
 * Resolution order:
 * 1. Explicit framework configuration from the root project's ui5.yaml
 * 2. Dependency npm-scope scan (@sapui5/ → SAPUI5, @openui5/ → OpenUI5)
 * 3. <code>undefined</code> if no framework signal is found
 *
 * @private
 * @param {object} rootProject The root project instance
 * @param {module:@ui5/fs/Resource[]} resources Filtered library dependency resources
 * @returns {{name: string, version: string}|undefined} Framework object or undefined
 */
function resolveFramework(rootProject, resources) {
	const frameworkName = rootProject.getFrameworkName?.();
	if (frameworkName === "OpenUI5" || frameworkName === "SAPUI5") {
		return {name: frameworkName, version: rootProject.getFrameworkVersion()};
	}

	let openui5Detected = false;
	let openui5CoreVersion = "";
	for (const res of resources) {
		const id = res.getProject().getId?.();
		if (id?.startsWith("@sapui5/")) {
			return {name: "SAPUI5", version: ""};
		}
		if (id?.startsWith("@openui5/")) {
			openui5Detected = true;
			if (res.getProject().getName() === "sap.ui.core") {
				openui5CoreVersion = res.getProject().getVersion();
			}
		}
	}
	if (openui5Detected) {
		return {name: "OpenUI5", version: openui5CoreVersion};
	}
	return undefined;
}

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

	const framework = resolveFramework(rootProject, resources);

	const [versionInfoResource] = await versionInfoGenerator({
		options: {
			rootProjectName: rootProject.getName(),
			rootProjectVersion: rootProject.getVersion(),
			framework,
			libraryInfos
		}
	});
	return workspace.write(versionInfoResource);
};

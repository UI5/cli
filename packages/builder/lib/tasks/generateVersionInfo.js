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
 * @param {object} options Options
 * @param {string} options.pattern Glob pattern for .library resources
 * @param {object} options.rootProject Root project (used for its name and version)
 * @returns {module:@ui5/builder/tasks/runTask~TaskDescriptor} The task descriptor
 */
export default function defineTask(options) {
	return {
		requiresDependencies: true,
		task
	};
}

/**
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/fs/AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Glob pattern for .library resources
 * @param {object} parameters.options.rootProject Root project (used for its name and version)
 * @returns {Promise<undefined>} Promise resolving once sap-ui-version.json has been written
 */
async function task({workspace, dependencies, options: {rootProject, pattern}}) {
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

	// Resolve framework from explicit ui5.yaml configuration
	const frameworkName = rootProject.getFrameworkName?.();
	let framework;
	if (frameworkName === "OpenUI5" || frameworkName === "SAPUI5") {
		framework = {name: frameworkName, version: rootProject.getFrameworkVersion()};
	}

	// Fallback: scan dependency npm IDs for framework signal
	if (!framework) {
		let openui5Detected = false;
		let openui5CoreVersion = "";
		for (const res of resources) {
			const id = res.getProject().getId?.();
			// If at least one SAPUI5 library is present, use "SAPUI5",
			// but leave version empty if no SAPUI5 dist version is known
			if (id?.startsWith("@sapui5/")) {
				framework = {name: "SAPUI5", version: ""};
				break;
			}
			// If only OpenUI5 libraries are present, use "OpenUI5" and version
			// from "sap.ui.core" project
			if (id?.startsWith("@openui5/")) {
				openui5Detected = true;
				if (res.getProject().getName() === "sap.ui.core") {
					openui5CoreVersion = res.getProject().getVersion();
				}
			}
		}
		if (!framework && openui5Detected) {
			framework = {name: "OpenUI5", version: openui5CoreVersion};
		}
	}

	const [versionInfoResource] = await versionInfoGenerator({
		options: {
			rootProjectName: rootProject.getName(),
			rootProjectVersion: rootProject.getVersion(),
			framework,
			libraryInfos
		}
	});
	return workspace.write(versionInfoResource);
}

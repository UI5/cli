import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:bundlers:generateFlexChangesBundle");
import flexChangesBundler from "../../processors/bundlers/flexChangesBundler.js";
import semver from "semver";

/**
 * @public
 * @module @ui5/builder/tasks/bundlers/generateFlexChangesBundle
 */

/* eslint "jsdoc/check-param-names": ["error", {"disableExtraPropertyReporting":true}] */
/**
 * Task to create changesBundle.json file containing all changes stored in the /changes folder for easier consumption
 * at runtime.
 * If a change bundle is created, "sap.ui.fl" is added as a dependency to the manifest.json if not already present -
 * if the dependency is already listed but lazy-loaded, lazy loading is disabled.
 * If minUI5Version >= 1.73 flexibility-bundle.json will be create.
 * If there are control variants and minUI5Version < 1.73 build will break and throw an error.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} [parameters.options] Options
 * @param {string} [parameters.options.projectNamespace] Project Namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, taskUtil, options = {}}) {
	const namespace = options.projectNamespace;

	// Use the given namespace if available, otherwise use no namespace
	// (e.g. in case no manifest.json is present)
	let pathPrefix = "";
	if (namespace) {
		pathPrefix = `/resources/${namespace}`;
	}

	function updateJson(data) {
		// ensure the existence of the libs section in the dependencies
		data["sap.ui5"] = data["sap.ui5"] || {};
		data["sap.ui5"].dependencies = data["sap.ui5"].dependencies || {};
		const mLibs = data["sap.ui5"].dependencies.libs = data["sap.ui5"].dependencies.libs || {};

		if (mLibs["sap.ui.fl"]) {
			log.verbose("sap.ui.fl found in manifest.json");
			if (mLibs["sap.ui.fl"].lazy) {
				log.verbose("sap.ui.fl 'lazy' attribute found in manifest.json, setting it to false...");
				mLibs["sap.ui.fl"].lazy = false;
			}
		} else {
			log.verbose("sap.ui.fl not found in manifest.json, inserting it...");
			mLibs["sap.ui.fl"] = {};
		}
	}

	async function updateFLdependency() {
		const manifestResource = await workspace.byPath(`${pathPrefix}/manifest.json`);
		const manifestContent = JSON.parse(await manifestResource.getString());

		updateJson(manifestContent);
		manifestResource.setString(JSON.stringify(manifestContent, null, "\t"));

		await workspace.write(manifestResource);
	}

	async function readManifestMinUI5Version() {
		const manifestResource = await workspace.byPath(`${pathPrefix}/manifest.json`);
		const manifestContent = JSON.parse(await manifestResource.getString());

		manifestContent["sap.ui5"] = manifestContent["sap.ui5"] || {};
		manifestContent["sap.ui5"].dependencies = manifestContent["sap.ui5"].dependencies || {};
		if (!Array.isArray(manifestContent["sap.ui5"].dependencies.minUI5Version)) {
			manifestContent["sap.ui5"].dependencies.minUI5Version =
				// eslint-disable-next-line no-constant-binary-expression
				[manifestContent["sap.ui5"].dependencies.minUI5Version] || [""];
		}
		return manifestContent["sap.ui5"].dependencies.minUI5Version;
	}

	log.verbose("Collecting flexibility changes");
	const allResources = await workspace.byGlob(
		`${pathPrefix}/changes/*.{change,variant,ctrl_variant,ctrl_variant_change,ctrl_variant_management_change}`);
	if (allResources.length > 0) {
		const versionArray = await readManifestMinUI5Version();
		const versions = versionArray.map((version) => semver.coerce(version));
		const versionsAllSuitableForFlexBundle = versions.every((version) => semver.compare(version, "1.73.0") >= 0);
		let hasFlexBundleVersion = false;
		let flexBundle = {};
		if (versionsAllSuitableForFlexBundle) {
			hasFlexBundleVersion = true;
			const flexBundleResource = await workspace.byPath(`${pathPrefix}/changes/flexibility-bundle.json`);
			if (flexBundleResource) {
				flexBundle = JSON.parse(await flexBundleResource.getString());
			}
		}
		const processedResources = await flexChangesBundler({
			resources: allResources,
			options: {
				pathPrefix,
				hasFlexBundleVersion
			},
			existingFlexBundle: flexBundle
		});
		await Promise.all(processedResources.map((resource) => {
			log.verbose("Writing flexibility changes bundle");
			return workspace.write(resource);
		}));
		// Add the sap.ui.fl dependency if a bundle has been created
		if (processedResources.length > 0) {
			await updateFLdependency();
		}

		// Do not write bundled source files to build result
		if (taskUtil) {
			allResources.forEach((resource) => {
				taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
			});
		}
	}
}

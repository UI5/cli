const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateFlexChangesBundle");
const flexChangesBundler = require("../../processors/bundlers/flexChangesBundler");

/**
 * Task to create changesBundle.json file containing all changes stored in the /changes folder for easier consumption
 * at runtime.
 * If a change bundle is created, "sap.ui.fl" is added as a dependency to the manifest.json if not already present -
 * if the dependency is already listed but lazy-loaded, lazy loading is disabled.
 * If minUI5Version >= 1.73 flexibility-bundle.json will be create.
 * If there are control variants and minUI5Version < 1.73 build will break and throw an error.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateFlexChangesBundle
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {object} [parameters.options] Options
 * @param {string} [parameters.options.namespace] Application Namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, options: {namespace}}) {
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
		return manifestContent["sap.ui5"].dependencies.minUI5Version = manifestContent["sap.ui5"].dependencies.minUI5Version || "";
	}

	log.verbose("Collecting flexibility changes");
	return workspace.byGlob(`${pathPrefix}/changes/*.{change,variant,ctrl_variant,ctrl_variant_change,ctrl_variant_management_change}`)
		.then((allResources) => {
			if (allResources.length > 0) {
				return readManifestMinUI5Version().then((version) => {
					let hasFlexBundleVersion = false;
					if (parseFloat(version) >= 1.73) {
						hasFlexBundleVersion = true;
					}
					return flexChangesBundler({
						resources: allResources,
						options: {
							pathPrefix,
							hasFlexBundleVersion
						}
					});
				});
			}
			return [];
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				log.verbose("Writing flexibility changes bundle");
				return workspace.write(resource);
			})).then(async () => {
				// Add the sap.ui.fl dependency if a bundle has been created
				if (processedResources.length > 0) {
					await updateFLdependency();
				}
			});
		});
};

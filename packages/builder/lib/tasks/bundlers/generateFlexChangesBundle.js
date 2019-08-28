const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateFlexChangesBundle");
const flexChangesBundler = require("../../processors/bundlers/flexChangesBundler");
const resourceFactory = require("@ui5/fs").resourceFactory;

/**
 * Task to create changesBundle.json file containing all changes stored in the /changes folder for easier consumption
 * at runtime.
 * If a change bundle is created, "sap.ui.fl" is added as a dependency to the manifest.json if not already present -
 * if the dependency is already listed but lazy-loaded, lazy loading is disabled.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateFlexChangesBundle
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Object} [parameters.options] Options
 * @param {string} [parameters.options.namespace] Application Namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, options}) {
	// Use the given namespace if available, otherwise use no namespace
	// (e.g. in case no manifest.json is present)
	let pathPrefix = "";
	if (options && options.namespace) {
		pathPrefix = `/resources/${options.namespace}`;
	}

	function updateJson(data) {
		// ensure the existence of the libs section in the dependencies
		data["sap.ui5"].dependencies.libs = data["sap.ui5"].dependencies.libs || {};
		const mLibs = data["sap.ui5"].dependencies.libs;

		if ("sap.ui.fl" in mLibs) {
			log.verbose("sap.ui.fl found in manifest.json");
			if ("lazy" in mLibs["sap.ui.fl"]) {
				log.verbose("sap.ui.fl 'lazy' attribute found in manifest.json, setting it to false...");
				if (mLibs["sap.ui.fl"].lazy === true) {
					mLibs["sap.ui.fl"].lazy = false;
				}
			}
		} else {
			log.verbose("sap.ui.fl not found in manifest.json, inserting it...");
			mLibs["sap.ui.fl"] = {};
		}

		return data;
	}

	function updateFLdependency() {
		return workspace.byPath(`${pathPrefix}/manifest.json`)
			.then((manifestData) => {
				return manifestData.getBuffer().then((buffer) => {
					return JSON.parse(buffer.toString());
				});
			})
			.then((manifestContent) => {
				let updatedContent = updateJson(manifestContent);
				updatedContent = JSON.stringify(updatedContent);
				return workspace.write(resourceFactory.createResource({
					path: `${pathPrefix}/manifest.json`,
					string: updatedContent
				}));
			});
	}

	log.verbose("Collecting flexibility changes");
	return workspace.byGlob(`${pathPrefix}/changes/*.change`)
		.then((allResources) => {
			return flexChangesBundler({
				resources: allResources,
				options: {
					namespace: options.namespace,
					pathPrefix: pathPrefix
				}
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map(async (resource) => {
				log.verbose("Writing flexibility changes bundle");
				await updateFLdependency();
				return workspace.write(resource);
			}));
		});
};

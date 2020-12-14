const log = require("@ui5/logger").getLogger("builder:processors:bundlers:flexChangesBundler");
const resourceFactory = require("@ui5/fs").resourceFactory;

/**
 * Bundles all supplied changes.
 *
 * @public
 * @alias module:@ui5/builder.processors.flexChangesBundler
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pathPrefix Prefix for bundle path
 * @param {string} parameters.options.hasFlexBundleVersion true if minUI5Version >= 1.73 than
 *															create flexibility-bundle.json
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with flex changes bundle resources
 */
module.exports = function({resources, options: {pathPrefix, hasFlexBundleVersion}}) {
	let bundleName = "changes-bundle.json";

	function sortByTimeStamp(a, b) {
		return a.creation > b.creation ? 1 : -1;
	}

	/**
	 * bundle changes resource to json string
	 *
	 * @param {Array} changesContent Array of resources files
	 * @returns {string} Json sting of changes and control variants
	 */
	function sortAndStringifyInFlexFormat(changesContent) {
		changesContent = changesContent.sort(sortByTimeStamp);
		const changes = [];
		const variantDependentControlChanges = [];
		const compVariants = [];
		const variants = [];
		const variantChanges = [];
		const variantManagementChanges = [];

		changesContent.forEach(function(content) {
			if (content.layer === "VENDOR") {
				content.support.user = "SAP";
			}
			switch (content.fileType) {
			case "change":
				if (content.appDescriptorChange && (content.appDescriptorChange === "true" ||
						content.appDescriptorChange == true)) {
					break;
				}
				if (content.variantReference && content.variantReference !== "") {
					variantDependentControlChanges.push(content);
				} else {
					changes.push(content);
				}
				break;
			case "variant":
				compVariants.push(content);
				break;
			case "ctrl_variant":
				variants.push(content);
				break;
			case "ctrl_variant_change":
				variantChanges.push(content);
				break;
			case "ctrl_variant_management_change":
				variantManagementChanges.push(content);
				break;
			}
		});

		if (!hasFlexBundleVersion && (compVariants.length != 0 || variants.length != 0 || variantChanges.length != 0 ||
				variantDependentControlChanges.length != 0 || variantManagementChanges.length != 0)) {
			throw new Error(
				"There are some control variant changes in the changes folder. This only works with a " +
				"minUI5Version 1.73.0. Please update the minUI5Version in the manifest.json to 1.73.0 or higher");
		}
		// create changes-bundle.json
		if (!hasFlexBundleVersion) {
			return JSON.stringify(changes);
		} else {
			bundleName = "flexibility-bundle.json";
			const newChangeFormat = {
				changes,
				compVariants,
				variants,
				variantChanges,
				variantDependentControlChanges,
				variantManagementChanges
			};

			return JSON.stringify(newChangeFormat);
		}
	}

	return Promise.all(resources.map((resource) => {
		return resource.getBuffer().then((buffer) => {
			return JSON.parse(buffer.toString());
		});
	})).then((changesContent) => {
		const nNumberOfChanges = changesContent.length;
		log.info("Changes collected. Number of changes: " + nNumberOfChanges);
		const result = [];
		if (nNumberOfChanges > 0) {
			changesContent = sortAndStringifyInFlexFormat(changesContent);
			result.push(resourceFactory.createResource({
				path: `${pathPrefix}/changes/${bundleName}`,
				string: changesContent
			}));
		}
		return result;
	});
};

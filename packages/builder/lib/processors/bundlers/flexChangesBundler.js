import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:bundlers:flexChangesBundler");
import {createResource} from "@ui5/fs/resourceFactory";

/**
 * @public
 * @module @ui5/builder/processors/bundlers/flexChangesBundler
 */

/**
 * Bundles all supplied changes.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of resources to be processed
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pathPrefix Prefix for bundle path
 * @param {string} parameters.options.hasFlexBundleVersion true if minUI5Version >= 1.73 than
 *															create flexibility-bundle.json
 * @param {object} [parameters.existingFlexBundle={}] Object with existing flexibility-bundle.json
 * 															to merge with new changes
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with flex changes bundle resources
 */
export default function({resources, options: {pathPrefix, hasFlexBundleVersion}, existingFlexBundle = {}}) {
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
			let newChangeFormat = {
				changes,
				compVariants,
				variants,
				variantChanges,
				variantDependentControlChanges,
				variantManagementChanges
			};
			if (Object.keys(existingFlexBundle).length > 0) {
				newChangeFormat = mergeFlexChangeBundles(newChangeFormat);
			}
			return JSON.stringify(newChangeFormat);
		}
	}

	/**
	 * Merge new and existing bundles
	 *
	 * @param {object} newFlexBundle Object with new content of flexibility-bundle.json
	 * @returns {object} Object with merged content of new and existing flexibility-bundle.json
	 */
	function mergeFlexChangeBundles(newFlexBundle) {
		const result = {};

		Object.keys(newFlexBundle).forEach((key) => {
			if (existingFlexBundle[key] && Array.isArray(existingFlexBundle[key])) {
				result[key] = existingFlexBundle[key].concat(newFlexBundle[key]);
			} else {
				result[key] = newFlexBundle[key];
			}
		});

		return result;
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
			result.push(createResource({
				path: `${pathPrefix}/changes/${bundleName}`,
				string: changesContent
			}));
		}
		return result;
	});
}

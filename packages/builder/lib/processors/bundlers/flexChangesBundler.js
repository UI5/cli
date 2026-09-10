import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:bundlers:flexChangesBundler");
import {createResource} from "@ui5/fs/resourceFactory";

/**
 * @public
 * @module @ui5/builder/processors/bundlers/flexChangesBundler
 */

/**
 * Result of the flex changes bundling process.
 *
 * @public
 * @typedef {object} FlexChangesBundlerResult
 * @property {boolean|undefined} flexBundle Flag indicating whether a flexibility bundle was created.
 *   - `true`: a flexibility bundle was created and at least one annotation change is included
 *   - `undefined`: a flexibility bundle was created, but does not contain any annotation change,
 *     so the client should not enforce an early dedicated loading of the bundle
 *   - `false`: no flexibility bundle was created (no changes to bundle, e.g. only filtered
 *     app-descriptor changes were provided)
 * @property {@ui5/fs/Resource[]} bundleResources List of created flex changes bundle resources
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
 * @param {boolean} parameters.options.hasFlexBundleVersion true if minUI5Version >= 1.73
 *															and create flexibility-bundle.json
 * @param {object} [parameters.existingFlexBundle={}] Object with existing flexibility-bundle.json
 * 															to merge with new changes
 * @returns {Promise<FlexChangesBundlerResult>} Promise resolving with an object containing
 *   the flexBundle flag and the created flex changes bundle resources
 */
export default function({resources, options: {pathPrefix, hasFlexBundleVersion}, existingFlexBundle = {}}) {
	let bundleName = "changes-bundle.json";
	// Default to `false`: no bundle content will be written.
	// Updated below to `true` (annotation changes present) or `undefined` otherwise
	let flexBundle = false;

	function sortByTimeStamp(a, b) {
		return a.creation > b.creation ? 1 : -1;
	}

	/**
	 * bundle changes resource to json string
	 *
	 * @param {Array} changesContent Array of resources files (changes, variants, etc)
	 * @returns {string} Json string of changes and control variants
	 */
	function sortAndStringifyInFlexFormat(changesContent) {
		changesContent = changesContent.sort(sortByTimeStamp);
		const changes = [];
		const variantDependentControlChanges = [];
		const compVariants = [];
		const variants = [];
		const variantChanges = [];
		const variantManagementChanges = [];
		const annotationChanges = [];

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
			case "annotation_change":
				annotationChanges.push(content);
				break;
			}
		});

		const hasBundleContent =
			changes.length > 0 ||
			variantDependentControlChanges.length > 0 ||
			compVariants.length > 0 ||
			variants.length > 0 ||
			variantChanges.length > 0 ||
			variantManagementChanges.length > 0 ||
			annotationChanges.length > 0;

		if (!hasFlexBundleVersion && (
			compVariants.length != 0 ||
			variants.length != 0 ||
			variantChanges.length != 0 ||
			variantDependentControlChanges.length != 0 ||
			variantManagementChanges.length != 0 ||
			annotationChanges.length != 0
		)) {
			throw new Error(
				"There are some files in the changes folder supported only with a UI5 version 1.73 and above. " +
				"Please update the minUI5Version in the manifest.json to 1.73 or higher");
		}

		if (annotationChanges.length > 0) {
			flexBundle = true;
		} else if (hasBundleContent) {
			flexBundle = undefined;
		}

		// create changes-bundle.json
		if (!hasFlexBundleVersion) {
			return JSON.stringify(changes);
		} else {
			bundleName = "flexibility-bundle.json";
			let newChangeFormat = {
				annotationChanges,
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
		return {
			bundleResources: result,
			flexBundle
		};
	});
}

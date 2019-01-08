const log = require("@ui5/logger").getLogger("builder:processors:bundlers:flexChangesBundler");
const resourceFactory = require("@ui5/fs").resourceFactory;

/**
 * Bundles all supplied changes.
 *
 * @public
 * @alias @ui5/builder.processors.flexChangesBundler
 * @param {Object} parameters Parameters
 * @param {Resource[]} parameters.resources List of resources to be processed
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.pathPrefix Prefix for bundle path
 * @returns {Promise<Resource[]>} Promise resolving with flexchange bundle resources
 */
module.exports = function({resources, options}) {
	const layers = {
		VENDOR: 0,
		INDUSTRY: 1,
		PARTNER: 2,
		CUSTOMER_BASE: 3,
		CUSTOMER: 4,
		USER: 5
	};

	function sortByLayer(a, b) {
		return layers[a.layer] - layers[b.layer];
	}

	function sortByTimeStamp(a, b) {
		return a.creation - b.creation;
	}

	function sortAndStringify(changesContent) {
		changesContent = changesContent.sort(sortByTimeStamp);
		changesContent = changesContent.sort(sortByLayer);
		changesContent = changesContent.map(function(change) {
			return JSON.stringify(change);
		});
		return changesContent;
	}

	return Promise.all(resources.map((resource) => {
		return resource.getBuffer().then((buffer) => {
			return JSON.parse(buffer.toString());
		});
	})).then((changesContent) => {
		const nNumberOfChanges = changesContent.length;
		log.verbose("Changes collected. Number of changes: " + nNumberOfChanges);
		const result = [];
		if (nNumberOfChanges > 0) {
			changesContent = sortAndStringify(changesContent);
			result.push(resourceFactory.createResource({
				path: `${options.pathPrefix}/changes/changes-bundle.json`,
				string: "{ \"changes\": [" + changesContent.join(",") + "]}"
			}));
		}
		return result;
	});
};

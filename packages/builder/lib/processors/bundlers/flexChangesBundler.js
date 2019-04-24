const log = require("@ui5/logger").getLogger("builder:processors:bundlers:flexChangesBundler");
const resourceFactory = require("@ui5/fs").resourceFactory;

/**
 * Bundles all supplied changes.
 *
 * @public
 * @alias module:@ui5/builder.processors.flexChangesBundler
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.pathPrefix Prefix for bundle path
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with flex changes bundle resources
 */
module.exports = function({resources, options}) {
	function sortByTimeStamp(a, b) {
		return a.creation > b.creation ? 1 : -1;
	}

	function sortAndStringify(changesContent) {
		changesContent = changesContent.sort(sortByTimeStamp);
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
		log.info("Changes collected. Number of changes: " + nNumberOfChanges);
		const result = [];
		if (nNumberOfChanges > 0) {
			changesContent = sortAndStringify(changesContent);
			result.push(resourceFactory.createResource({
				path: `${options.pathPrefix}/changes/changes-bundle.json`,
				string: "[" + changesContent.join(",") + "]"
			}));
		}
		return result;
	});
};

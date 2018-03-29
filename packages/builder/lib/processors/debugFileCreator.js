const copier = require("./resourceCopier");

/**
 * Creates *-dbg.js files for all supplied resources.
 *
 * @module builder/processors/debugFileCreator
 * @param {Object} parameters Parameters
 * @param {Resource[]} parameters.resources List of resources to be processed
 * @returns {Promise<Resource[]>} Promise resolving with debug resources
 */
module.exports = function({resources}) {
	return copier({
		resources: resources,
		options: {
			pattern: /((\.view|\.fragment|\.controller)?\.js)/,
			replacement: "-dbg$1"
		}
	});
};

const replaceStream = require("replacestream");

/**
 * Replaces placeholders with corresponding values.
 *
 * @public
 * @alias module:@ui5/builder.processors.stringReplacer
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern of placeholders
 * @param {string} parameters.options.replacement Replacement for placeholders
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with modified resources
 */
module.exports = function({resources, options}) {
	return Promise.all(resources.map((resource) => {
		const stream = resource.getStream()
			.pipe(replaceStream(options.pattern, options.replacement));

		resource.setStream(stream);
		return resource;
	}));
};

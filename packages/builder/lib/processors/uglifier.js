const terser = require("terser");
const copyrightCommentsPattern = /copyright|\(c\)(?:[0-9]+|\s+[0-9A-za-z])|released under|license|\u00a9/i;

/**
 * Minifies the supplied resources.
 *
 * @public
 * @alias module:@ui5/builder.processors.uglifier
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with uglified resources
 */
module.exports = function({resources}) {
	return Promise.all(resources.map((resource) => {
		return resource.getString().then((code) => {
			const result = terser.minify({
				[resource.getPath()]: code
			}, {
				warnings: false,
				output: {
					comments: copyrightCommentsPattern
				},
				compress: false
			});
			if (result.error) {
				throw new Error(
					`Uglification failed with error: ${result.error.message} in file ${result.error.filename} ` +
					`(line ${result.error.line}, col ${result.error.col}, pos ${result.error.pos})`);
			}

			resource.setString(result.code);
			return resource;
		});
	}));
};

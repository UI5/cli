const terser = require("terser");
/**
 * Preserve comments which contain:
 * <ul>
 *  <li>copyright notice</li>
 *  <li>license terms</li>
 *  <li>"@ui5-bundle"</li>
 *  <li>"@ui5-bundle-raw-include"</li>
 * </ul>
 *
 * @type {RegExp}
 */
const copyrightCommentsAndBundleCommentPattern = /copyright|\(c\)(?:[0-9]+|\s+[0-9A-za-z])|released under|license|\u00a9|^@ui5-bundle-raw-include |^@ui5-bundle /i;

/**
 * Minifies the supplied resources.
 *
 * @public
 * @alias module:@ui5/builder.processors.uglifier
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with uglified resources
 */
module.exports = function({resources}) {
	return Promise.all(resources.map(async (resource) => {
		const code = await resource.getString();
		try {
			const result = await terser.minify({
				[resource.getPath()]: code
			}, {
				output: {
					comments: copyrightCommentsAndBundleCommentPattern,
					wrap_func_args: false
				},
				compress: false
			});
			resource.setString(result.code);
			return resource;
		} catch (err) {
			throw new Error(
				`Uglification failed with error: ${err.message} in file ${err.filename} ` +
				`(line ${err.line}, col ${err.col}, pos ${err.pos})`);
		}
	}));
};

const path = require("path");
const terser = require("terser");
const Resource = require("@ui5/fs").Resource;
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
const debugFileRegex = /((?:\.view|\.fragment|\.controller|\.designtime|\.support)?\.js)$/;


/**
 * Result set
 *
 * @public
 * @typedef {object} MinifierResult
 * @property {module:@ui5/fs.Resource} resource Minified resource
 * @property {module:@ui5/fs.Resource} dbgResource Debug (non-minified) variant
 * @property {module:@ui5/fs.Resource} sourceMap Source Map
 * @memberof module:@ui5/builder.processors
 */

/**
 * Minifies the supplied resources.
 *
 * @public
 * @alias module:@ui5/builder.processors.minifier
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @param {boolean} [parameters.addSourceMappingUrl=true]
 * 				Whether to add a sourceMappingURL reference to the end of the minified resource
 * @returns {Promise<module:@ui5/builder.processors.MinifierResult[]>}
 * 				Promise resolving with object of resource, dbgResource and sourceMap
 */
module.exports = async function({resources, addSourceMappingUrl = true}) {
	return Promise.all(resources.map(async (resource) => {
		const dbgPath = resource.getPath().replace(debugFileRegex, "-dbg$1");
		const dbgResource = await resource.clone();
		dbgResource.setPath(dbgPath);

		const filename = path.posix.basename(resource.getPath());
		const code = await resource.getString();
		try {
			const sourceMapOptions = {
				filename
			};
			if (addSourceMappingUrl) {
				sourceMapOptions.url = filename + ".map";
			}
			const dbgFilename = path.posix.basename(dbgPath);
			const result = await terser.minify({
				// Use debug-name since this will be referenced in the source map "sources"
				[dbgFilename]: code
			}, {
				output: {
					comments: copyrightCommentsAndBundleCommentPattern,
					wrap_func_args: false
				},
				compress: false,
				mangle: {
					reserved: [
						"jQuery",
						"jquery",
						"sap",
					]
				},
				sourceMap: sourceMapOptions
			});
			resource.setString(result.code);
			const sourceMapResource = new Resource({
				path: resource.getPath() + ".map",
				string: result.map
			});
			return {resource, dbgResource, sourceMapResource};
		} catch (err) {
			// Note: err.filename contains the debug-name
			throw new Error(
				`Minification failed with error: ${err.message} in file ${filename} ` +
				`(line ${err.line}, col ${err.col}, pos ${err.pos})`);
		}
	}));
};

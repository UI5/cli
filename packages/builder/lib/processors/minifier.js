import posixPath from "node:path/posix";
import {minify} from "terser";
import Resource from "@ui5/fs/Resource";

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
 * @public
 * @module @ui5/builder/processors/minifier
 */

/**
 * Result set
 *
 * @public
 * @typedef {object} MinifierResult
 * @property {@ui5/fs/Resource} resource Minified resource
 * @property {@ui5/fs/Resource} dbgResource Debug (non-minified) variant
 * @property {@ui5/fs/Resource} sourceMap Source Map
 */

/**
 * Minifies the supplied resources.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of resources to be processed
 * @param {object} [parameters.options] Options
 * @param {boolean} [parameters.options.addSourceMappingUrl=true]
 * 				Whether to add a sourceMappingURL reference to the end of the minified resource
 * @returns {Promise<module:@ui5/builder/processors/minifier~MinifierResult[]>}
 * 				Promise resolving with object of resource, dbgResource and sourceMap
 */
export default async function({resources, options: {addSourceMappingUrl = true} = {}}) {
	return Promise.all(resources.map(async (resource) => {
		const dbgPath = resource.getPath().replace(debugFileRegex, "-dbg$1");
		const dbgResource = await resource.clone();
		dbgResource.setPath(dbgPath);

		const filename = posixPath.basename(resource.getPath());
		const code = await resource.getString();
		try {
			const sourceMapOptions = {
				filename
			};
			if (addSourceMappingUrl) {
				sourceMapOptions.url = filename + ".map";
			}
			const dbgFilename = posixPath.basename(dbgPath);
			const result = await minify({
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
}

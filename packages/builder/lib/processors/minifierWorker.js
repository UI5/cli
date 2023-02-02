import workerpool from "workerpool";
import {minify} from "terser";

/**
 * @private
 * @module @ui5/builder/tasks/minifyWorker
 */

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
const copyrightCommentsAndBundleCommentPattern = /copyright|\(c\)(?:[0-9]+|\s+[0-9A-Za-z])|released under|license|\u00a9|^@ui5-bundle-raw-include |^@ui5-bundle /i;

/**
 * Task to minify resources.
 *
 * @private
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {string} parameters.filename
 * @param {string} parameters.dbgFilename
 * @param {string} parameters.code
 * @param {object} parameters.sourceMapOptions
 * @returns {Promise<undefined>} Promise resolving once minification of the resource has finished
 */
export default async function execMinification({
	filename,
	dbgFilename,
	code,
	sourceMapOptions
}) {
	try {
		return await minify({
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
	} catch (err) {
		// Note: err.filename contains the debug-name
		throw new Error(
			`Minification failed with error: ${err.message} in file ${filename} ` +
			`(line ${err.line}, col ${err.col}, pos ${err.pos})`);
	}
}

// Test execution via ava is never done on the main thread
/* istanbul ignore else */
if (!workerpool.isMainThread) {
	// Script got loaded through workerpool
	// => Create a worker and register public functions
	workerpool.worker({
		execMinification
	});
}

import workerpool from "workerpool";
import {installToolDependencyHook, collectToolDependencies} from "./toolDependencyCollector.js";
// terser is imported lazily inside execMinification (not statically): a static ESM import is resolved at
// link time, before the tool-dependency hook runs, so the hook could never observe it
// (CPOUI5FOUNDATION-1386).

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
 * @param {string} parameters.resourcePath
 * @param {object} parameters.sourceMapOptions
 * @returns {Promise<object>} Resolves with <code>{data, toolDependencies}</code>: <code>data</code> is the
 * 	terser minify result, <code>toolDependencies</code> the absolute paths of the external tool files
 * 	observed in this worker (CPOUI5FOUNDATION-1386)
 */
export default async function execMinification({
	filename,
	dbgFilename,
	code,
	resourcePath,
	sourceMapOptions
}) {
	const {minify} = await import("terser");
	try {
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
		// Return the tool files this worker observed (terser and its subtree) alongside the result, so the
		// main thread can fold them into the stage's tool-content signature (CPOUI5FOUNDATION-1386).
		return {
			data: result,
			toolDependencies: collectToolDependencies()
		};
	} catch (err) {
		// Note: err.filename contains the debug-name
		throw new Error(
			`Minification failed with error: ${err.message} in file ${resourcePath} ` +
			`(line ${err.line}, col ${err.col}, pos ${err.pos})`, {
				cause: err
			});
	}
}

// Test execution via ava is never done on the main thread
/* istanbul ignore else */
if (!workerpool.isMainThread) {
	// Script got loaded through workerpool
	// => Install the tool-dependency hook before any tool import, then register public functions
	installToolDependencyHook();
	workerpool.worker({
		execMinification
	});
}

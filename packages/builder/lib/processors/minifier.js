import {fileURLToPath} from "node:url";
import posixPath from "node:path/posix";
import {promisify} from "node:util";
import os from "node:os";
import workerpool from "workerpool";
import Resource from "@ui5/fs/Resource";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:minifier");
import {setTimeout as setTimeoutPromise} from "node:timers/promises";

const debugFileRegex = /((?:\.view|\.fragment|\.controller|\.designtime|\.support)?\.js)$/;

const MIN_WORKERS = 2;
const MAX_WORKERS = 4;
const osCpus = os.cpus().length || 1;
const maxWorkers = Math.max(Math.min(osCpus - 1, MAX_WORKERS), MIN_WORKERS);

const sourceMappingUrlPattern = /\/\/# sourceMappingURL=(\S+)\s*$/;
const httpPattern = /^https?:\/\//i;

// Shared workerpool across all executions until the taskUtil cleanup is triggered
let pool;

function getPool(taskUtil) {
	if (!pool) {
		log.verbose(`Creating workerpool with up to ${maxWorkers} workers (available CPU cores: ${osCpus})`);
		const workerPath = fileURLToPath(new URL("./minifierWorker.js", import.meta.url));
		pool = workerpool.pool(workerPath, {
			workerType: "auto",
			maxWorkers
		});
		taskUtil.registerCleanupTask((force) => {
			const attemptPoolTermination = async () => {
				log.verbose(`Attempt to terminate the workerpool...`);

				if (!pool) {
					return;
				}

				// There are many stats that could be used, but these ones seem the most
				// convenient. When all the (available) workers are idle, then it's safe to terminate.
				let {idleWorkers, totalWorkers} = pool.stats();
				while (idleWorkers !== totalWorkers && !force) {
					await setTimeoutPromise(100); // Wait a bit workers to finish and try again

					if (!pool) { // pool might have been terminated in the meantime
						return;
					}
					({idleWorkers, totalWorkers} = pool.stats());
				}

				const poolToBeTerminated = pool;
				pool = null;
				return poolToBeTerminated.terminate(force);
			};

			return attemptPoolTermination();
		});
	}
	return pool;
}

async function minifyInWorker(options, taskUtil) {
	return getPool(taskUtil).exec("execMinification", [options]);
}

async function extractAndRemoveSourceMappingUrl(resource) {
	const resourceContent = await resource.getString();
	const resourcePath = resource.getPath();
	const sourceMappingUrlMatch = resourceContent.match(sourceMappingUrlPattern);
	if (sourceMappingUrlMatch) {
		const sourceMappingUrl = sourceMappingUrlMatch[1];
		if (log.isLevelEnabled("silly")) {
			log.silly(`Found source map reference in content of resource ${resourcePath}: ${sourceMappingUrl}`);
		}

		// Strip sourceMappingURL from the resource to be minified
		// It is not required anymore and will be replaced for in the minified resource
		// and its debug variant anyways
		resource.setString(resourceContent.replace(sourceMappingUrlPattern, ""));
		return sourceMappingUrl;
	}
	return null;
}

async function getSourceMapFromUrl({sourceMappingUrl, resourcePath, readFile}) {
	// =======================================================================
	// This code is almost identical to code located in lbt/bundle/Builder.js
	// Please try to update both places when making changes
	// =======================================================================
	if (sourceMappingUrl.startsWith("data:")) {
		// Data-URI indicates an inline source map
		const expectedTypeAndEncoding = "data:application/json;charset=utf-8;base64,";
		if (sourceMappingUrl.startsWith(expectedTypeAndEncoding)) {
			const base64Content = sourceMappingUrl.slice(expectedTypeAndEncoding.length);
			// Create a resource with a path suggesting it's the source map for the resource
			// (which it is but inlined)
			return Buffer.from(base64Content, "base64").toString();
		} else {
			log.warn(
				`Source map reference in resource ${resourcePath} is a data URI but has an unexpected` +
				`encoding: ${sourceMappingUrl}. Expected it to start with ` +
				`"data:application/json;charset=utf-8;base64,"`);
		}
	} else if (httpPattern.test(sourceMappingUrl)) {
		log.warn(`Source map reference in resource ${resourcePath} is an absolute URL. ` +
			`Currently, only relative URLs are supported.`);
	} else if (posixPath.isAbsolute(sourceMappingUrl)) {
		log.warn(`Source map reference in resource ${resourcePath} is an absolute path. ` +
			`Currently, only relative paths are supported.`);
	} else {
		const sourceMapPath = posixPath.join(posixPath.dirname(resourcePath), sourceMappingUrl);

		try {
			const sourceMapContent = await readFile(sourceMapPath);
			return sourceMapContent.toString();
		} catch (e) {
			// No input source map
			log.warn(`Unable to read source map for resource ${resourcePath}: ${e.message}`);
		}
	}
}

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
 * @param {fs|module:@ui5/fs/fsInterface} parameters.fs Node fs or custom
 *    [fs interface]{@link module:@ui5/fs/fsInterface}. Required when setting "readSourceMappingUrl" to true
 * @param {@ui5/builder/tasks/TaskUtil|object} [parameters.taskUtil] TaskUtil instance.
 *    Required when using the <code>useWorkers</code> option
 * @param {object} [parameters.options] Options
 * @param {boolean} [parameters.options.readSourceMappingUrl=false]
 *   Whether to make use of any existing source maps referenced in the resources to be minified. Use this option to
 *   preserve references to the original source files, such as TypeScript files, in the generated source map.<br>
 *   If a resource has been modified by a previous task, any existing source map will be ignored regardless of this
 *    setting. This is to ensure that no inconsistent source maps are used. Check the verbose log for details.
 * @param {boolean} [parameters.options.addSourceMappingUrl=true]
 *   Whether to add a sourceMappingURL reference to the end of the minified resource
 * @param {boolean} [parameters.options.useWorkers=false]
 *  Whether to offload the minification task onto separate CPU threads. This often speeds up the build process
 * @returns {Promise<module:@ui5/builder/processors/minifier~MinifierResult[]>}
 *   Promise resolving with object of resource, dbgResource and sourceMap
 */
export default async function({
	resources, fs, taskUtil, options: {readSourceMappingUrl = false, addSourceMappingUrl = true, useWorkers = false
	} = {}}) {
	let minify;
	if (readSourceMappingUrl && !fs) {
		throw new Error(`Option 'readSourceMappingUrl' requires parameter 'fs' to be provided`);
	}

	if (useWorkers) {
		if (!taskUtil) {
			// TaskUtil is required for worker support
			throw new Error(`Minifier: Option 'useWorkers' requires a taskUtil instance to be provided`);
		}
		minify = minifyInWorker;
	} else {
		// Do not use workerpool
		minify = (await import("./minifierWorker.js")).default;
	}

	return Promise.all(resources.map(async (resource) => {
		const resourcePath = resource.getPath();
		const dbgPath = resourcePath.replace(debugFileRegex, "-dbg$1");
		const dbgFilename = posixPath.basename(dbgPath);

		const filename = posixPath.basename(resource.getPath());

		const sourceMapOptions = {
			filename
		};
		if (addSourceMappingUrl) {
			sourceMapOptions.url = filename + ".map";
		}

		// Remember contentModified flag before making changes to the resource via setString
		const resourceContentModified = resource.getSourceMetadata()?.contentModified;

		// In any case: Extract *and remove* source map reference from resource before cloning it
		const sourceMappingUrl = await extractAndRemoveSourceMappingUrl(resource);

		const code = await resource.getString();
		// Create debug variant based off the original resource before minification
		const dbgResource = await resource.clone();
		dbgResource.setPath(dbgPath);

		let dbgSourceMapResource;
		if (sourceMappingUrl) {
			if (resourceContentModified) {
				log.verbose(
					`Source map found in resource will be ignored because the resource has been ` +
					`modified in a previous task: ${resourcePath}`);
			} else if (readSourceMappingUrl) {
				// Try to find a source map reference in the to-be-minified resource
				// If we find one, provide it to terser as an input source map and keep using it for the
				// debug variant of the resource
				const sourceMapContent = await getSourceMapFromUrl({
					sourceMappingUrl,
					resourcePath,
					readFile: promisify(fs.readFile)
				});

				if (sourceMapContent) {
					const sourceMapJson = JSON.parse(sourceMapContent);

					if (sourceMapJson.sections) {
						// TODO 5.0
						// Module "@jridgewell/trace-mapping" (used by Terser) can't handle index map sections lacking
						// a "names" array. Since this is a common occurrence for UI5 Tooling bundles, we search for
						// such cases here and fix them until https://github.com/jridgewell/trace-mapping/pull/29 is
						// resolved and Terser upgraded the dependency

						// Create a dedicated clone before modifying the source map as to not alter the debug source map
						const clonedSourceMapJson = JSON.parse(sourceMapContent);
						clonedSourceMapJson.sections.forEach(({map}) => {
							if (!map.names) {
								// Add missing names array
								map.names = [];
							}
						});
						// Use modified source map as input source map
						sourceMapOptions.content = JSON.stringify(clonedSourceMapJson);
					} else {
						// Provide source map to terser as "input source map"
						sourceMapOptions.content = sourceMapContent;
					}

					// Use the original source map for the debug variant of the resource
					// First update the file reference within the source map
					sourceMapJson.file = dbgFilename;

					// Then create a new resource
					dbgSourceMapResource = new Resource({
						string: JSON.stringify(sourceMapJson),
						path: dbgPath + ".map"
					});
					// And reference the resource in the debug resource
					dbgResource.setString(code + `//# sourceMappingURL=${dbgFilename}.map\n`);
				}
			} else {
				// If the original resource content was unmodified and the input source map was not parsed,
				// re-add the original source map reference to the debug variant
				if (!sourceMappingUrl.startsWith("data:") && !sourceMappingUrl.endsWith(filename + ".map")) {
					// Do not re-add inline source maps as well as references to the source map of
					// the minified resource
					dbgResource.setString(code + `//# sourceMappingURL=${sourceMappingUrl}\n`);
				}
			}
		}

		const result = await minify({
			filename,
			dbgFilename,
			code,
			resourcePath,
			sourceMapOptions
		}, taskUtil);
		resource.setString(result.code);
		const sourceMapResource = new Resource({
			path: resource.getPath() + ".map",
			string: result.map
		});
		return {resource, dbgResource, sourceMapResource, dbgSourceMapResource};
	}));
}

export const __localFunctions__ = (process.env.NODE_ENV === "test") ?
	{getSourceMapFromUrl} : undefined;

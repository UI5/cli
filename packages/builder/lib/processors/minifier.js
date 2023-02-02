import {fileURLToPath} from "node:url";
import posixPath from "node:path/posix";
import os from "node:os";
import workerpool from "workerpool";
import Resource from "@ui5/fs/Resource";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:minifier");

const debugFileRegex = /((?:\.view|\.fragment|\.controller|\.designtime|\.support)?\.js)$/;

const MIN_WORKERS = 2;
const MAX_WORKERS = 4;
const osCpus = os.cpus().length || 1;
const maxWorkers = Math.max(Math.min(osCpus - 1, MAX_WORKERS), MIN_WORKERS);

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
		taskUtil.registerCleanupTask(() => {
			log.verbose(`Terminating workerpool`);
			const poolToBeTerminated = pool;
			pool = null;
			poolToBeTerminated.terminate();
		});
	}
	return pool;
}

async function minifyInWorker(options, taskUtil) {
	return getPool(taskUtil).exec("execMinification", [options]);
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
 * @param {@ui5/builder/tasks/TaskUtil|object} [parameters.taskUtil] TaskUtil instance.
 *    Required when using the <code>useWorkers</code> option
 * @param {object} [parameters.options] Options
 * @param {boolean} [parameters.options.addSourceMappingUrl=true]
 *   Whether to add a sourceMappingURL reference to the end of the minified resource
 * @param {boolean} [parameters.options.useWorkers=false]
 *  Whether to offload the minification task onto separate CPU threads. This often speeds up the build process
 * @returns {Promise<module:@ui5/builder/processors/minifier~MinifierResult[]>}
 *   Promise resolving with object of resource, dbgResource and sourceMap
 */
export default async function({resources, taskUtil, options: {addSourceMappingUrl = true, useWorkers = false} = {}}) {
	let minify;
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
		const dbgPath = resource.getPath().replace(debugFileRegex, "-dbg$1");
		const dbgResource = await resource.clone();
		dbgResource.setPath(dbgPath);

		const filename = posixPath.basename(resource.getPath());
		const code = await resource.getString();

		const sourceMapOptions = {
			filename
		};
		if (addSourceMappingUrl) {
			sourceMapOptions.url = filename + ".map";
		}
		const dbgFilename = posixPath.basename(dbgPath);

		const result = await minify({
			filename,
			dbgFilename,
			code,
			sourceMapOptions
		}, taskUtil);
		resource.setString(result.code);
		const sourceMapResource = new Resource({
			path: resource.getPath() + ".map",
			string: result.map
		});
		return {resource, dbgResource, sourceMapResource};
	}));
}

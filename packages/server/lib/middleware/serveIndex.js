import {getLogger} from "@ui5/logger";
const log = getLogger("server:middleware:serveIndex");
import mime from "mime-types";
import serveIndex from "./serveIndex/serveIndex.cjs";

const KB = 1024;
const MB = KB * KB;
const GB = KB * KB * KB;

/**
 * Returns the mime type of the given resource
 *
 * @param {module:@ui5/fs/Resource} resource the resource
 * @returns {string} mime type
 */
function getMimeType(resource) {
	return mime.lookup(resource.getPath()) || "application/octet-stream";
}

/**
 * Converts the given bytes into a proper human readable size
 *
 * @param {number} bytes bytes
 * @returns {string} human readable size
 */
function formatSize(bytes) {
	let result;
	if (bytes < KB) {
		result = bytes + " Bytes";
	} else if (bytes < MB) {
		result = Number.parseFloat(bytes / KB).toFixed(2) + " KB";
	} else if (bytes < GB) {
		result = Number.parseFloat(bytes / MB).toFixed(2) + " MB";
	} else {
		result = Number.parseFloat(bytes / GB).toFixed(2) + " GB";
	}
	return result;
}

/**
 * Creates a resource info object which is used to create the HTML
 * content for the resource listing
 *
 * @param {@ui5/fs/Resource} resource the resource to convert
 * @returns {object} resource info object
 */
function createResourceInfo(resource) {
	const stat = resource.getStatInfo();
	const isDir = stat.isDirectory();
	return {
		path: resource.getPath() + (isDir ? "/" : ""),
		name: resource.getName() + (isDir ? "/" : ""),
		isDir: isDir,
		mimetype: isDir ? "" : getMimeType(resource),
		lastModified: new Date(stat.mtime).toLocaleString(),
		size: formatSize(stat.size),
		sizeInBytes: stat.size,
		project: resource.getProject()?.getName() || "<unknown>",
		projectPath: resource.getProject()?.getRootPath() || "<unknown>"
	};
}

/**
 * Creates a resource info array from the given resource array
 *
 * @param {@ui5/fs/Resource[]} resources an array of resources
 * @returns {object[]} sorted array of resource infos
 */
function createResourceInfos(resources) {
	return resources.map((item, i) => {
		return createResourceInfo(item);
	}).sort((a, b) => {
		if (a.isDir && !b.isDir) {
			return -1;
		} else if (!a.isDir && b.isDir) {
			return 1;
		} else {
			// numbers will be sorted by name as string like the FS does!
			return a.name.localeCompare(b.name);
		}
	});
}

/**
 * Creates and returns the middleware to serve a resource index.
 *
 * @module @ui5/server/middleware/serveIndex
 * @param {object} parameters Parameters
 * @param {object} parameters.resources Contains the resource reader or collection to access project related files
 * @param {@ui5/fs/AbstractReader} parameters.resources.all Resource collection which contains the workspace
 * and the project dependencies
 * @param {boolean} [parameters.simpleIndex=false] Use a simplified view for the server directory listing
 * @param {boolean} [parameters.showHidden=true] Show hidden files in the server directory listing
 * @returns {Function} Returns a server middleware closure.
 */

function createMiddleware({resources, middlewareUtil, simpleIndex = false, showHidden = true}) {
	return function(req, res, next) {
		const pathname = middlewareUtil.getPathname(req);
		log.verbose("\n Listing index of " + pathname);
		const glob = pathname + (pathname.endsWith("/") ? "*" : "/*");
		resources.all.byGlob(glob, {nodir: false}).then((resources) => {
			if (!resources || resources.length === 0) { // Not found
				next();
				return;
			}

			const resourceInfos = createResourceInfos(resources);
			serveIndex({
				req,
				res,
				next,
				simpleIndex,
				showHidden,
				resourceInfos,
				pathname
			});
		}).catch((err) => {
			next(err);
		});
	};
}

export default createMiddleware;

const {promisify} = require("util");
const fs = require("graceful-fs");
const readFile = promisify(fs.readFile);
const path = require("path");
const mime = require("mime-types");
const parseurl = require("parseurl");
const log = require("@ui5/logger").getLogger("server:middleware:testRunner");

const testRunnerResourceRegEx = /\/test-resources\/sap\/ui\/qunit\/(testrunner\.(html|css)|TestRunner.js)$/;
const resourceCache = {};

function serveResource(res, resourcePath, resourceContent) {
	const type = mime.lookup(resourcePath) || "application/octet-stream";
	const charset = mime.charset(type);
	const contentType = type + (charset ? "; charset=" + charset : "");

	// resources served by this middleware do not change often
	res.setHeader("Cache-Control", "public, max-age=1800");

	res.setHeader("Content-Type", contentType);
	res.end(resourceContent);
}

/**
 * Creates and returns the middleware to serve a resource index.
 *
 * @module @ui5/server/middleware/testRunner
 * @param {object} parameters Parameters
 * @param {object} parameters.resources Contains the resource reader or collection to access project related files
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources}) {
	return async function(req, res, next) {
		try {
			const pathname = parseurl(req).pathname;
			const parts = testRunnerResourceRegEx.exec(pathname);
			const resourceName = parts && parts[1];

			if (resourceName) { // either "testrunner.html", "testrunner.css" or "TestRunner.js" (case sensitive!)
				log.verbose(`Serving ${pathname}`);
				let pResource;
				if (!resourceCache[pathname]) {
					pResource = readFile(path.join(__dirname, "testRunner", resourceName), {encoding: "utf8"});
					resourceCache[pathname] = pResource;
				} else {
					pResource = resourceCache[pathname];
				}

				const resourceContent = await pResource;
				serveResource(res, pathname, resourceContent);
			} else {
				next();
			}
		} catch (err) {
			next(err);
		}
	};
}

module.exports = createMiddleware;

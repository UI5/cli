const log = require("@ui5/logger").getLogger("server:middleware:serveResources");
const replaceStream = require("replacestream");
const etag = require("etag");
const fresh = require("fresh");

const rProperties = /\.properties$/i;
const rReplaceVersion = /\.(library|js|json)$/i;

function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}


/**
 * Creates and returns the middleware to serve application resources.
 *
 * @module @ui5/server/middleware/serveResources
 * @param {object} parameters Parameters
 * @param {module:@ui5/server.middleware.MiddlewareManager.middlewareResources} parameters.resources Parameters
 * @param {object} parameters.middlewareUtil Specification version dependent interface to a
 *                                        [MiddlewareUtil]{@link module:@ui5/server.middleware.MiddlewareUtil} instance
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources, middlewareUtil}) {
	return async function serveResources(req, res, next) {
		try {
			const pathname = middlewareUtil.getPathname(req);
			const resource = await resources.all.byPath(pathname);
			if (!resource) { // Not found
				next();
				return;
			}
			if (log.isLevelEnabled("verbose")) {
				const treeify = require("treeify");
				log.verbose("\n" + treeify.asTree(resource.getPathTree()));
			}

			const resourcePath = resource.getPath();
			if (rProperties.test(resourcePath)) {
				// Special handling for *.properties files escape non ascii characters.
				const nonAsciiEscaper = require("@ui5/builder").processors.nonAsciiEscaper;
				const project = resource._project; // _project might not be defined
				let propertiesFileSourceEncoding = project && project.resources &&
					project.resources.configuration && project.resources.configuration.propertiesFileSourceEncoding;

				if (!propertiesFileSourceEncoding) {
					if (project && ["0.1", "1.0", "1.1"].includes(project.specVersion)) {
						// default encoding to "ISO-8859-1" for old specVersions
						propertiesFileSourceEncoding = "ISO-8859-1";
					} else {
						// default encoding to "UTF-8" for all projects starting with specVersion 2.0
						propertiesFileSourceEncoding = "UTF-8";
					}
				}
				const encoding = nonAsciiEscaper.getEncodingFromAlias(propertiesFileSourceEncoding);
				await nonAsciiEscaper({
					resources: [resource], options: {
						encoding
					}
				});
			}

			const {contentType, charset} = middlewareUtil.getMimeInfo(resourcePath);
			if (!res.getHeader("Content-Type")) {
				res.setHeader("Content-Type", contentType);
			}

			// Enable ETag caching
			res.setHeader("ETag", etag(resource.getStatInfo()));

			if (isFresh(req, res)) {
				// client has a fresh copy of the resource
				res.statusCode = 304;
				res.end();
				return;
			}

			let stream = resource.getStream();

			// Only execute version replacement for UTF-8 encoded resources because replaceStream will always output
			//	UTF-8 anyways.
			// Also, only process .library, *.js and *.json files. Just like it's done in Application-
			//	and LibraryBuilder
			if ((!charset || charset === "UTF-8") && rReplaceVersion.test(resourcePath)) {
				if (resource._project) {
					stream.setEncoding("utf8");
					stream = stream.pipe(replaceStream("${version}", resource._project.version));
				} else {
					log.verbose("Project missing from resource %s", pathname);
				}
			}

			stream.pipe(res);
		} catch (err) {
			next(err);
		}
	};
}

module.exports = createMiddleware;

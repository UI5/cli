const log = require("@ui5/logger").getLogger("server:middleware:serveResources");
const mime = require("mime-types");
const replaceStream = require("replacestream");
const etag = require("etag");
const fresh = require("fresh");
const parseurl = require("parseurl");

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
 * @param {Object} resources Contains the resource reader or collection to access project related files
 * @param {module:@ui5/fs.AbstractReader} resources.all Resource collection which contains the workspace and the project dependencies
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources}) {
	return async function serveResources(req, res, next) {
		try {
			const pathname = parseurl(req).pathname;
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
			const type = mime.lookup(resourcePath) || "application/octet-stream";
			const charset = mime.charset(type);
			if (rProperties.test(resourcePath)) {
				// Special handling for *.properties files escape non ascii characters.
				const nonAsciiEscaper = require("@ui5/builder").processors.nonAsciiEscaper;
				const project = resource._project; // _project might not be defined
				const propertiesFileSourceEncoding = project && project.resources &&
					project.resources.configuration && project.resources.configuration.propertiesFileSourceEncoding;
				const encoding = nonAsciiEscaper.getEncodingFromAlias(propertiesFileSourceEncoding || "ISO-8859-1");
				await nonAsciiEscaper({
					resources: [resource], options: {
						encoding
					}
				});
			}
			if (!res.getHeader("Content-Type")) {
				res.setHeader("Content-Type", type + (charset ? "; charset=" + charset : ""));
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

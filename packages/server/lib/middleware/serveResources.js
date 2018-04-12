const log = require("@ui5/logger").getLogger("server:middleware:serveResources");
const mime = require("mime-types");
const treeify = require("treeify");
const replaceStream = require("replacestream");
const etag = require("etag");
const fresh = require("fresh");

const rProperties = /\.properties$/;

function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}


/**
 * Creates and returns the middleware to serve application resources.
 *
 * @module server/middleware/serveResources
 * @param {Object} resourceCollections Contains the resource reader or collection to access project related files
 * @param {AbstractReader} resourceCollections.combo Resource collection which contains the workspace and the project dependencies
 * @returns {function} Returns a server middleware closure.
 */
function createMiddleware({resourceCollections}) {
	return function serveResources(req, res, next) {
		resourceCollections.combo.byPath(req.path).then(function(resource) {
			if (!resource) { // Not found
				next();
				return;
			}
			log.verbose("\n" + treeify.asTree(resource.getPathTree()));

			let type;
			let charset;
			if (rProperties.test(resource.getPath())) {
				// Special handling for *.properties files which are encoded with charset ISO-8859-1.
				type = "text/plain";
				charset = "ISO-8859-1";
			} else {
				type = mime.lookup(resource.getPath()) || "application/octet-stream";
			}

			if (!res.getHeader("Content-Type")) {
				if (!charset) {
					charset = mime.charset(type);
				}

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

			if ((type.startsWith("text/") || type === "application/javascript")) {
				if (resource._project) {
					stream = stream.pipe(replaceStream("${version}", resource._project.version));
				} else {
					log.verbose("Project missing from resource %s", req.path);
				}
			}

			stream.pipe(res);
		}).catch((err) => {
			next(err);
		});
	};
}

module.exports = createMiddleware;

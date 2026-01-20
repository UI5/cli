import etag from "etag";
import fresh from "fresh";

function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}

/**
 * Creates and returns the middleware to serve project resources.
 *
 * @module @ui5/server/middleware/serveResources
 * @param {object} parameters Parameters
 * @param {@ui5/server/internal/MiddlewareManager.middlewareResources} parameters.resources Parameters
 * @param {object} parameters.middlewareUtil [MiddlewareUtil]{@link @ui5/server/middleware/MiddlewareUtil} instance
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources, middlewareUtil}) {
	return async function serveResources(req, res, next) {
		try {
			const pathname = middlewareUtil.getPathname(req);
			const resource = await resources.all.byPath(pathname);
			if (!resource) {
				// Not found
				next();
				return;
			}

			const resourcePath = resource.getPath();

			const {contentType} = middlewareUtil.getMimeInfo(resourcePath);
			if (!res.getHeader("Content-Type")) {
				res.setHeader("Content-Type", contentType);
			}

			// Enable ETag caching
			const resourceIntegrity = await resource.getIntegrity();
			res.setHeader("ETag", etag(resourceIntegrity));

			if (isFresh(req, res)) {
				// client has a fresh copy of the resource
				res.statusCode = 304;
				res.end();
				return;
			}

			// Pipe resource stream to response
			// TODO: Check whether we can optimize this for small or even all resources by using getBuffer()
			res.send(await resource.getBuffer());
		} catch (err) {
			next(err);
		}
	};
}

export default createMiddleware;

import etag from "etag";
import {INJECT_SCRIPT_TAG} from "../liveReload/constants.js";
import {injectHead} from "./helper/injectHtml.js";
import isFresh from "./helper/isFresh.js";

/**
 * Creates and returns the middleware to serve project resources.
 *
 * @module @ui5/server/middleware/serveResources
 * @param {object} parameters Parameters
 * @param {@ui5/server/internal/MiddlewareManager.middlewareResources} parameters.resources Parameters
 * @param {object} parameters.middlewareUtil [MiddlewareUtil]{@link @ui5/server/middleware/MiddlewareUtil} instance
 * @param {boolean} [parameters.injectLiveReloadClient=false] Whether to inject the live reload client into HTML
 *   responses
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources, middlewareUtil, injectLiveReloadClient = false}) {
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

			const mimeInfo = middlewareUtil.getMimeInfo(resourcePath);
			if (!res.getHeader("Content-Type")) {
				res.setHeader("Content-Type", mimeInfo.contentType);
			}

			// Determine if the live reload client should be injected into the response
			const inject = injectLiveReloadClient && mimeInfo.type === "text/html";

			// Enable ETag caching
			const resourceIntegrity = await resource.getIntegrity();

			const effectiveEtag = inject ?
				etag(resourceIntegrity + ":" + INJECT_SCRIPT_TAG) :
				etag(resourceIntegrity);
			res.setHeader("ETag", effectiveEtag);

			if (isFresh(req, res)) {
				// client has a fresh copy of the resource
				res.statusCode = 304;
				res.end();
				return;
			}
			if (inject) {
				const html = await resource.getString();
				// Inject as early as possible so the WebSocket connects before any app
				// script runs. If a later script throws or hangs synchronously, a tag placed
				// further down would never execute and the page would stay stuck — exactly
				// when live reload is needed most.
				const body = injectHead(html, INJECT_SCRIPT_TAG);
				res.setHeader("Content-Length", Buffer.byteLength(body));
				res.end(body);
			} else {
				const body = await resource.getBuffer();
				res.setHeader("Content-Length", body.length);
				res.end(body);
			}
		} catch (err) {
			next(err);
		}
	};
}

export default createMiddleware;

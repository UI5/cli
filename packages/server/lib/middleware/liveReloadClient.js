import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import etag from "etag";
import {CLIENT_SCRIPT_PATH} from "../liveReload/constants.js";
import isFresh from "./helper/isFresh.js";

const CLIENT_SCRIPT_FILE_PATH = fileURLToPath(new URL("../liveReload/client.js", import.meta.url));

/**
 * Creates a middleware that serves the live reload client script at
 * <code>/.ui5/liveReload/client.js</code>. The actual WebSocket server is
 * wired up separately via <code>attachLiveReloadServer</code> in
 * <code>server.js</code>.
 *
 * @param {object} parameters Parameters
 * @param {object} parameters.middlewareUtil [MiddlewareUtil]{@link @ui5/server/middleware/MiddlewareUtil} instance
 * @param {boolean} [parameters.active=false] Whether live reload is enabled. When false, the middleware
 *   is mounted but passes all requests through without handling them.
 * @returns {Promise<Function>} Express middleware function
 */
export default async function createLiveReloadClientMiddleware({middlewareUtil, active = false}) {
	if (!active) {
		return function liveReloadClientInactive(req, res, next) {
			next();
		};
	}

	// Read once per middleware instance and serve from memory
	const clientScript = await readFile(CLIENT_SCRIPT_FILE_PATH, "utf8");
	const clientScriptEtag = etag(clientScript);

	return function liveReloadClient(req, res, next) {
		try {
			if (req.method !== "GET") {
				next();
				return;
			}

			const path = middlewareUtil.getPathname(req);

			if (path === CLIENT_SCRIPT_PATH) {
				res.setHeader("Content-Type", "application/javascript");
				res.setHeader("ETag", clientScriptEtag);

				if (isFresh(req, res)) {
					res.statusCode = 304;
					res.end();
					return;
				}
				res.end(clientScript);
			} else {
				next();
			}
		} catch (err) {
			next(err);
		}
	};
}

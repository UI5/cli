import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import etag from "etag";
import {CLIENT_SCRIPT_PATH, WS_PATH} from "../liveReload/constants.js";
import isFresh from "./helper/isFresh.js";

const CLIENT_SCRIPT_FILE_PATH = fileURLToPath(new URL("../liveReload/client.js", import.meta.url));

const WS_PATH_PLACEHOLDER = "__UI5_LR_WS_PATH__";
const WS_TOKEN_PLACEHOLDER = "__UI5_LR_WS_TOKEN__";

async function renderScript(token) {
	const template = await readFile(CLIENT_SCRIPT_FILE_PATH, "utf8");
	const clientScript = template
		.replace(WS_PATH_PLACEHOLDER, WS_PATH)
		.replace(WS_TOKEN_PLACEHOLDER, token);

	// Fail fast on a broken template — better than silently serving a script that can't reach the server.
	if (
		clientScript === template ||
		clientScript.includes(WS_PATH_PLACEHOLDER) ||
		clientScript.includes(WS_TOKEN_PLACEHOLDER)
	) {
		throw new Error(
			"liveReloadClient middleware: client.js template is missing one or more expected placeholders");
	}
	return clientScript;
}

/**
 * Creates a middleware that serves the live reload client script at
 * <code>/.ui5/liveReload/client.js</code>. The actual WebSocket server is
 * wired up separately via <code>attachLiveReloadServer</code> in
 * <code>server.js</code>.
 *
 * The script template carries the WebSocket path and per-process token via
 * placeholders that are substituted once at construction time.
 *
 * @param {object} parameters Parameters
 * @param {object} parameters.middlewareUtil [MiddlewareUtil]{@link @ui5/server/middleware/MiddlewareUtil} instance
 * @param {boolean} [parameters.active=false] Whether live reload is enabled. When false, the middleware
 *   is mounted but passes all requests through without handling them.
 * @param {string} [parameters.token] Per-process WebSocket token. Required when active is true.
 * @returns {Promise<Function>} Express middleware function
 */
export default async function createLiveReloadClientMiddleware({middlewareUtil, active = false, token}) {
	if (!active) {
		return function liveReloadClientInactive(req, res, next) {
			next();
		};
	}

	if (typeof token !== "string" || token.length === 0) {
		throw new Error("liveReloadClient middleware: token is required when active");
	}

	// Read once per middleware instance and serve from memory.
	const clientScript = await renderScript(token);
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

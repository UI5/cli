import {readFileSync} from "node:fs";
import escapeHtml from "escape-html";
import {INJECT_SCRIPT_TAG} from "../liveReload/constants.js";
import isDocumentNavigation from "./helper/isDocumentNavigation.js";

// Load the error-page template once at module load, as serveIndex.cjs does for directory.html.
const ERROR_PAGE_TEMPLATE = readFileSync(new URL("./errorPage.html", import.meta.url), "utf8");

function renderErrorPage({title, message, stack, liveReloadActive}) {
	const hint = liveReloadActive ?
		`Save your changes to rebuild. This page will reload automatically.` :
		"";
	return ERROR_PAGE_TEMPLATE
		.replaceAll("{title}", escapeHtml(title))
		.replaceAll("{message}", escapeHtml(message))
		.replaceAll("{stack}", escapeHtml(stack))
		.replaceAll("{hint}", hint)
		.replaceAll("{liveReloadScript}", liveReloadActive ? INJECT_SCRIPT_TAG : "");
}

/**
 * Express error-handling middleware for the UI5 dev server.
 *
 * Handles every <code>next(err)</code> in the middleware chain with HTTP 500. Browser
 * document navigations get a dedicated HTML error page that embeds the live-reload client
 * script when live reload is active, so the browser reloads once the source is fixed. Every
 * other request (fetch, XHR, asset loads) gets plain text with the error message and stack.
 *
 * Registering a 4-argument middleware makes Express treat it as an error handler; it must be
 * added AFTER all normal middlewares so it acts as the terminal catch-all.
 *
 * Console logging semantics live outside this handler; a follow-up will separate "expected"
 * build errors (already surfaced via the live banner) from unexpected ones that warrant an
 * error-level console log.
 *
 * @param {object} [parameters] Parameters
 * @param {object} [parameters.liveReload] Live reload configuration; mirrors the shape
 *   passed to <code>MiddlewareManager</code>. When <code>active</code> is <code>true</code>,
 *   the HTML error page embeds the live-reload client script so the browser reloads
 *   automatically once the developer fixes the source.
 * @returns {Function} Express-style <code>(err, req, res, next)</code> middleware.
 */
export default function createErrorHandler({liveReload} = {}) {
	const liveReloadActive = !!(liveReload && liveReload.active);
	return function errorHandler(err, req, res, next) {
		// Response already partly sent: can't rewrite it. Hand off to Express's default
		// handler, which closes the connection.
		if (res.headersSent) {
			return next(err);
		}
		const message = err?.message || String(err);
		const stack = err?.stack || "";
		const plainBody = stack || message;

		// Only browser document navigations get the styled HTML error page. Subresource
		// loads (scripts, stylesheets, XHR, fetch, images) keep the plain-text response so
		// the browser doesn't execute an HTML error page as JavaScript.
		if (isDocumentNavigation(req)) {
			res.statusCode = 500;
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(renderErrorPage({
				title: "UI5 Server failed to build one or more projects",
				message,
				stack,
				liveReloadActive,
			}));
			return;
		}

		res.statusCode = 500;
		res.setHeader("Content-Type", "text/plain; charset=utf-8");
		res.end(plainBody);
	};
}

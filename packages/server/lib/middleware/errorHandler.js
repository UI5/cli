import {readFileSync} from "node:fs";
import {INJECT_SCRIPT_TAG} from "../liveReload/constants.js";
import isDocumentNavigation from "./helper/isDocumentNavigation.js";

// Load the error-page template once at module load. Same pattern as
// serveIndex/serveIndex.cjs uses for directory.html.
const ERROR_PAGE_TEMPLATE = readFileSync(new URL("./errorPage.html", import.meta.url), "utf8");

const HTML_ESCAPES = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;",
};

function escapeHtml(str) {
	return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

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
 * Handles every <code>next(err)</code> call in the middleware chain by responding with
 * HTTP 500. For requests that accept <code>text/html</code> (navigations from a browser),
 * responds with a dedicated HTML error page that embeds the live-reload client script
 * when live reload is active — so the browser reloads automatically once the developer
 * fixes the source. For every other request (fetch, XHR, asset loads), responds with
 * plain text containing the error message and stack.
 *
 * Registering a 4-argument middleware makes Express treat it as an error handler; it
 * must be added AFTER all normal middlewares so it acts as the terminal catch-all.
 *
 * Console logging semantics live outside this handler — a follow-up will differentiate
 * "expected" build errors (surfaced via the live banner already) from unexpected ones
 * that still warrant an error-level console log.
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
		// If the response is already partly sent, we can't rewrite it — hand off to
		// Express's default handler which will close the connection.
		if (res.headersSent) {
			return next(err);
		}
		const message = err?.message || String(err);
		const stack = err?.stack || "";
		const plainBody = stack || message;

		// Content-negotiate: only browser document navigations get the styled HTML
		// error page. Subresource loads (scripts, stylesheets, XHR, fetch, images)
		// keep the plain-text response so a browser doesn't try to execute an HTML
		// error page as JavaScript.
		if (isDocumentNavigation(req)) {
			res.status(500);
			res.type("text/html; charset=utf-8");
			res.send(renderErrorPage({
				title: "UI5 Server failed to build one or more projects",
				message,
				stack,
				liveReloadActive,
			}));
			return;
		}

		res.status(500);
		res.type("text/plain; charset=utf-8");
		res.send(plainBody);
	};
}

/**
 * Express error-handling middleware for the UI5 dev server.
 *
 * Handles every <code>next(err)</code> call in the middleware chain by responding with
 * HTTP 500 and a plain-text body containing the error message and (when available) the
 * stack trace. Registering a 4-argument middleware makes Express treat it as an error
 * handler; it must be added AFTER all normal middlewares so it acts as the terminal
 * catch-all.
 *
 * Console logging semantics live outside this handler — a follow-up will differentiate
 * "expected" build errors (surfaced via the live banner already) from unexpected ones
 * that still warrant an error-level console log.
 *
 * @returns {Function} Express-style <code>(err, req, res, next)</code> middleware.
 */
export default function createErrorHandler() {
	return function errorHandler(err, req, res, next) {
		// If the response is already partly sent, we can't rewrite it — hand off to
		// Express's default handler which will close the connection.
		if (res.headersSent) {
			return next(err);
		}
		const message = err?.stack || err?.message || String(err);
		res.status(500);
		res.type("text/plain; charset=utf-8");
		res.send(message);
	};
}

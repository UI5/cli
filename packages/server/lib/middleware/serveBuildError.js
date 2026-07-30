import isDocumentNavigation from "./helper/isDocumentNavigation.js";

/**
 * Creates a middleware that diverts requests to the terminal error handler while the build server
 * cannot serve them.
 *
 * Two failure modes, checked in order:
 *
 * <strong>Degraded</strong> (<code>getDegradedError</code>): a project re-resolve failed and the
 * last-good stack is kept alive, but its graph no longer matches the definition on disk. The
 * surviving build server's reader would block every request until the source burst settles, so
 * <em>every</em> request is diverted, not just document navigations. Preempts the per-project gate.
 *
 * <strong>Global ERROR</strong> (<code>getServeError</code>): a project is in its ERROR state. The
 * per-project reader (<code>serveResources</code>) only shows the build-error page when the
 * requested path maps to the failed project. A navigation to an unaffected resource (the app's
 * <code>index.html</code> while a dependency library is broken) would otherwise serve a normal 200
 * even though the server as a whole is unusable. So for document navigations, this gate calls
 * <code>next(err)</code> with the server-level error, showing the error page whatever was requested.
 * Asset/XHR/fetch loads pass through and keep their per-project behavior, so a browser never gets an
 * HTML error page for a failing subresource.
 *
 * Rendering stays in the terminal <code>errorHandler</code>; this middleware only decides whether to
 * divert. The error handler branches on the same document-navigation signal, so a diverted
 * subresource gets a plain-text 500 rather than an HTML page executed as script.
 *
 * Registered before <code>serveResources</code> so it can preempt an otherwise-successful 200. Must
 * be a normal 3-argument middleware: the 4-argument <code>errorHandler</code> is only reached once
 * something calls <code>next(err)</code>, which never happens for a request that would succeed.
 *
 * @module @ui5/server/middleware/serveBuildError
 * @param {object} parameters Parameters
 * @param {Function} [parameters.getServeError] Accessor returning the captured server-level
 *   error, or <code>null</code> when the server is not in ERROR. When omitted, the per-project
 *   gate passes every request through.
 * @param {Function} [parameters.getDegradedError] Accessor returning a supervisor-level error
 *   while the serving stack is degraded after a failed re-resolve, or a falsy value otherwise.
 *   When set, every request is diverted. When omitted, the degraded gate is inert.
 * @returns {Function} Express middleware function
 */
function createMiddleware({getServeError, getDegradedError} = {}) {
	return function serveBuildError(req, res, next) {
		// Degraded: divert every request, before the per-project navigation gate.
		const degradedError = getDegradedError?.();
		if (degradedError) {
			next(degradedError);
			return;
		}
		const serveError = getServeError?.();
		if (serveError && isDocumentNavigation(req)) {
			next(serveError);
			return;
		}
		next();
	};
}

export default createMiddleware;

import isDocumentNavigation from "./helper/isDocumentNavigation.js";

/**
 * Creates a middleware that diverts browser document navigations to the terminal error
 * handler while the build server is globally in its ERROR state.
 *
 * The per-project reader (<code>serveResources</code>) only surfaces the build-error page
 * when the requested path maps to the project whose build failed. A navigation to an
 * unaffected resource — the app's <code>index.html</code> while a dependency library is
 * broken — would otherwise serve a normal 200 even though the server as a whole is
 * unusable. This gate consults the server-level error and, for document navigations only,
 * calls <code>next(err)</code> so the error page is shown regardless of which resource was
 * requested.
 *
 * Only document navigations are diverted; asset/XHR/fetch loads pass through and keep their
 * per-project behavior, so a browser never receives an HTML error page for a failing
 * subresource request. Rendering stays in the terminal <code>errorHandler</code> — this
 * middleware only decides whether to divert.
 *
 * Registered before <code>serveResources</code> so it can preempt an otherwise-successful
 * 200. It must be a normal 3-argument middleware: the 4-argument <code>errorHandler</code>
 * is only reached once something upstream calls <code>next(err)</code>, which never happens
 * for a navigation that would otherwise succeed.
 *
 * @module @ui5/server/middleware/serveBuildError
 * @param {object} parameters Parameters
 * @param {Function} [parameters.getServeError] Accessor returning the captured server-level
 *   error, or <code>null</code> when the server is not in ERROR. When omitted, the middleware
 *   passes every request through.
 * @returns {Function} Express middleware function
 */
function createMiddleware({getServeError} = {}) {
	return function serveBuildError(req, res, next) {
		const serveError = getServeError?.();
		if (serveError && isDocumentNavigation(req)) {
			next(serveError);
			return;
		}
		next();
	};
}

export default createMiddleware;

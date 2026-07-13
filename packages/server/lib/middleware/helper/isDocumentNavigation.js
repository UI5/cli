/**
 * Detects browser document navigations.
 *
 * <code>req.accepts("html")</code> returns "html" for a wildcard Accept header, which
 * is exactly what browsers send for script and stylesheet subresources — so accepting
 * html alone would serve an HTML error page in response to a failing .js request, and
 * the browser would either execute it as JavaScript or discard it. Two stricter
 * signals in order of preference:
 *
 * 1. <code>Sec-Fetch-Dest: document</code>. Sent by every current browser for top-level
 *    navigations and only for those. If the header is present but not "document", the
 *    request is a subresource load — never render HTML.
 * 2. <code>Accept</code> header explicitly listing <code>text/html</code>. Navigations
 *    send <code>text/html,application/xhtml+xml,...</code>; scripts and stylesheets
 *    send a bare wildcard. Matching <code>text/html</code> as a substring rejects the
 *    wildcard case that <code>req.accepts</code> lets through.
 *
 * @module @ui5/server/middleware/helper/isDocumentNavigation
 * @param {object} req Request object
 * @returns {boolean} True if the request looks like a browser document navigation.
 */
export default function isDocumentNavigation(req) {
	const headers = req.headers || {};
	const fetchDest = headers["sec-fetch-dest"];
	if (fetchDest) {
		return fetchDest === "document";
	}
	const accept = headers["accept"];
	if (!accept) {
		return false;
	}
	// Match text/html explicitly — not through the */* fallback. Substring is enough
	// because the Accept header is a comma-separated list of media types and text/html
	// only appears as a full type, never as a substring of another.
	return accept.includes("text/html");
}

/**
 * Detects browser document navigations.
 *
 * <code>req.accepts("html")</code> returns "html" for the wildcard Accept header that
 * browsers send for script and stylesheet subresources, so it would serve an HTML error
 * page for a failing .js request. Two stricter signals, in order of preference:
 *
 * 1. <code>Sec-Fetch-Dest: document</code>. Sent by current browsers for top-level
 *    navigations and only those. Present but not "document" means a subresource load.
 * 2. <code>Accept</code> explicitly listing <code>text/html</code>. Navigations send
 *    <code>text/html,application/xhtml+xml,...</code>; subresources send a bare wildcard.
 *    Matching <code>text/html</code> as a substring rejects the wildcard case.
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
	// Match text/html explicitly, not through the */* fallback. Substring is enough: the
	// Accept header is a comma-separated media-type list where text/html only appears as a
	// full type, never inside another.
	return accept.includes("text/html");
}

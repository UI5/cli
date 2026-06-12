import fresh from "fresh";

/**
 * Checks whether the client has a fresh copy of the resource based on the
 * <code>ETag</code> response header and the request's conditional headers.
 *
 * @param {object} req Request
 * @param {object} res Response
 * @returns {boolean} True if the client's cached copy is still fresh
 */
export default function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}

import parseurl from "parseurl";

/**
 * Returns the [pathname]{@link https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname}
 * of a given request. Any escape sequences will be decoded.
 *
 * @private
 * @param {object} req Request object
 * @returns {string} [Pathname]{@link https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname}
 * of the given request
 */
export default function getPathname(req) {
	let {pathname} = parseurl(req);
	pathname = decodeURIComponent(pathname);
	return pathname;
}

/**
 * Convenience functions for UI5 Server middleware.
 * An instance of this class is passed to every standard UI5 Server middleware.
 * Custom middleware that define a specification version >= 2.0 will also receive an instance
 * of this class as part of the parameters of their create-middleware function.
 *
 * The set of functions that can be accessed by a custom middleware depends on the specification
 * version defined for the extension.
 *
 * @public
 * @memberof module:@ui5/server.middleware
 */
class MiddlewareUtil {
	/**
	 * Get an interface to an instance of this class that only provides those functions
	 * that are supported by the given custom middleware extension specification version.
	 *
	 * @param {string} specVersion Specification Version of custom middleware extension
	 * @returns {object} An object with bound instance methods supported by the given specification version
	 */
	getInterface(specVersion) {
		const baseInterface = {
			getPathname: this.getPathname.bind(this),
			getMimeInfo: this.getMimeInfo.bind(this)
		};
		switch (specVersion) {
		case "0.1":
		case "1.0":
		case "1.1":
			return undefined;
		case "2.0":
		case "2.1":
		case "2.2":
		case "2.3":
		case "2.4":
		case "2.5":
		case "2.6":
			return baseInterface;
		default:
			throw new Error(`MiddlewareUtil: Unknown or unsupported Specification Version ${specVersion}`);
		}
	}

	/**
	 * Returns the [pathname]{@link https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname}
	 * of a given request. Any escape sequences will be decoded.
	 * </br></br>
	 * This method is only available to custom middleware extensions defining
	 * <b>Specification Version 2.0 and above</b>.
	 *
	 * @param {object} req Request object
	 * @returns {string} [Pathname]{@link https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname}
	 * of the given request
	 * @public
	 */
	getPathname(req) {
		const parseurl = require("parseurl");
		let {pathname} = parseurl(req);
		pathname = decodeURIComponent(pathname);
		return pathname;
	}

	/**
	 * MIME Info
	 *
	 * @example
	 * const mimeInfo = {
	 * 	"type": "text/html",
	 * 	"charset": "utf-8",
	 * 	"contentType": "text/html; charset=utf-8"
	 * };
	 *
	 * @public
	 * @typedef {object} MimeInfo
	 * @property {string} type Detected content-type for the given resource path
	 * @property {string} charset Default charset for the detected content-type
	 * @property {string} contentType Calculated content-type header value
	 * @memberof module:@ui5/server.middleware.MiddlewareUtil
	 */
	/**
	 * Returns MIME information derived from a given resource path.
	 * </br></br>
	 * This method is only available to custom middleware extensions defining
	 * <b>Specification Version 2.0 and above</b>.
	 *
	 * @param {object} resourcePath
	 * @returns {module:@ui5/server.middleware.MiddlewareUtil.MimeInfo}
	 * @public
	 */
	getMimeInfo(resourcePath) {
		const mime = require("mime-types");
		const type = mime.lookup(resourcePath) || "application/octet-stream";
		const charset = mime.charset(type);
		return {
			type,
			charset,
			contentType: type + (charset ? "; charset=" + charset : "")
		};
	}
}

module.exports = MiddlewareUtil;

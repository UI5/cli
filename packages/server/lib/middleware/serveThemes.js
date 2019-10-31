const themeBuilder = require("@ui5/builder").processors.themeBuilder;
const fsInterface = require("@ui5/fs").fsInterface;
const etag = require("etag");
const fresh = require("fresh");
const parseurl = require("parseurl");

function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}

const themeRequest = /^(.*\/)library(?:(\.css)|(-RTL\.css)|(-parameters\.json))$/i;

/**
 * Creates and returns the middleware to build themes.
 *
 * The theme is built in realtime. If a less file was modified, the theme build is triggered to rebuild the theme.
 *
 * @module @ui5/server/middleware/serveThemes
 * @param {Object} parameters Parameters
 * @param {Object} parameters.resources Contains the resource reader or collection to access project related files
 * @param {module:@ui5/fs.AbstractReader} parameters.resources.all Resource collection which contains the workspace and the project dependencies
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources}) {
	const builder = new themeBuilder.ThemeBuilder({
		fs: fsInterface(resources.all)
	});

	return function theme(req, res, next) {
		const pathname = parseurl(req).pathname;
		/* pathname examples:
			/resources/sap/ui/core/themes/sap_belize/library.css
		*/

		/* groups (array index):
			 1 => theme directory (example: /resources/sap/ui/core/themes/sap_belize/)
			 2 => .css suffix
			 3 => -RTL.css suffix
			 4 => -parameters.json suffix
		*/
		const themeReq = themeRequest.exec(pathname);
		if (!themeReq) {
			next();
			return;
		}

		const sourceLessPath = themeReq[1] + "library.source.less";
		resources.all.byPath(sourceLessPath).then((sourceLessResource) => {
			if (!sourceLessResource) { // Not found
				next();
				return;
			}
			return builder.build([sourceLessResource]).then(function([css, cssRtl, parameters]) {
				let resource;
				if (themeReq[2]) { // -> .css
					res.setHeader("Content-Type", "text/css");
					resource = css;
				} else if (themeReq[3]) { // -> -RTL.css
					res.setHeader("Content-Type", "text/css");
					resource = cssRtl;
				} else if (themeReq[4]) { // -parameters.json
					res.setHeader("Content-Type", "application/json");
					resource = parameters;
				} else {
					next("Couldn't decide on which theme file to return. This shouldn't happen");
					return;
				}

				return resource.getBuffer().then((content) => {
					res.setHeader("ETag", etag(content));

					if (isFresh(req, res)) {
						// client has a fresh copy of the resource
						res.statusCode = 304;
						res.end();
						return;
					}

					res.end(content.toString());
				});
			});
		}).catch(function(err) {
			next(err);
		});
	};
}

module.exports = createMiddleware;

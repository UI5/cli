const themeBuilder = require("@ui5/builder").processors.themeBuilder;
const fsInterface = require("@ui5/fs").fsInterface;
const etag = require("etag");
const fresh = require("fresh");

function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}

const themeRequest = /^(.*\/)library(?:(\.css)|(-RTL\.css)|(-parameters\.json))$/i;

function createMiddleware({resourceCollections}) {
	const builder = new themeBuilder.ThemeBuilder({
		fs: fsInterface(resourceCollections.combo)
	});

	return function theme(req, res, next) {
		/* req.path examples:
			/resources/sap/ui/core/themes/sap_belize/library.css
		*/

		/* groups (array index):
			 1 => theme directory (example: /resources/sap/ui/core/themes/sap_belize/)
			 2 => .css suffix
			 3 => -RTL.css suffix
			 4 => -parameters.json suffix
		*/
		var themeReq = themeRequest.exec(req.path);
		if (!themeReq) {
			next();
			return;
		}

		const sourceLessPath = themeReq[1] + "library.source.less";
		resourceCollections.combo.byPath(sourceLessPath).then((sourceLessResource) => {
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

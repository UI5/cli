const themeBuilder = require("@ui5/builder").processors.themeBuilder;
const fsInterface = require("@ui5/fs").fsInterface;
const {basename, dirname} = require("path").posix;
const etag = require("etag");
const fresh = require("fresh");
const parseurl = require("parseurl");

function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}

// List of experimental css variables resources that should activate the "cssVariables" build
const cssVariablesThemeResources = [
	"css_variables.source.less",
	"css_variables.css",
	"library_skeleton.css",
	"library_skeleton-RTL.css"
];

// List of resources that should be handled by the middleware
const themeResources = [
	"library.css",
	"library-RTL.css",
	"library-parameters.json",
	...cssVariablesThemeResources
];

/**
 * Creates and returns the middleware to build themes.
 *
 * The theme is built in realtime. If a less file was modified, the theme build is triggered to rebuild the theme.
 *
 * @module @ui5/server/middleware/serveThemes
 * @param {object} parameters Parameters
 * @param {object} parameters.resources Contains the resource reader or collection to access project related files
 * @param {module:@ui5/fs.AbstractReader} parameters.resources.all Resource collection which contains the workspace and the project dependencies
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources, middlewareUtil}) {
	const builder = new themeBuilder.ThemeBuilder({
		fs: fsInterface(resources.all)
	});
	const buildOptions = {};

	return async function theme(req, res, next) {
		try {
			const pathname = parseurl(req).pathname;
			const filename = basename(pathname);
			if (!themeResources.includes(filename)) {
				next();
				return;
			}

			if (cssVariablesThemeResources.includes(filename) && !buildOptions.cssVariables) {
				// Activate CSS Variables build the first time a relevant resource is requested
				buildOptions.cssVariables = true;
				// Clear the cache to ensure that the build is executed again with "cssVariables: true"
				builder.clearCache();
			}

			const sourceLessPath = dirname(pathname) + "/library.source.less";
			const sourceLessResource = await resources.all.byPath(sourceLessPath);
			if (!sourceLessResource) { // Not found
				next();
				return;
			}

			const createdResources = await builder.build([sourceLessResource], buildOptions);
			// Pick requested file resource
			const resource = createdResources.find((res) => res.getPath().endsWith(filename));
			if (!resource) {
				next(new Error(`Theme Build did not return requested file "${pathname}"`));
				return;
			}

			const resourcePath = resource.getPath();
			const {contentType} = middlewareUtil.getMimeInfo(resourcePath);
			res.setHeader("Content-Type", contentType);

			const content = await resource.getBuffer();
			res.setHeader("ETag", etag(content));

			if (isFresh(req, res)) {
				// client has a fresh copy of the resource
				res.statusCode = 304;
				res.end();
				return;
			}

			res.end(content.toString());
		} catch (err) {
			next(err);
		}
	};
}

module.exports = createMiddleware;

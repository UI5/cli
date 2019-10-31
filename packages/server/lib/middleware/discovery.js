const librariesPattern = /([A-Z0-9._%+-/]+)\/[A-Z0-9._]*\.library$/i;
const testPagesPattern = /(([A-Z0-9._%+-]+\/)+([A-Z_0-9-\\.]+)\.(html|htm))$/i;
const urlPattern = /\/(app_pages|all_libs|all_tests)(?:[?#].*)?$/;

/**
 * Creates and returns the middleware to discover project files.
 *
 * List project files with URL (needed exclusively by the OpenUI5 testsuite):
 * <ul>
 * <li>/discovery/app_pages: get application pages</li>
 * <li>/discovery/all_libs: list all libraries</li>
 * <li>/discovery/all_tests: list all tests</li>
 * </ul>
 *
 * @module @ui5/server/middleware/discovery
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.AbstractReader} parameters.resources.all Reader or Collection to read resources of the
 *                                        root project and its dependencies
 * @param {module:@ui5/fs.AbstractReader} parameters.resources.rootProject Reader or Collection to read resources of
 *                                        the project the server is started in
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources}) {
	return function discoveryMiddleware(req, res, next) {
		const parts = urlPattern.exec(req.url);
		const type = parts && parts[1];
		if (!type) {
			next();
			return;
		}

		const response = [];

		function sendResponse() {
			const responseData = {};
			response.sort((a, b) => {
				if (type === "app_pages" || type === "all_libs") {
					return a.entry.localeCompare(b.entry);
				} else {
					return a.lib.localeCompare(b.lib);
				}
			});
			responseData[type] = response;
			res.writeHead(200, {
				"Content-Type": "application/json"
			});
			res.end(JSON.stringify(responseData));
		}

		if (type === "app_pages") {
			resources.rootProject.byGlob("/**/*.{html,htm}").then(function(resources) {
				resources.forEach(function(resource) {
					const relPath = resource.getPath().substr(1); // cut off leading "/"
					response.push({
						entry: relPath
					});
				});
				sendResponse();
			});
		} else if (type === "all_libs") {
			resources.all.byGlob([
				"/resources/**/*.library"
			]).then(function(resources) {
				resources.forEach(function(resource) {
					const relPath = resource.getPath().substr(11); // cut off leading "/resources/"
					const match = librariesPattern.exec(relPath);
					if (match) {
						response.push({
							entry: match[1]
						});
					}
				});
				sendResponse();
			});
		} else if (type === "all_tests") {
			Promise.all([
				resources.all.byGlob("/resources/**/*.library"),
				resources.all.byGlob("/test-resources/**/*.{html,htm}")
			]).then(function(results) {
				const libraryResources = results[0];
				const testPageResources = results[1];
				const libs = {};

				libraryResources.forEach(function(resource) {
					const relPath = resource.getPath().substr(11); // cut off leading "/resources/"
					const match = librariesPattern.exec(relPath);
					if (match) {
						const lib = match[1];
						libs[lib] = lib.replace(/\//g, ".");
					}
				});

				testPageResources.forEach(function(resource) {
					const relPath = resource.getPath().substr(16); // cut off leading "/test-resources/"
					if (testPagesPattern.test(relPath)) {
						Object.keys(libs).forEach(function(lib) {
							if (relPath.indexOf(lib) === 0) {
								response.push({
									lib: libs[lib],
									name: relPath.substr(lib.length + 1),
									url: "../" + relPath
								});
							}
						});
					}
				});

				sendResponse();
			});
		} else {
			next(new Error(`Unknown discovery type "${type}"`));
		}
	};
}

module.exports = createMiddleware;

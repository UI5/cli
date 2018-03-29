const librariesPattern = /([A-Z0-9._%+-/]+)\/[A-Z0-9._]*\.library$/i;
const testPagesPattern = /(([A-Z0-9._%+-]+\/)+([A-Z_0-9-\\.]+)\.(html|htm))$/i;
const urlPattern = /\/(app_pages|all_libs|all_tests)(?:[?#].*)?$/;

function createMiddleware({resourceCollections}) {
	return function discoveryMiddleware(req, res, next) {
		var parts = urlPattern.exec(req.url);
		var type = parts && parts[1];
		if (!type) {
			next();
			return;
		}

		var response = [];

		function sendResponse() {
			var responseData = {};
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
			resourceCollections.source.byGlob("/**/*.{html,htm}").then(function(resources) {
				resources.forEach(function(resource) {
					let relPath = resource.getPath().substr(1); // cut off leading "/"
					response.push({
						entry: relPath
					});
				});
				sendResponse();
			});
		} else if (type === "all_libs") {
			resourceCollections.combo.byGlob([
				"/resources/**/*.library"
			]).then(function(resources) {
				resources.forEach(function(resource) {
					let relPath = resource.getPath().substr(11); // cut off leading "/resources/"
					var match = librariesPattern.exec(relPath);
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
				resourceCollections.combo.byGlob("/resources/**/*.library"),
				resourceCollections.combo.byGlob("/test-resources/**/*.{html,htm}")
			]).then(function(results) {
				let libraryResources = results[0];
				let testPageResources = results[1];
				var libs = {};

				libraryResources.forEach(function(resource) {
					let relPath = resource.getPath().substr(11); // cut off leading "/resources/"
					var match = librariesPattern.exec(relPath);
					if (match) {
						var lib = match[1];
						libs[lib] = lib.replace(/\//g, ".");
					}
				});

				testPageResources.forEach(function(resource) {
					let relPath = resource.getPath().substr(16); // cut off leading "/test-resources/"
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
			next(new Error(`Unkown discovery type "${type}"`));
		}
	};
}

module.exports = createMiddleware;

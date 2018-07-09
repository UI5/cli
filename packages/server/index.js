const ui5Server = {
	server: require("./lib/server"),
	sslUtil: require("./lib/sslUtil"),
	middleware: {
		csp: require("./lib/middleware/csp"),
		discovery: require("./lib/middleware/discovery"),
		nonReadRequests: require("./lib/middleware/discovery"),
		serveIndex: require("./lib/middleware/serveIndex"),
		serveResources: require("./lib/middleware/serveResources"),
		serveThemes: require("./lib/middleware/serveThemes"),
		versionInfo: require("./lib/middleware/versionInfo"),
	}
};

module.exports = ui5Server;

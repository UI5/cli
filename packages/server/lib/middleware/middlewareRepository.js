const middlewares = {
	compression: {path: "compression"},
	cors: {path: "cors"},
	csp: {path: "./csp"},
	serveResources: {path: "./serveResources"},
	serveIndex: {path: "./serveIndex"},
	discovery: {path: "./discovery"},
	versionInfo: {path: "./versionInfo"},
	connectUi5Proxy: {path: "./connectUi5Proxy"},
	serveThemes: {path: "./serveThemes"},
	testRunner: {path: "./testRunner"},
	nonReadRequests: {path: "./nonReadRequests"}
};

function getMiddleware(middlewareName) {
	const middlewareInfo = middlewares[middlewareName];

	if (!middlewareInfo) {
		throw new Error(`middlewareRepository: Unknown Middleware ${middlewareName}`);
	}
	return {
		middleware: require(middlewareInfo.path),
		specVersion: middlewareInfo.specVersion
	};
}

function addMiddleware({name, specVersion, middlewarePath}) {
	if (middlewares[name]) {
		throw new Error(`middlewareRepository: A middleware with the name ${name} has already been registered`);
	}
	middlewares[name] = {
		path: middlewarePath,
		specVersion
	};
}

module.exports = {
	getMiddleware: getMiddleware,
	addMiddleware: addMiddleware
};

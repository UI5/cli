const middlewareInfos = {
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
	const middlewareInfo = middlewareInfos[middlewareName];

	if (!middlewareInfo) {
		throw new Error(`middlewareRepository: Unknown Middleware ${middlewareName}`);
	}
	try {
		const middleware = require(middlewareInfo.path);
		return {
			middleware,
			specVersion: middlewareInfo.specVersion
		};
	} catch (err) {
		throw new Error(
			`middlewareRepository: Failed to require middleware module for ${middlewareName}: ${err.message}`);
	}
}

function addMiddleware({name, specVersion, middlewarePath}) {
	if (middlewareInfos[name]) {
		throw new Error(`middlewareRepository: A middleware with the name ${name} has already been registered`);
	}
	middlewareInfos[name] = {
		path: middlewarePath,
		specVersion
	};
}

module.exports = {
	getMiddleware: getMiddleware,
	addMiddleware: addMiddleware
};

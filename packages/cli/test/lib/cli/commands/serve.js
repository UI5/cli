const test = require("ava");
const sinon = require("sinon");
const normalizer = require("@ui5/project").normalizer;
const serve = require("../../../../lib/cli/commands/serve");
const ui5Server = require("@ui5/server");
const server = ui5Server.server;
const mockRequire = require("mock-require");
const defaultInitialHandlerArgs = Object.freeze({
	accessRemoteConnections: false,
	cert: "$HOME/.ui5/server/server.crt",
	h2: false,
	key: "$HOME/.ui5/server/server.key",
	loglevel: "info",
	t8r: "npm",
	translator: "npm"
});

const projectTree = {
	metadata: {
		name: "Sample"
	}
};

let normalizerStub = null;
let serverStub = null;
let sslUtilStub = null;

test.beforeEach((t) => {
	normalizerStub = sinon.stub(normalizer, "generateProjectTree");
	serverStub = sinon.stub(server, "serve");
	sslUtilStub = sinon.stub(ui5Server.sslUtil, "getSslCertificate");
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("ui5 serve: default", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({h2: false, port: 8080});

	// loads project tree
	const pPrepareServerConfig = await serve.handler(defaultInitialHandlerArgs);
	// preprocess project config, skipping cert load
	const pServeServer = await pPrepareServerConfig;
	// serve server using config
	await pServeServer;

	const injectedProjectTree = serverStub.getCall(0).args[0];
	const injectedServerConfig = serverStub.getCall(0).args[1];

	t.deepEqual(injectedProjectTree, projectTree, "Starting server with given project tree");
	t.deepEqual(injectedServerConfig, {
		changePortIfInUse: true,
		acceptRemoteConnections: false,
		h2: false,
		port: 8080,
		cert: undefined,
		key: undefined,
		sendSAPTargetCSP: false
	}, "Starting server with specific server config");
});

test.serial("ui5 serve --h2", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({h2: true, port: 8443});
	sslUtilStub.resolves({
		key: "randombyte-likes-ponies-key",
		cert: "randombyte-likes-ponies-cert"
	});

	// loads project tree using http 2
	const pPrepareServerConfig = await serve.handler(Object.assign({}, defaultInitialHandlerArgs, {h2: true}));
	// preprocess project config
	const pFetchSSLCert = await pPrepareServerConfig;
	// Fetching ssl certificate
	const pServeServer = await pFetchSSLCert;
	// serve server using config
	await pServeServer;

	const injectedProjectTree = serverStub.getCall(0).args[0];
	const injectedServerConfig = serverStub.getCall(0).args[1];

	t.is(sslUtilStub.getCall(0).args[0], "$HOME/.ui5/server/server.key", "Load ssl key from default path");
	t.is(sslUtilStub.getCall(0).args[1], "$HOME/.ui5/server/server.crt", "Load ssl cert from default path");
	t.deepEqual(injectedProjectTree, projectTree, "Starting server with given project tree");
	t.is(injectedServerConfig.port === 8443, true, "http2 default port was auto set");

	t.deepEqual(injectedServerConfig, {
		changePortIfInUse: true,
		acceptRemoteConnections: false,
		h2: true,
		port: 8443,
		key: "randombyte-likes-ponies-key",
		cert: "randombyte-likes-ponies-cert",
		sendSAPTargetCSP: false
	}, "Starting server with specific server config");
});

test.serial("ui5 serve --accept-remote-connections", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({port: 8080});
	const pPrepareServerConfig = await serve.handler(
		Object.assign({}, defaultInitialHandlerArgs, {acceptRemoteConnections: true})
	);
	const pServeServer = await pPrepareServerConfig;
	await pServeServer;
	const injectedServerConfig = serverStub.getCall(0).args[1];
	t.is(injectedServerConfig.acceptRemoteConnections, true, "Remove connections are accepted");
});

test.serial("ui5 serve --open", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({port: 8080});
	mockRequire("open", function(openedUrl) {
		t.is(openedUrl, "http://localhost:8080/webapp/index.html", `Opens url: ${openedUrl}`);
		mockRequire.stop("open");
	});
	await serve.handler(
		Object.assign({}, defaultInitialHandlerArgs, {open: "webapp/index.html"})
	);
});

test.serial("ui5 serve --open (opens default url)", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({port: 8080});
	mockRequire("open", function(openedUrl) {
		t.is(openedUrl, "http://localhost:8080", `Opens url: ${openedUrl}`);
		mockRequire.stop("open");
	});
	await serve.handler(
		Object.assign({}, defaultInitialHandlerArgs, {open: true})
	);
});

test.serial("ui5 serve --key --cert", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({h2: true, port: 8443});
	sslUtilStub.resolves({
		key: "ponies-loaded-from-custompath-key",
		cert: "ponies-loaded-from-custompath-crt"
	});

	// loads project tree using http 2
	const pPrepareServerConfig = await serve.handler(Object.assign({}, defaultInitialHandlerArgs, {
		h2: true,
		key: "server/randombyte-likes-ponies.key",
		cert: "server/randombyte-likes-ponies.crt"
	}));
	// preprocess project config
	const pFetchSSLCert = await pPrepareServerConfig;
	// Fetching ssl certificate
	const pServeServer = await pFetchSSLCert;
	// serve server using config
	await pServeServer;

	const injectedServerConfig = serverStub.getCall(0).args[1];
	t.is(sslUtilStub.getCall(0).args[0], "server/randombyte-likes-ponies.key", "Loading key from specified path");
	t.is(sslUtilStub.getCall(0).args[1], "server/randombyte-likes-ponies.crt", "Loading cert from specified path");
	t.deepEqual(injectedServerConfig, {
		changePortIfInUse: true,
		acceptRemoteConnections: false,
		h2: true,
		port: 8443,
		key: "ponies-loaded-from-custompath-key",
		cert: "ponies-loaded-from-custompath-crt",
		sendSAPTargetCSP: false
	}, "Starting server with specific server config");
});


test.serial("ui5 serve --translator --config", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({h2: false, port: 8080});

	const pPrepareServerConfig = await serve.handler(Object.assign({}, defaultInitialHandlerArgs, {
		translator: "static",
		config: "path/to/my/config.json"
	}));
	const pServeServer = await pPrepareServerConfig;
	await pServeServer;

	t.deepEqual(normalizerStub.getCall(0).args[0], {
		translatorName: "static",
		configPath: "path/to/my/config.json"
	}, "CLI was called with static translator");
});

test.serial("ui5 serve --sap-csp-policies", async (t) => {
	normalizerStub.resolves(projectTree);
	serverStub.resolves({});

	// loads project tree using http 2
	const pPrepareServerConfig = await serve.handler(Object.assign({}, defaultInitialHandlerArgs, {sapCspPolicies: true}));
	// preprocess project config
	const pServeServer = await pPrepareServerConfig;
	// serve server using config
	await pServeServer;

	const injectedProjectTree = serverStub.getCall(0).args[0];
	const injectedServerConfig = serverStub.getCall(0).args[1];

	t.deepEqual(injectedProjectTree, projectTree, "Starting server with given project tree");
	t.deepEqual(injectedServerConfig, {
		changePortIfInUse: true,
		acceptRemoteConnections: false,
		h2: false,
		port: 8080,
		cert: undefined,
		key: undefined,
		sendSAPTargetCSP: true
	}, "Starting server with specific server config");
});

import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import chalk from "chalk";

function getDefaultArgv() {
	// This has been taken from the actual argv object yargs provides
	return {
		"_": ["serve"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"x-perf": false,
		"xPerf": false,
		"h2": false,
		"simple-index": false,
		"simpleIndex": false,
		"accept-remote-connections": false,
		"acceptRemoteConnections": false,
		"key": "/home/.ui5/server/server.key",
		"cert": "/home/.ui5/server/server.crt",
		"sap-csp-policies": false,
		"sapCspPolicies": false,
		"serve-csp-reports": false,
		"serveCspReports": false,
		"$0": "ui5"
	};
}

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();

	t.context.server = {
		serve: sinon.stub().returns({
			h2: false,
			port: 8080
		})
	};
	t.context.sslUtil = {
		getSslCertificate: sinon.stub().resolves()
	};

	t.context.getServerSettings = sinon.stub().returns({});
	t.context.fakeGraph = {
		getRoot: () => {
			return {
				getServerSettings: t.context.getServerSettings
			};
		}
	};

	t.context.graph = {
		graphFromStaticFile: sinon.stub().resolves(t.context.fakeGraph),
		graphFromPackageDependencies: sinon.stub().resolves(t.context.fakeGraph)
	};


	t.context.consoleOutput = "";
	t.context.consoleLog = sinon.stub(console, "log").callsFake((message) => {
		// NOTE: This fake impl only supports one string arg passed to console.log
		t.context.consoleOutput += message + "\n";
	});

	t.context.open = sinon.stub();

	t.context.serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/server": t.context.server,
		"@ui5/server/internal/sslUtil": t.context.sslUtil,
		"@ui5/project/graph": t.context.graph,
		"open": t.context.open
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.serve);
});

test.serial("ui5 serve: default", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --h2", async (t) => {
	const {argv, serve, graph, server, fakeGraph, sslUtil} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "randombyte-likes-ponies-key",
		cert: "randombyte-likes-ponies-cert"
	});

	server.serve.returns({
		h2: true,
		port: 8443
	});

	argv.h2 = true;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: https://localhost:8443
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			changePortIfInUse: true,
			h2: true,
			key: "randombyte-likes-ponies-key",
			cert: "randombyte-likes-ponies-cert",
			port: 8443,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);

	t.is(sslUtil.getSslCertificate.callCount, 1);
	t.deepEqual(sslUtil.getSslCertificate.getCall(0).args, [
		"/home/.ui5/server/server.key",
		"/home/.ui5/server/server.crt"
	]);
});

test.serial("ui5 serve --accept-remote-connections", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.acceptRemoteConnections = true;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `
${chalk.bold("⚠️  This server is accepting connections from all hosts on your network")}
${chalk.dim.underline("Please Note:")}
${chalk.bold.dim("* This server is intended for development purposes only. Do not use it in production.")}
${chalk.dim("* Vulnerable (custom-)middleware can pose a threat to your system when exposed to the network")}
${chalk.dim("* The use of proxy-middleware with preconfigured credentials might enable unauthorized access " +
	"to a target system for third parties on your network")}

Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: true,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --open", async (t) => {
	const {argv, serve, graph, server, fakeGraph, open} = t.context;

	argv.open = "index.html";

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);

	t.is(open.callCount, 1);
	t.deepEqual(open.getCall(0).args, [
		"http://localhost:8080/index.html"
	]);
});

test.serial("ui5 serve --open (opens default url)", async (t) => {
	const {argv, serve, graph, server, fakeGraph, open} = t.context;

	argv.open = true;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);

	t.is(open.callCount, 1);
	t.deepEqual(open.getCall(0).args, [
		"http://localhost:8080"
	]);
});

test.serial("ui5 serve --config", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.config = "/path/to/ui5.yaml";

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: "/path/to/ui5.yaml", versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --dependency-definition", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.dependencyDefinition = "/path/to/dependencies.yaml";

	await serve.handler(argv);

	t.is(graph.graphFromPackageDependencies.callCount, 0);
	t.is(graph.graphFromStaticFile.callCount, 1);
	t.deepEqual(graph.graphFromStaticFile.getCall(0).args, [
		{filePath: "/path/to/dependencies.yaml", versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --framework-version", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.frameworkVersion = "1.234.5";

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: "1.234.5"}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --sap-csp-policies", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.sapCspPolicies = true;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: true,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --serve-csp-reports", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.serveCspReports = true;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: true,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --simple-index", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.simpleIndex = true;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: true,
		}
	]);
});

test.serial("ui5 serve with ui5.yaml port setting", async (t) => {
	const {argv, serve, graph, server, fakeGraph, getServerSettings} = t.context;

	getServerSettings.returns({
		httpPort: 3333
	});

	server.serve.returns({
		h2: false,
		port: 3333
	});

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:3333
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cert: undefined,
			changePortIfInUse: false,
			h2: false,
			key: undefined,
			port: 3333,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);
});

test.serial("ui5 serve --h2 with ui5.yaml port setting", async (t) => {
	const {argv, serve, graph, server, fakeGraph, sslUtil, getServerSettings} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "randombyte-likes-ponies-key",
		cert: "randombyte-likes-ponies-cert"
	});

	getServerSettings.returns({
		httpsPort: 4444
	});

	server.serve.returns({
		h2: true,
		port: 4444
	});

	argv.h2 = true;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: https://localhost:4444
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			changePortIfInUse: false,
			h2: true,
			key: "randombyte-likes-ponies-key",
			cert: "randombyte-likes-ponies-cert",
			port: 4444,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);

	t.is(sslUtil.getSslCertificate.callCount, 1);
	t.deepEqual(sslUtil.getSslCertificate.getCall(0).args, [
		"/home/.ui5/server/server.key",
		"/home/.ui5/server/server.crt"
	]);
});

test.serial("ui5 serve --h2 with ui5.yaml port setting and port CLI argument", async (t) => {
	const {argv, serve, graph, server, fakeGraph, sslUtil, getServerSettings} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "randombyte-likes-ponies-key",
		cert: "randombyte-likes-ponies-cert"
	});

	getServerSettings.returns({
		httpsPort: 4444
	});

	server.serve.returns({
		h2: true,
		port: 5555
	});

	argv.h2 = true;
	argv.port = 5555;

	await serve.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput, `Server started
URL: https://localhost:5555
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args, [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			changePortIfInUse: false,
			h2: true,
			key: "randombyte-likes-ponies-key",
			cert: "randombyte-likes-ponies-cert",
			port: 5555,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
		}
	]);

	t.is(sslUtil.getSslCertificate.callCount, 1);
	t.deepEqual(sslUtil.getSslCertificate.getCall(0).args, [
		"/home/.ui5/server/server.key",
		"/home/.ui5/server/server.crt"
	]);
});

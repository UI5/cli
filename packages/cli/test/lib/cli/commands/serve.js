import path from "node:path";
import os from "node:os";
import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import chalk from "chalk";
import yargs from "yargs";

function getDefaultArgv() {
	// This has been taken from the actual argv object yargs provides
	return {
		"_": ["serve"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"perf": false,
		"silent": false,
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
		"cache-mode": "Default",
		"cacheMode": "Default",
		"snapshot-cache": "Default",
		"snapshotCache": "Default",
		"$0": "ui5"
	};
}

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();

	t.context.server = {
		serve: sinon.stub().callsFake((graph, config, errorCallback) => {
			t.context.serverErrorCallback = errorCallback;
			return {
				h2: false,
				port: 8080
			};
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
	t.context.processStderrWrite = sinon.stub(process.stderr, "write").callsFake((message) => {
		t.context.consoleOutput += message;
	});
	t.context.handlerReady = new Promise((resolve) => {
		t.context.processStdoutWrite = sinon.stub(process.stdout, "write").callsFake((message) => {
			t.context.consoleOutput += message;
			resolve();
		});
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

// Override a (possibly absent) data property on `target` for the duration of the
// test. `sinon.replace` can't be used here because `process.stdout.isTTY` and
// `process.env.UI5_LOG_LVL` may not exist as own properties under AVA, so we
// drive `Object.defineProperty`/`delete` directly and let `t.teardown` restore.
function overrideProperty(t, target, prop, value) {
	const prevDescriptor = Object.getOwnPropertyDescriptor(target, prop);
	Object.defineProperty(target, prop,
		{value, configurable: true, writable: true, enumerable: true});
	t.teardown(() => {
		if (prevDescriptor) {
			Object.defineProperty(target, prop, prevDescriptor);
		} else {
			delete target[prop];
		}
	});
}

test.serial("ui5 serve: default", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
	t.is(typeof server.serve.getCall(0).args[2], "function");
});

test.serial("ui5 serve --h2", async (t) => {
	const {argv, serve, graph, server, fakeGraph, sslUtil} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "random-key",
		cert: "random-cert"
	});

	server.serve.returns({
		h2: true,
		port: 8443
	});

	argv.h2 = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: https://localhost:8443
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			changePortIfInUse: true,
			h2: true,
			key: "random-key",
			cert: "random-cert",
			port: 8443,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
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

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `
${chalk.bold.yellow("△ This server is accepting connections from all hosts on your network")}
${chalk.dim.underline("Please Note:")}
${chalk.bold.dim("• This server is intended for development purposes only. Do not use it in production.")}
${chalk.dim("• Vulnerable (custom-)middleware can pose a threat to your system when exposed to the network.")}
${chalk.dim("• The use of proxy-middleware with preconfigured credentials might enable unauthorized access")}
${chalk.dim("  to a target system for third parties on your network.")}

Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: true,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --open", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	const openCalled = new Promise((resolve) => {
		t.context.open.callsFake(resolve);
	});

	argv.open = "index.html";

	serve.handler(argv);
	await openCalled;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);

	t.is(t.context.open.callCount, 1);
	t.deepEqual(t.context.open.getCall(0).args, [
		"http://localhost:8080/index.html"
	]);
});

test.serial("ui5 serve --open (opens default url)", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	const openCalled = new Promise((resolve) => {
		t.context.open.callsFake(resolve);
	});

	argv.open = true;

	serve.handler(argv);
	await openCalled;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);

	t.is(t.context.open.callCount, 1);
	t.deepEqual(t.context.open.getCall(0).args, [
		"http://localhost:8080"
	]);
});

test.serial("ui5 serve --config", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	const fakePath = path.join("/", "path", "to", "ui5.yaml");
	argv.config = fakePath;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: fakePath, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --dependency-definition", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	const fakePath = path.join("/", "path", "to", "dependencies.yaml");
	argv.dependencyDefinition = fakePath;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromPackageDependencies.callCount, 0);
	t.is(graph.graphFromStaticFile.callCount, 1);
	t.deepEqual(graph.graphFromStaticFile.getCall(0).args, [{
		filePath: fakePath, versionOverride: undefined,
		snapshotCache: "Default", rootConfigPath: undefined
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true
		}
	]);
});

test.serial("ui5 serve --dependency-definition / --config", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	const fakeDependenciesPath = path.join("/", "path", "to", "dependencies.yaml");
	argv.dependencyDefinition = fakeDependenciesPath;

	const fakeConfigPath = path.join("/", "path", "to", "ui5.yaml");
	argv.config = fakeConfigPath;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromPackageDependencies.callCount, 0);
	t.is(graph.graphFromStaticFile.callCount, 1);
	t.deepEqual(graph.graphFromStaticFile.getCall(0).args, [{
		filePath: fakeDependenciesPath, versionOverride: undefined,
		snapshotCache: "Default", rootConfigPath: fakeConfigPath
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true
		}
	]);
});

test.serial("ui5 serve --framework-version", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.frameworkVersion = "1.234.5";

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: "1.234.5",
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --snapshotCache", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.snapshotCache = "Force";

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Force",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --workspace", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.workspace = "dolphin";

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: "dolphin",
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --no-workspace", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.workspace = false;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: null,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --workspace-config", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	const fakePath = path.join("/", "path", "to", "ui5-workspace.yaml");
	argv.workspaceConfig = fakePath;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: fakePath, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --sap-csp-policies", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.sapCspPolicies = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: true,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --serve-csp-reports", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.serveCspReports = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: true,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --simple-index", async (t) => {
	const {argv, serve, graph, server, fakeGraph} = t.context;

	argv.simpleIndex = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:8080
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: true,
			h2: false,
			key: undefined,
			port: 8080,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: true,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --no-live-reload", async (t) => {
	const {argv, serve, server} = t.context;

	argv.liveReload = false;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].liveReload, false);
});

test.serial("ui5 serve --live-reload", async (t) => {
	const {argv, serve, server} = t.context;

	argv.liveReload = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].liveReload, true);
});

test.serial("ui5 serve with ui5.yaml liveReload=false setting", async (t) => {
	const {argv, serve, server, getServerSettings} = t.context;

	getServerSettings.returns({
		liveReload: false
	});

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].liveReload, false);
});

test.serial("ui5 serve --live-reload overrides ui5.yaml liveReload setting", async (t) => {
	const {argv, serve, server, getServerSettings} = t.context;

	argv.liveReload = true;
	getServerSettings.returns({
		liveReload: false
	});

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].liveReload, true);
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

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: http://localhost:3333
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			cert: undefined,
			changePortIfInUse: false,
			h2: false,
			key: undefined,
			port: 3333,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);
});

test.serial("ui5 serve --h2 with ui5.yaml port setting", async (t) => {
	const {argv, serve, graph, server, fakeGraph, sslUtil, getServerSettings} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "random-key",
		cert: "random-cert"
	});

	getServerSettings.returns({
		httpsPort: 4444
	});

	server.serve.returns({
		h2: true,
		port: 4444
	});

	argv.h2 = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: https://localhost:4444
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			changePortIfInUse: false,
			h2: true,
			key: "random-key",
			cert: "random-cert",
			port: 4444,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
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
		key: "random-key",
		cert: "random-cert"
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

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

	t.is(t.context.consoleOutput, `Server started
URL: https://localhost:5555
`);

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args.slice(0, 2), [
		fakeGraph,
		{
			acceptRemoteConnections: false,
			cache: undefined,
			changePortIfInUse: false,
			h2: true,
			key: "random-key",
			cert: "random-cert",
			port: 5555,
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			liveReload: true,
		}
	]);

	t.is(sslUtil.getSslCertificate.callCount, 1);
	t.deepEqual(sslUtil.getSslCertificate.getCall(0).args, [
		"/home/.ui5/server/server.key",
		"/home/.ui5/server/server.crt"
	]);
});

test.serial("ui5 serve: Error callback propagates to handler", async (t) => {
	const {argv, serve} = t.context;

	const handlerPromise = serve.handler(argv);
	await t.context.handlerReady;

	t.context.serverErrorCallback(new Error("Server crashed"));

	await t.throwsAsync(handlerPromise, {message: "Server crashed"});
});

test.serial("ui5 serve builder: --cache coerce normalizes letter case", async (t) => {
	const {serve} = t.context;

	const parseCache = async (value) => {
		const cli = yargs().exitProcess(false);
		serve.builder(cli);
		const argv = await cli.parseAsync(["--cache", value]);
		return argv.cache;
	};

	t.is(await parseCache("default"), "Default");
	t.is(await parseCache("FORCE"), "Force");
	t.is(await parseCache("OfF"), "Off");
});

test.serial("ui5 serve builder: --cache coerce maps read-only variants to 'ReadOnly'", async (t) => {
	const {serve} = t.context;

	const parseCache = async (value) => {
		const cli = yargs().exitProcess(false);
		serve.builder(cli);
		const argv = await cli.parseAsync(["--cache", value]);
		return argv.cache;
	};

	t.is(await parseCache("readonly"), "ReadOnly");
	t.is(await parseCache("read-only"), "ReadOnly");
});

test.serial("ui5 serve builder: --cache-mode coerce logs deprecation warning", async (t) => {
	const logWarn = sinon.stub();
	const serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/logger": {
			getLogger: () => ({warn: logWarn})
		}
	});

	const cli = yargs().exitProcess(false);
	serve.builder(cli);

	const argv = await cli.parseAsync(["--cache-mode", "Force"]);
	t.is(argv.cacheMode, "Force");
	t.is(logWarn.callCount, 1, "log.warn got called once");
	t.regex(logWarn.getCall(0).args[0], /'--cache-mode' is renamed to '--snapshot-cache'/);

	esmock.purge(serve);
});

test.serial("banner gate: activates when stdout is a TTY and log level is info", async (t) => {
	const {argv, graph, server, sslUtil, open} = t.context;
	const bannerSetProject = sinon.stub();
	const bannerSetUrls = sinon.stub();
	const bannerInstance = {
		setProject: bannerSetProject,
		setUrls: bannerSetUrls,
		stop: sinon.stub(),
	};
	const bannerObserve = sinon.stub().returns(bannerInstance);
	const consoleStop = sinon.stub();
	const consoleInit = sinon.stub();

	// Project metadata accessors used by serve.js when wiring the banner.
	t.context.fakeGraph.getRoot = () => ({
		getServerSettings: t.context.getServerSettings,
		getName: () => "my.app",
		getType: () => "application",
		getVersion: () => "1.0.0",
		getFrameworkName: () => "SAPUI5",
		getFrameworkVersion: () => "1.0.0",
	});

	overrideProperty(t, process.stdout, "isTTY", true);
	const serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/server": server,
		"@ui5/server/internal/sslUtil": sslUtil,
		"@ui5/project/graph": graph,
		"open": open,
		"../../../../lib/serve/Banner.js": {default: {observe: bannerObserve}},
		"@ui5/logger/writers/Console": {default: {stop: consoleStop, init: consoleInit}},
	});

	serve.handler(argv).catch(() => {/* may reject on shutdown — ignore here */});
	await new Promise((resolve) => setTimeout(resolve, 10));

	t.is(consoleStop.callCount, 1, "Console.stop was called before the build starts");
	t.is(bannerObserve.callCount, 1, "Banner.observe was called");
	const observeOpts = bannerObserve.getCall(0).args[0];
	t.is(observeOpts.brand.name, "UI5 CLI", "brand passed to observe up front");
	t.false(observeOpts.acceptRemoteConnections,
		"acceptRemoteConnections is fixed at observe time from argv");

	t.is(bannerSetProject.callCount, 1, "banner.setProject was called after graph resolved");
	const projectInfo = bannerSetProject.getCall(0).args[0];
	t.is(projectInfo.name, "my.app");
	t.is(projectInfo.type, "application");
	t.is(projectInfo.framework.name, "SAPUI5");

	t.is(bannerSetUrls.callCount, 1, "banner.setUrls was called after serverServe resolved");
	const urlsInfo = bannerSetUrls.getCall(0).args[0];
	t.is(urlsInfo.local, "http://localhost:8080");

	esmock.purge(serve);
});

test.serial("banner gate: passes network address from os.networkInterfaces to banner urls.network", async (t) => {
	const {argv, graph, server, sslUtil, open} = t.context;
	const bannerSetUrls = sinon.stub();
	const bannerInstance = {
		setProject: sinon.stub(),
		setUrls: bannerSetUrls,
		stop: sinon.stub(),
	};
	const bannerObserve = sinon.stub().returns(bannerInstance);
	const consoleStop = sinon.stub();
	const consoleInit = sinon.stub();

	// Simulate a host that exposes one non-internal IPv4 interface — the CLI
	// is now responsible for discovering it; @ui5/server no longer reports it.
	const osMock = {
		default: {
			...os,
			networkInterfaces: () => ({
				eth0: [{family: "IPv4", internal: false, address: "0.0.0.0"}],
			}),
		},
	};

	argv.acceptRemoteConnections = true;

	t.context.fakeGraph.getRoot = () => ({
		getServerSettings: t.context.getServerSettings,
		getName: () => "my.app",
		getType: () => "application",
		getVersion: () => "1.0.0",
		getFrameworkName: () => "SAPUI5",
		getFrameworkVersion: () => "1.0.0",
	});

	overrideProperty(t, process.stdout, "isTTY", true);
	const serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/server": server,
		"@ui5/server/internal/sslUtil": sslUtil,
		"@ui5/project/graph": graph,
		"open": open,
		"node:os": osMock,
		"../../../../lib/serve/Banner.js": {default: {observe: bannerObserve}},
		"@ui5/logger/writers/Console": {default: {stop: consoleStop, init: consoleInit}},
	});

	serve.handler(argv).catch(() => {/* may reject on shutdown — ignore here */});
	await new Promise((resolve) => setTimeout(resolve, 10));

	t.true(bannerObserve.getCall(0).args[0].acceptRemoteConnections,
		"observe received the remote-connections flag");
	t.is(bannerSetUrls.callCount, 1);
	const urlsInfo = bannerSetUrls.getCall(0).args[0];
	t.is(urlsInfo.local, "http://localhost:8080");
	t.deepEqual(urlsInfo.network, ["http://0.0.0.0:8080"],
		"network URL is built from the IP discovered by the CLI");

	esmock.purge(serve);
});

test.serial("banner gate: urls.network is undefined when no external IPv4 interface is available", async (t) => {
	const {argv, graph, server, sslUtil, open} = t.context;
	const bannerSetUrls = sinon.stub();
	const bannerInstance = {
		setProject: sinon.stub(),
		setUrls: bannerSetUrls,
		stop: sinon.stub(),
	};
	const bannerObserve = sinon.stub().returns(bannerInstance);
	const consoleStop = sinon.stub();
	const consoleInit = sinon.stub();

	// User asked for remote connections but the host has no suitable IPv4
	// interface (only loopback) — network URL must be omitted.
	const osMock = {
		default: {
			...os,
			networkInterfaces: () => ({
				lo: [{family: "IPv4", internal: true, address: "127.0.0.1"}],
			}),
		},
	};

	argv.acceptRemoteConnections = true;

	t.context.fakeGraph.getRoot = () => ({
		getServerSettings: t.context.getServerSettings,
		getName: () => "my.app",
		getType: () => "application",
		getVersion: () => "1.0.0",
		getFrameworkName: () => "SAPUI5",
		getFrameworkVersion: () => "1.0.0",
	});

	overrideProperty(t, process.stdout, "isTTY", true);
	const serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/server": server,
		"@ui5/server/internal/sslUtil": sslUtil,
		"@ui5/project/graph": graph,
		"open": open,
		"node:os": osMock,
		"../../../../lib/serve/Banner.js": {default: {observe: bannerObserve}},
		"@ui5/logger/writers/Console": {default: {stop: consoleStop, init: consoleInit}},
	});

	serve.handler(argv).catch(() => {/* may reject on shutdown — ignore here */});
	await new Promise((resolve) => setTimeout(resolve, 10));

	t.is(bannerSetUrls.callCount, 1);
	const urlsInfo = bannerSetUrls.getCall(0).args[0];
	t.is(urlsInfo.network, undefined,
		"network URL is omitted when no external IPv4 is available");
	t.true(bannerObserve.getCall(0).args[0].acceptRemoteConnections,
		"observe received the remote-connections flag");

	esmock.purge(serve);
});

test.serial("banner gate: falls back to plain output when log level is verbose", async (t) => {
	const {argv, graph, server, sslUtil, open} = t.context;
	const bannerObserve = sinon.stub().returns({start: sinon.stub(), stop: sinon.stub()});
	const consoleStop = sinon.stub();

	overrideProperty(t, process.stdout, "isTTY", true);
	overrideProperty(t, process.env, "UI5_LOG_LVL", "verbose");
	const serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/server": server,
		"@ui5/server/internal/sslUtil": sslUtil,
		"@ui5/project/graph": graph,
		"open": open,
		"../../../../lib/serve/Banner.js": {default: {observe: bannerObserve}},
		"@ui5/logger/writers/Console": {default: {stop: consoleStop, init: sinon.stub()}},
	});

	serve.handler(argv).catch(() => {/* ignore */});
	await t.context.handlerReady;

	t.is(bannerObserve.callCount, 0, "Banner.observe was NOT called when log level is verbose");
	t.is(consoleStop.callCount, 0, "Console writer stays attached when log level is verbose");
	t.regex(t.context.consoleOutput, /Server started/);
	t.regex(t.context.consoleOutput, /URL: http:\/\/localhost:8080/);

	esmock.purge(serve);
});

test.serial("banner gate: falls back to plain output when stdout is not a TTY", async (t) => {
	const {argv, graph, server, sslUtil, open} = t.context;
	const bannerObserve = sinon.stub().returns({start: sinon.stub(), stop: sinon.stub()});

	overrideProperty(t, process.stdout, "isTTY", false);
	const serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/server": server,
		"@ui5/server/internal/sslUtil": sslUtil,
		"@ui5/project/graph": graph,
		"open": open,
		"../../../../lib/serve/Banner.js": {default: {observe: bannerObserve}},
	});

	serve.handler(argv).catch(() => {/* ignore */});
	await t.context.handlerReady;

	t.is(bannerObserve.callCount, 0, "Banner.observe was NOT called without a TTY");
	t.regex(t.context.consoleOutput, /Server started/);

	esmock.purge(serve);
});

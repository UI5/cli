import path from "node:path";
import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
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

	// server.serve is the CLI-facing synchronization point now that the handler
	// no longer writes "Server started" to stdout. Test cases await `serverServed`
	// to know the handler has finished setting up the server.
	t.context.handlerReadyResolvers = Promise.withResolvers();
	t.context.handlerReady = t.context.handlerReadyResolvers.promise;

	t.context.server = {
		serve: sinon.stub().callsFake((graph, config, errorCallback) => {
			t.context.serverErrorCallback = errorCallback;
			t.context.handlerReadyResolvers.resolve();
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

	// Capture stray writes to stderr/stdout so failing assertions surface the
	// actual output instead of ava's timeout diagnostics.
	t.context.consoleOutput = "";
	t.context.processStderrWrite = sinon.stub(process.stderr, "write").callsFake((message) => {
		t.context.consoleOutput += message;
	});
	t.context.processStdoutWrite = sinon.stub(process.stdout, "write").callsFake((message) => {
		t.context.consoleOutput += message;
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

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);

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
			includedTasks: undefined,
			excludedTasks: undefined,
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

	server.serve.callsFake((graph, config, errorCallback) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {h2: true, port: 8443};
	});

	argv.h2 = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);

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
			includedTasks: undefined,
			excludedTasks: undefined,
		}
	]);

	t.is(sslUtil.getSslCertificate.callCount, 1);
	t.deepEqual(sslUtil.getSslCertificate.getCall(0).args, [
		"/home/.ui5/server/server.key",
		"/home/.ui5/server/server.crt"
	]);
});

test.serial("ui5 serve --accept-remote-connections", async (t) => {
	const {argv, serve, server, fakeGraph} = t.context;

	argv.acceptRemoteConnections = true;

	serve.handler(argv);
	await t.context.handlerReady;

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
			includedTasks: undefined,
			excludedTasks: undefined,
		}
	]);
});

test.serial("ui5 serve --open", async (t) => {
	const {argv, serve} = t.context;

	const openCalled = new Promise((resolve) => {
		t.context.open.callsFake(resolve);
	});

	argv.open = "index.html";

	serve.handler(argv);
	await openCalled;

	t.is(t.context.open.callCount, 1);
	t.deepEqual(t.context.open.getCall(0).args, [
		"http://localhost:8080/index.html"
	]);
});

test.serial("ui5 serve --open (opens default url)", async (t) => {
	const {argv, serve} = t.context;

	const openCalled = new Promise((resolve) => {
		t.context.open.callsFake(resolve);
	});

	argv.open = true;

	serve.handler(argv);
	await openCalled;

	t.is(t.context.open.callCount, 1);
	t.deepEqual(t.context.open.getCall(0).args, [
		"http://localhost:8080"
	]);
});

test.serial("ui5 serve --config", async (t) => {
	const {argv, serve, graph} = t.context;

	const fakePath = path.join("/", "path", "to", "ui5.yaml");
	argv.config = fakePath;

	serve.handler(argv);
	await t.context.handlerReady;

	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: fakePath, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);
});

test.serial("ui5 serve --dependency-definition", async (t) => {
	const {argv, serve, graph} = t.context;

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
});

test.serial("ui5 serve --dependency-definition / --config", async (t) => {
	const {argv, serve, graph} = t.context;

	const fakeDependenciesPath = path.join("/", "path", "to", "dependencies.yaml");
	argv.dependencyDefinition = fakeDependenciesPath;

	const fakeConfigPath = path.join("/", "path", "to", "ui5.yaml");
	argv.config = fakeConfigPath;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 1);
	t.deepEqual(graph.graphFromStaticFile.getCall(0).args, [{
		filePath: fakeDependenciesPath, versionOverride: undefined,
		snapshotCache: "Default", rootConfigPath: fakeConfigPath
	}]);
});

test.serial("ui5 serve --framework-version", async (t) => {
	const {argv, serve, graph} = t.context;

	argv.frameworkVersion = "1.234.5";

	serve.handler(argv);
	await t.context.handlerReady;

	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: "1.234.5",
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Default",
	}]);
});

test.serial("ui5 serve --snapshotCache", async (t) => {
	const {argv, serve, graph} = t.context;

	argv.snapshotCache = "Force";

	serve.handler(argv);
	await t.context.handlerReady;

	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
		snapshotCache: "Force",
	}]);
});

test.serial("ui5 serve --workspace", async (t) => {
	const {argv, serve, graph} = t.context;

	argv.workspace = "dolphin";

	serve.handler(argv);
	await t.context.handlerReady;

	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: "dolphin",
		snapshotCache: "Default",
	}]);
});

test.serial("ui5 serve --no-workspace", async (t) => {
	const {argv, serve, graph} = t.context;

	argv.workspace = false;

	serve.handler(argv);
	await t.context.handlerReady;

	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: null,
		snapshotCache: "Default",
	}]);
});

test.serial("ui5 serve --workspace-config", async (t) => {
	const {argv, serve, graph} = t.context;

	const fakePath = path.join("/", "path", "to", "ui5-workspace.yaml");
	argv.workspaceConfig = fakePath;

	serve.handler(argv);
	await t.context.handlerReady;

	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: fakePath, workspaceName: undefined,
		snapshotCache: "Default",
	}]);
});

test.serial("ui5 serve --sap-csp-policies", async (t) => {
	const {argv, serve, server} = t.context;

	argv.sapCspPolicies = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.getCall(0).args[1].sendSAPTargetCSP, true);
});

test.serial("ui5 serve --serve-csp-reports", async (t) => {
	const {argv, serve, server} = t.context;

	argv.serveCspReports = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.getCall(0).args[1].serveCSPReports, true);
});

test.serial("ui5 serve --simple-index", async (t) => {
	const {argv, serve, server} = t.context;

	argv.simpleIndex = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.getCall(0).args[1].simpleIndex, true);
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

test.serial("ui5 serve --include-task / --exclude-task", async (t) => {
	const {argv, serve, server} = t.context;

	argv["include-task"] = ["minify"];
	argv["exclude-task"] = ["buildThemes", "generateResourcesJson"];

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.deepEqual(server.serve.getCall(0).args[1].includedTasks, ["minify"]);
	t.deepEqual(server.serve.getCall(0).args[1].excludedTasks,
		["buildThemes", "generateResourcesJson"]);
});

test.serial("ui5 serve with ui5.yaml port setting", async (t) => {
	const {argv, serve, server, getServerSettings} = t.context;

	getServerSettings.returns({
		httpPort: 3333
	});

	server.serve.callsFake((graph, config, errorCallback) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {h2: false, port: 3333};
	});

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].port, 3333);
	t.is(server.serve.getCall(0).args[1].changePortIfInUse, false);
});

test.serial("ui5 serve --h2 with ui5.yaml port setting", async (t) => {
	const {argv, serve, server, sslUtil, getServerSettings} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "random-key",
		cert: "random-cert"
	});

	getServerSettings.returns({
		httpsPort: 4444
	});

	server.serve.callsFake((graph, config, errorCallback) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {h2: true, port: 4444};
	});

	argv.h2 = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].port, 4444);
	t.is(server.serve.getCall(0).args[1].changePortIfInUse, false);
	t.is(server.serve.getCall(0).args[1].h2, true);
});

test.serial("ui5 serve --h2 with ui5.yaml port setting and port CLI argument", async (t) => {
	const {argv, serve, server, sslUtil, getServerSettings} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "random-key",
		cert: "random-cert"
	});

	getServerSettings.returns({
		httpsPort: 4444
	});

	server.serve.callsFake((graph, config, errorCallback) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {h2: true, port: 5555};
	});

	argv.h2 = true;
	argv.port = 5555;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].port, 5555);
	t.is(server.serve.getCall(0).args[1].changePortIfInUse, false);
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

import path from "node:path";
import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import yargs from "yargs";

const DEFAULT_UI5_DATA_DIR = path.join(path.resolve(path.sep), "home", ".ui5");
const DEFAULT_SERVER_KEY_PATH = path.join(DEFAULT_UI5_DATA_DIR, "server", "server.key");
const DEFAULT_SERVER_CERT_PATH = path.join(DEFAULT_UI5_DATA_DIR, "server", "server.crt");

function getDefaultArgv() {
	// This has been taken from the actual argv object yargs provides
	return {
		"_": ["serve"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"perf": false,
		"silent": false,
		"https": false,
		"simple-index": false,
		"simpleIndex": false,
		"accept-remote-connections": false,
		"acceptRemoteConnections": false,
		// yargs leaves these undefined unless the user passes --key/--cert
		// (the options declare only a defaultDescription, not a default value)
		"key": undefined,
		"cert": undefined,
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
		serve: sinon.stub().callsFake((graph, config, errorCallback, graphFactory) => {
			t.context.serverErrorCallback = errorCallback;
			t.context.handlerReadyResolvers.resolve();
			return {
				https: false,
				port: 8080
			};
		})
	};
	t.context.sslUtil = {
		getSslCertificate: sinon.stub().resolves(),
		SslCertificateNotFoundError: class SslCertificateNotFoundError extends Error {
			constructor(keyPath, certPath) {
				super(`No SSL certificate found at ${keyPath} and ${certPath}`);
				this.name = "SslCertificateNotFoundError";
				this.code = "SSL_CERTIFICATE_NOT_FOUND";
				this.keyPath = keyPath;
				this.certPath = certPath;
			}
		}
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

	// Definition-watcher namespace the handler injects into server.serve().
	t.context.projectWatcher = {default: {create: sinon.stub()}};

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

	t.context.getUi5DataDir = sinon.stub().resolves(DEFAULT_UI5_DATA_DIR);

	t.context.serve = await esmock.p("../../../../lib/cli/commands/serve.js", {
		"@ui5/server": t.context.server,
		"@ui5/server/internal/sslUtil": t.context.sslUtil,
		"@ui5/project/graph": t.context.graph,
		"@ui5/project/internal/graph/ProjectDefinitionWatcher": t.context.projectWatcher,
		"open": t.context.open
	}, {
		"../../../../lib/dataDir.js": {
			getUi5DataDirOrDefault: t.context.getUi5DataDir
		}
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
	t.is(server.serve.getCall(0).args[0], fakeGraph);

	// The last argument carries a graphFactory the server can call to re-resolve the graph on a
	// project-definition change. It must produce the same graph via the same builder + args.
	const graphFactory = server.serve.getCall(0).args[3];
	t.is(typeof graphFactory, "function");
	await graphFactory();
	t.is(graph.graphFromPackageDependencies.callCount, 2, "graphFactory re-invokes the same builder");
	t.deepEqual(graph.graphFromPackageDependencies.getCall(1).args, graph.graphFromPackageDependencies.getCall(0).args,
		"graphFactory re-resolves with identical parameters");

	// esmock merges the partial mock over the real module, so assert on the threaded default rather than
	// object identity.
	t.is(server.serve.getCall(0).args[4].default, t.context.projectWatcher.default,
		"the ProjectDefinitionWatcher module namespace is injected into server.serve()");

	t.deepEqual(server.serve.getCall(0).args[1], {
		acceptRemoteConnections: false,
		cache: undefined,
		cert: undefined,
		changePortIfInUse: true,
		https: false,
		key: undefined,
		port: 8080,
		sendSAPTargetCSP: false,
		serveCSPReports: false,
		simpleIndex: false,
		liveReload: true,
		includedTasks: undefined,
		excludedTasks: undefined,
		rootConfigPath: undefined,
		workspaceConfigPath: null,
		dependencyDefinitionPath: undefined,
	});
	t.is(typeof server.serve.getCall(0).args[2], "function");
});

test.serial("ui5 serve --https", async (t) => {
	const {argv, serve, graph, server, fakeGraph, sslUtil} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "random-key",
		cert: "random-cert"
	});

	server.serve.callsFake((graph, config, errorCallback, graphFactory) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {https: true, port: 8443};
	});

	argv.https = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[0], fakeGraph);
	t.deepEqual(server.serve.getCall(0).args[1], {
		acceptRemoteConnections: false,
		cache: undefined,
		changePortIfInUse: true,
		https: true,
		key: "random-key",
		cert: "random-cert",
		port: 8443,
		sendSAPTargetCSP: false,
		serveCSPReports: false,
		simpleIndex: false,
		liveReload: true,
		includedTasks: undefined,
		excludedTasks: undefined,
		rootConfigPath: undefined,
		workspaceConfigPath: null,
		dependencyDefinitionPath: undefined,
	});

	t.is(sslUtil.getSslCertificate.callCount, 1);
	t.deepEqual(sslUtil.getSslCertificate.getCall(0).args, [
		DEFAULT_SERVER_KEY_PATH,
		DEFAULT_SERVER_CERT_PATH
	]);
});

test.serial("ui5 serve --https without existing certificate", async (t) => {
	const {argv, serve, server, sslUtil} = t.context;

	sslUtil.getSslCertificate.rejects(
		new sslUtil.SslCertificateNotFoundError(
			DEFAULT_SERVER_KEY_PATH,
			DEFAULT_SERVER_CERT_PATH
		)
	);

	argv.https = true;

	const err = await t.throwsAsync(serve.handler(argv));
	t.regex(err.message, /No SSL certificate found for HTTPS/);
	t.regex(err.message, /Private key: .*server\.key \(default\)/);
	t.regex(err.message, /Certificate: .*server\.crt \(default\)/);
	t.regex(err.message, /ui5 certificate generate/);
	t.regex(err.message, /--key and --cert/);

	// The server must not be started when no certificate is available
	t.is(server.serve.callCount, 0);
});

test.serial("ui5 serve --https without existing certificate at custom --key/--cert paths", async (t) => {
	const {argv, serve, server, sslUtil} = t.context;

	sslUtil.getSslCertificate.rejects(
		new sslUtil.SslCertificateNotFoundError(
			"/custom/my.key",
			"/custom/my.crt"
		)
	);

	argv.https = true;
	argv.key = "/custom/my.key";
	argv.cert = "/custom/my.crt";

	const err = await t.throwsAsync(serve.handler(argv));
	t.regex(err.message, /No SSL certificate found for HTTPS/);
	t.regex(err.message, /Private key: \/custom\/my\.key \(--key\)/);
	t.regex(err.message, /Certificate: \/custom\/my\.crt \(--cert\)/);
	t.regex(err.message, /ui5 certificate generate/);

	// A path the user did not specify must not be attributed to them
	t.notRegex(err.message, /\(default\)/);

	// The server must not be started when no certificate is available
	t.is(server.serve.callCount, 0);
});

test.serial("ui5 serve --https without existing certificate at mixed custom/default paths", async (t) => {
	const {argv, serve, server, sslUtil} = t.context;

	sslUtil.getSslCertificate.rejects(
		new sslUtil.SslCertificateNotFoundError(
			"/custom/my.key",
			DEFAULT_SERVER_CERT_PATH
		)
	);

	argv.https = true;
	argv.key = "/custom/my.key";

	const err = await t.throwsAsync(serve.handler(argv));
	// The user-supplied key is attributed to --key; the fallback cert path is marked as a default,
	// never misattributed as something the user specified.
	t.regex(err.message, /Private key: \/custom\/my\.key \(--key\)/);
	t.regex(err.message, /Certificate: .*server\.crt \(default\)/);

	// The server must not be started when no certificate is available
	t.is(server.serve.callCount, 0);
});

test.serial("ui5 serve --accept-remote-connections", async (t) => {
	const {argv, serve, server, fakeGraph} = t.context;

	argv.acceptRemoteConnections = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[0], fakeGraph);
	t.deepEqual(server.serve.getCall(0).args[1], {
		acceptRemoteConnections: true,
		cache: undefined,
		cert: undefined,
		changePortIfInUse: true,
		https: false,
		key: undefined,
		port: 8080,
		sendSAPTargetCSP: false,
		serveCSPReports: false,
		simpleIndex: false,
		liveReload: true,
		includedTasks: undefined,
		excludedTasks: undefined,
		rootConfigPath: undefined,
		workspaceConfigPath: null,
		dependencyDefinitionPath: undefined,
	});
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

	server.serve.callsFake((graph, config, errorCallback, graphFactory) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {https: false, port: 3333};
	});

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].port, 3333);
	t.is(server.serve.getCall(0).args[1].changePortIfInUse, false);
});

test.serial("ui5 serve --https with ui5.yaml port setting", async (t) => {
	const {argv, serve, server, sslUtil, getServerSettings} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "random-key",
		cert: "random-cert"
	});

	getServerSettings.returns({
		httpsPort: 4444
	});

	server.serve.callsFake((graph, config, errorCallback, graphFactory) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {https: true, port: 4444};
	});

	argv.https = true;

	serve.handler(argv);
	await t.context.handlerReady;

	t.is(server.serve.callCount, 1);
	t.is(server.serve.getCall(0).args[1].port, 4444);
	t.is(server.serve.getCall(0).args[1].changePortIfInUse, false);
	t.is(server.serve.getCall(0).args[1].https, true);
});

test.serial("ui5 serve --https with ui5.yaml port setting and port CLI argument", async (t) => {
	const {argv, serve, server, sslUtil, getServerSettings} = t.context;

	sslUtil.getSslCertificate.resolves({
		key: "random-key",
		cert: "random-cert"
	});

	getServerSettings.returns({
		httpsPort: 4444
	});

	server.serve.callsFake((graph, config, errorCallback, graphFactory) => {
		t.context.serverErrorCallback = errorCallback;
		t.context.handlerReadyResolvers.resolve();
		return {https: true, port: 5555};
	});

	argv.https = true;
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

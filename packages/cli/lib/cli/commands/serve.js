import path from "node:path";
import os from "node:os";
import chalk from "chalk";
import baseMiddleware from "../middlewares/base.js";

// Serve
const serve = {
	command: "serve",
	describe: "Start a web server for the current project",
	middlewares: [baseMiddleware]
};

serve.builder = function(cli) {
	return cli
		.option("port", {
			describe: "Port to bind on (default for HTTP: 8080, HTTP/2: 8443)",
			alias: "p",
			type: "number"
		})
		.option("open", {
			describe:
				"Open web server root directory in default browser. " +
				"Optionally, supplied relative path will be appended to the root URL",
			alias: "o",
			type: "string"
		})
		.option("h2", {
			describe: "Shortcut for enabling the HTTP/2 protocol for the web server",
			default: false,
			type: "boolean"
		})
		.option("simple-index", {
			describe: "Use a simplified view for the server directory listing",
			default: false,
			type: "boolean"
		})
		.option("accept-remote-connections", {
			describe: "Accept remote connections. By default the server only accepts connections from localhost",
			default: false,
			type: "boolean"
		})
		.option("key", {
			describe: "Path to the private key",
			default: path.join(os.homedir(), ".ui5", "server", "server.key"),
			type: "string"
		})
		.option("cert", {
			describe: "Path to the certificate",
			default: path.join(os.homedir(), ".ui5", "server", "server.crt"),
			type: "string"
		})
		.option("sap-csp-policies", {
			describe:
				"Always send content security policies 'sap-target-level-1' and " +
				"'sap-target-level-3' in report-only mode",
			default: false,
			type: "boolean"
		})
		.option("serve-csp-reports", {
			describe: "Collects and serves CSP reports upon request to '/.ui5/csp/csp-reports.json'",
			default: false,
			type: "boolean"
		})
		.option("framework-version", {
			describe: "Overrides the framework version defined by the project. " +
				"Takes the same value as the version part of \"ui5 use\"",
			type: "string"
		})
		.option("cache-mode", {
			describe:
				"Cache mode to use when consuming SNAPSHOT versions of framework dependencies. " +
				"The 'Default' behavior is to invalidate the cache after 9 hours. 'Force' uses the cache only and " +
				"does not create any requests. 'Off' invalidates any existing cache and updates from the repository",
			type: "string",
			default: "Default",
			choices: ["Default", "Force", "Off"]
		})
		.example("ui5 serve", "Start a web server for the current project")
		.example("ui5 serve --h2", "Enable the HTTP/2 protocol for the web server (requires SSL certificate)")
		.example("ui5 serve --config /path/to/ui5.yaml", "Use the project configuration from a custom path")
		.example("ui5 serve --dependency-definition /path/to/projectDependencies.yaml",
			"Use a static dependency definition file")
		.example("ui5 serve --port 1337 --open tests/QUnit.html",
			"Listen to port 1337 and launch default browser with http://localhost:1337/test/QUnit.html");
};

serve.handler = async function(argv) {
	const {graphFromStaticFile, graphFromPackageDependencies} = await import("@ui5/project/graph");
	const {serve: serverServe} = await import("@ui5/server");
	const {getSslCertificate} = await import("@ui5/server/internal/sslUtil");

	let graph;
	if (argv.dependencyDefinition) {
		graph = await graphFromStaticFile({
			filePath: argv.dependencyDefinition,
			versionOverride: argv.frameworkVersion,
			cacheMode: argv.cacheMode,
		});
	} else {
		graph = await graphFromPackageDependencies({
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion,
			cacheMode: argv.cacheMode,
			workspaceConfigPath: argv.workspaceConfig,
			workspaceName: argv.workspace === false ? null : argv.workspace,
		});
	}

	let port = argv.port;
	let changePortIfInUse = false;

	if (!port && graph.getRoot().getServerSettings()) {
		const serverSettings = graph.getRoot().getServerSettings();
		if (argv.h2) {
			port = serverSettings.httpsPort;
		} else {
			port = serverSettings.httpPort;
		}
	}

	if (!port) {
		changePortIfInUse = true; // only change if port isn't explicitly set
		if (argv.h2) {
			port = 8443;
		} else {
			port = 8080;
		}
	}

	const serverConfig = {
		port,
		changePortIfInUse,
		h2: argv.h2,
		simpleIndex: !!argv.simpleIndex,
		acceptRemoteConnections: !!argv.acceptRemoteConnections,
		cert: argv.h2 ? argv.cert : undefined,
		key: argv.h2 ? argv.key : undefined,
		sendSAPTargetCSP: !!argv.sapCspPolicies,
		serveCSPReports: !!argv.serveCspReports
	};

	if (serverConfig.h2) {
		const {key, cert} = await getSslCertificate(serverConfig.key, serverConfig.cert);
		serverConfig.key = key;
		serverConfig.cert = cert;
	}

	const {h2, port: actualPort} = await serverServe(graph, serverConfig);

	const protocol = h2 ? "https" : "http";
	let browserUrl = protocol + "://localhost:" + actualPort;
	if (argv.acceptRemoteConnections) {
		console.log("");
		console.log(chalk.bold("⚠️  This server is accepting connections from all hosts on your network"));
		console.log(chalk.dim.underline("Please Note:"));
		console.log(chalk.bold.dim(
			"* This server is intended for development purposes only. Do not use it in production."));
		console.log(chalk.dim(
			"* Vulnerable (custom-)middleware can pose a threat to your system when exposed to the network"));
		console.log(chalk.dim(
			"* The use of proxy-middleware with preconfigured credentials might enable unauthorized access " +
			"to a target system for third parties on your network"));
		console.log("");
	}
	console.log("Server started");
	console.log("URL: " + browserUrl);

	if (argv.open !== undefined) {
		if (typeof argv.open === "string") {
			let relPath = argv.open || "/";
			if (!relPath.startsWith("/")) {
				relPath = "/" + relPath;
			}
			browserUrl += relPath;
		}
		const {default: open} = await import("open");
		open(browserUrl);
	}
};

export default serve;

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import chalk from "chalk";
import baseMiddleware from "../middlewares/base.js";
import {getUi5DataDir} from "../../framework/utils.js";
import lockfile from "lockfile";
import {getLogger} from "@ui5/logger";
const log = getLogger("cli:commands:serve");

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
		.option("live-reload", {
			describe:
				"Automatically reload the browser when project sources change. " +
				"Overrides the 'liveReload' setting in the project's server configuration",
			defaultDescription: "true",
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
		.option("cache", {
			describe:
				"Cache mode to use for building UI5 projects. " +
				"The 'Default' behavior is to always use the build-cache if available. 'Force' uses the cache only. " +
				"If the build-cache is unavailable or invalid, the server will fail to build the project. " +
				"'ReadOnly' does not create or update any cache but makes use of a cache if available. " +
				"'Off' does not use any build-cache and always triggers a rebuild of the project",
			type: "string",
			default: "Default",
			choices: ["Default", "Force", "ReadOnly", "Off"],
		})
		.coerce("cache", (opt) => {
			const lower = opt.toLowerCase();
			if (lower === "readonly" || lower === "read-only") {
				return "ReadOnly";
			}
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.option("framework-version", {
			describe: "Overrides the framework version defined by the project. " +
				"Takes the same value as the version part of \"ui5 use\"",
			type: "string"
		})
		.option("cache-mode", {
			// Deprecated
			hidden: true,
			describe:
				"As of UI5 CLI version 5, renamed to '--snapshot-cache'. " +
				"Use '--snapshot-cache' to control this behavior.",
			type: "string",
			choices: ["Default", "Force", "Off"],
		})
		.coerce("cache-mode", (opt) => {
			// Log a warning if this option is used
			if (opt !== undefined) {
				log.warn("As of UI5 CLI version 5, '--cache-mode' is renamed to '--snapshot-cache'. " +
					"Use '--snapshot-cache' to control this behavior.");
			}
			return opt;
		})
		.option("snapshot-cache", {
			describe:
				"Cache mode to use when consuming SNAPSHOT versions of framework dependencies. " +
				"The 'Default' behavior is to invalidate the cache after 9 hours. 'Force' uses the cache only and " +
				"does not create any requests. 'Off' invalidates any existing cache and updates from the repository",
			type: "string",
			defaultDescription: "Default", // Use "defaultDescription" to allow undefined (needed for evaluation)
			choices: ["Default", "Force", "Off"],
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
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion,
			snapshotCache: argv.snapshotCache ?? argv.cacheMode ?? "Default", // Use cacheMode as fallback
		});
	} else {
		graph = await graphFromPackageDependencies({
			rootConfigPath: argv.config,
			versionOverride: argv.frameworkVersion,
			snapshotCache: argv.snapshotCache ?? argv.cacheMode ?? "Default", // Use cacheMode as fallback
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

	let liveReload = argv.liveReload;
	if (liveReload === undefined) {
		const serverSettings = graph.getRoot().getServerSettings();
		if (serverSettings && serverSettings.liveReload !== undefined) {
			liveReload = serverSettings.liveReload;
		} else {
			liveReload = true;
		}
	}

	const serverConfig = {
		port,
		changePortIfInUse,
		h2: argv.h2,
		simpleIndex: !!argv.simpleIndex,
		liveReload: !!liveReload,
		acceptRemoteConnections: !!argv.acceptRemoteConnections,
		cert: argv.h2 ? argv.cert : undefined,
		key: argv.h2 ? argv.key : undefined,
		sendSAPTargetCSP: !!argv.sapCspPolicies,
		serveCSPReports: !!argv.serveCspReports,
		cache: argv.cache,
	};

	if (serverConfig.h2) {
		const {key, cert} = await getSslCertificate(serverConfig.key, serverConfig.cert);
		serverConfig.key = key;
		serverConfig.cert = cert;
	}

	const {promise: pOnError, reject} = Promise.withResolvers();
	const {h2, port: actualPort} = await serverServe(graph, serverConfig, function(err) {
		reject(err);
	});

	// Acquire a port-specific server lock so that 'ui5 cache clean' cannot delete
	// framework files that the server reads on every HTTP request. Multiple concurrent
	// servers each hold their own lock; cleanCache sees any active lock and refuses.
	const ui5DataDir = (await getUi5DataDir({cwd: process.cwd()})) ??
		path.join(os.homedir(), ".ui5");
	const lockDir = path.join(ui5DataDir, "framework", "locks");
	const lockPath = path.join(lockDir, `server-${actualPort}.lock`);
	await fs.mkdir(lockDir, {recursive: true});
	const lockFn = promisify(lockfile.lock);
	const unlockFn = promisify(lockfile.unlock);
	await lockFn(lockPath, {stale: 60000});
	let lockReleased = false;
	const releaseServerLock = async () => {
		if (lockReleased) return;
		lockReleased = true;
		await unlockFn(lockPath).catch(() => {});
	};
	// Signal handlers must be synchronous — Node does not await async handlers before exit.
	const onSignal = () => {
		if (!lockReleased) {
			lockReleased = true;
			lockfile.unlockSync(lockPath);
		}
		process.exit(0);
	};
	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);

	try {
		const protocol = h2 ? "https" : "http";
		let browserUrl = protocol + "://localhost:" + actualPort;
		if (argv.acceptRemoteConnections) {
			process.stderr.write("\n");
			process.stderr.write(chalk.bold("⚠️  This server is accepting connections from all hosts on your network"));
			process.stderr.write("\n");
			process.stderr.write(chalk.dim.underline("Please Note:"));
			process.stderr.write("\n");
			process.stderr.write(chalk.bold.dim(
				"* This server is intended for development purposes only. Do not use it in production."));
			process.stderr.write("\n");
			process.stderr.write(chalk.dim(
				"* Vulnerable (custom-)middleware can pose a threat to your system when exposed to the network"));
			process.stderr.write("\n");
			process.stderr.write(chalk.dim(
				"* The use of proxy-middleware with preconfigured credentials might enable unauthorized access " +
				"to a target system for third parties on your network"));
			process.stderr.write("\n\n");
		}
		process.stdout.write("Server started");
		process.stdout.write("\n");
		process.stdout.write("URL: " + browserUrl);
		process.stdout.write("\n");

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
		await pOnError; // Await errors that should bubble into the yargs handler
	} finally {
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
		await releaseServerLock();
	}
};

export default serve;

import {createRequire} from "node:module";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {applyProjectConfigOptions, applyWorkspaceOptions, dedupeArray} from "../options.js";
import {applyCommandMetadata} from "../commandMetadata.js";
import {getUi5DataDirOrDefault, resolveServerCertificatePaths, formatPath} from "../../dataDir.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("cli:commands:serve");

const require = createRequire(import.meta.url);
const metadata = require("./serve.json");

// Serve
const serve = {
	command: metadata.command,
	describe: metadata.describe,
	middlewares: [baseMiddleware]
};

serve.builder = function(cli) {
	applyCommandMetadata(cli, metadata);
	applyProjectConfigOptions(cli);
	applyWorkspaceOptions(cli);
	return cli
		.coerce("cache", (opt) => {
			opt = dedupeArray(opt);
			const lower = opt.toLowerCase();
			if (lower === "readonly" || lower === "read-only") {
				return "ReadOnly";
			}
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.coerce("cache-mode", (opt) => {
			opt = dedupeArray(opt);
			// Log a warning if this option is used
			if (opt !== undefined) {
				log.warn("As of UI5 CLI version 5, '--cache-mode' is renamed to '--snapshot-cache'. " +
					"Use '--snapshot-cache' to control this behavior.");
			}
			return opt;
		})
		.coerce(["framework-version", "open", "port", "key", "cert"], dedupeArray);
};

serve.handler = async function(argv) {
	// Announce the mode up front so the interactive writer can render its full
	// frame (with placeholders for anything not resolved yet) before graph and
	// server work begins. The server's `ui5.server-listening` event later
	// supplies the authoritative URLs.
	process.emit("ui5.tool-mode", {
		mode: "serve",
		acceptRemoteConnections: !!argv.acceptRemoteConnections,
	});

	const {graphFromStaticFile, graphFromPackageDependencies} = await import("@ui5/project/graph");

	// Workspace resolution is active unless static-graph mode is used or --workspace is disabled.
	// Single source for both the graph resolve (below) and the watcher config, so the two cannot
	// drift on whether workspace resolution runs.
	const workspaceActive = !argv.dependencyDefinition && argv.workspace !== false;

	// One graph-construction site, reused for the initial graph and every re-init the server
	// performs on a project-definition change. Captures argv so the server re-resolves with the
	// same parameters.
	const buildGraph = async () => {
		if (argv.dependencyDefinition) {
			return graphFromStaticFile({
				filePath: argv.dependencyDefinition,
				rootConfigPath: argv.config,
				versionOverride: argv.frameworkVersion,
				snapshotCache: argv.snapshotCache ?? argv.cacheMode ?? "Default", // Use cacheMode as fallback
			});
		} else {
			return graphFromPackageDependencies({
				rootConfigPath: argv.config,
				versionOverride: argv.frameworkVersion,
				snapshotCache: argv.snapshotCache ?? argv.cacheMode ?? "Default", // Use cacheMode as fallback
				workspaceConfigPath: argv.workspaceConfig,
				workspaceName: workspaceActive ? argv.workspace : null,
			});
		}
	};

	// Build the initial graph up front: its root server settings resolve the port and live-reload
	// defaults below, before the server binds.
	const graph = await buildGraph();

	let port = argv.port;
	let changePortIfInUse = false;

	if (!port && graph.getRoot().getServerSettings()) {
		const serverSettings = graph.getRoot().getServerSettings();
		if (argv.https) {
			port = serverSettings.httpsPort;
		} else {
			port = serverSettings.httpPort;
		}
	}

	if (!port) {
		changePortIfInUse = true; // only change if port isn't explicitly set
		if (argv.https) {
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
		https: argv.https,
		simpleIndex: !!argv.simpleIndex,
		liveReload: !!liveReload,
		acceptRemoteConnections: !!argv.acceptRemoteConnections,
		cert: argv.https ? argv.cert : undefined,
		key: argv.https ? argv.key : undefined,
		sendSAPTargetCSP: !!argv.sapCspPolicies,
		serveCSPReports: !!argv.serveCspReports,
		cache: argv.cache,
		includedTasks: argv["include-task"],
		excludedTasks: argv["exclude-task"],
		// Threaded to the definition watcher so it watches the same files buildGraph resolves from.
		// null selects the watcher's default ui5-workspace.yaml, undefined disables workspace watching.
		rootConfigPath: argv.config,
		workspaceConfigPath: workspaceActive ? (argv.workspaceConfig ?? null) : undefined,
		dependencyDefinitionPath: argv.dependencyDefinition,
	};

	if (serverConfig.https) {
		// A default certificate path is only needed for HTTPS, so the UI5 data directory is
		// resolved once here rather than for every serve invocation.
		const ui5DataDir = await getUi5DataDirOrDefault({cwd: process.cwd()});
		const {keyPath, certPath} = resolveServerCertificatePaths(ui5DataDir, {
			keyPath: serverConfig.key,
			certPath: serverConfig.cert,
		});

		const {getSslCertificate, SslCertificateNotFoundError} = await import("@ui5/server/internal/sslUtil");
		try {
			const {key, cert} = await getSslCertificate(keyPath, certPath);
			serverConfig.key = key;
			serverConfig.cert = cert;
		} catch (err) {
			if (err instanceof SslCertificateNotFoundError) {
				const keyOrigin = serverConfig.key ? "--key" : "default location";
				const certOrigin = serverConfig.cert ? "--cert" : "default location";
				throw new Error(
					`Failed to find required SSL certificate for launching the HTTPS server.\n` +
					`Looked for:\n` +
					`  Private key: ${formatPath(keyPath)} (${keyOrigin})\n` +
					`  Certificate: ${formatPath(certPath)} (${certOrigin})\n` +
					`To fix this, either:\n` +
					`  • Run "ui5 certificate generate" to create and install one (recommended), or\n` +
					`  • Pass existing files with --key and --cert`
				);
			}
			throw err;
		}
	}

	const {promise: pOnError, reject} = Promise.withResolvers();
	const {serve: serverServe} = await import("@ui5/server");
	// The server does not depend on @ui5/project; inject the definition-watcher namespace it needs for
	// re-resolution. The CLI owns @ui5/project.
	const projectWatcher = await import("@ui5/project/internal/graph/ProjectDefinitionWatcher");
	// Pass buildGraph as the graphFactory so the server can re-resolve the graph and re-create
	// the serving stack when its definition watcher observes a project-definition change.
	const {https, port: actualPort} = await serverServe(graph, serverConfig, function(err) {
		reject(err);
	}, buildGraph, projectWatcher);

	if (argv.open !== undefined) {
		const protocol = https ? "https" : "http";
		let browserUrl = protocol + "://localhost:" + actualPort;
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
};

export default serve;

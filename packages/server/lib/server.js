import {getRandomValues} from "node:crypto";
import os from "node:os";
import process from "node:process";
import express from "express";
import portscanner from "portscanner";
import MiddlewareManager from "./middleware/MiddlewareManager.js";
import createErrorHandler from "./middleware/errorHandler.js";
import attachLiveReloadServer from "./liveReload/server.js";
import {createReaderCollection} from "@ui5/fs/resourceFactory";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import {getLogger} from "@ui5/logger";
import Cache from "@ui5/project/build/cache/Cache";

const log = getLogger("server");
/**
 * @public
 * @module @ui5/server
 */

/**
 * Returns a promise resolving by starting the server.
 *
 * @param {object} app The express application object
 * @param {number} port Desired port to listen to
 * @param {boolean} changePortIfInUse If true and the port is already in use, an unused port is searched
 * @param {boolean} acceptRemoteConnections If true, listens to remote connections and not only to localhost connections
 * @returns {Promise<object>} Returns an object containing server related information like (selected port, protocol)
 * @private
 */
function _listen(app, port, changePortIfInUse, acceptRemoteConnections) {
	return new Promise(function(resolve, reject) {
		const options = {};

		if (!acceptRemoteConnections) {
			// Unless remote connections are allowed, bind to the IPv4 loopback address
			options.host = "127.0.0.1";
		} // If remote connections are allowed, do not set host so the server listens on all supported interfaces

		const portScanHost = options.host || "127.0.0.1";
		let portMax;
		if (changePortIfInUse) {
			portMax = port + 30;
		} else {
			portMax = port;
		}

		portscanner.findAPortNotInUse(port, portMax, portScanHost, function(error, foundPort) {
			if (error) {
				reject(error);
				return;
			}

			if (!foundPort) {
				if (changePortIfInUse) {
					const error = new Error(
						`EADDRINUSE: Could not find available ports between ${port} and ${portMax}.`);
					error.code = "EADDRINUSE";
					error.errno = "EADDRINUSE";
					error.address = portScanHost;
					error.port = portMax;
					reject(error);
					return;
				} else {
					const error = new Error(`EADDRINUSE: Port ${port} is already in use.`);
					error.code = "EADDRINUSE";
					error.errno = "EADDRINUSE";
					error.address = portScanHost;
					error.port = portMax;
					reject(error);
					return;
				}
			}

			options.port = foundPort;
			const server = app.listen(options, function() {
				resolve({port: options.port, server});
			});

			server.on("error", function(err) {
				reject(err);
			});
		});
	});
}

/**
 * Adds SSL support to an express application.
 *
 * @param {object} parameters
 * @param {object} parameters.app The original express application
 * @param {string} parameters.key Path to private key to be used for https
 * @param {string} parameters.cert Path to certificate to be used for for https
 * @returns {Promise<object>} The express application with SSL support
 * @private
 */
async function _addSsl({app, key, cert}) {
	// Using spdy as http2 server as the native http2 implementation
	// from Node v8.4.0 doesn't seem to work with express
	const {default: spdy} = await import("spdy");
	return spdy.createServer({cert, key}, app);
}


/**
 * SAP target CSP middleware options
 *
 * @public
 * @typedef {object} module:@ui5/server.SAPTargetCSPOptions
 * @property {string} [defaultPolicy="sap-target-level-1"]
 * @property {string} [defaultPolicyIsReportOnly=true]
 * @property {string} [defaultPolicy2="sap-target-level-3"]
 * @property {string} [defaultPolicy2IsReportOnly=true]
 * @property {string[]} [ignorePaths=["test-resources/sap/ui/qunit/testrunner.html"]]
 */


/**
 * Start a server for the given project (sub-)tree.
 *
 * @public
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object} options Options
 * @param {number} options.port Port to listen to
 * @param {boolean} [options.changePortIfInUse=false] If true, change the port if it is already in use
 * @param {boolean} [options.h2=false] Whether HTTP/2 should be used - defaults to <code>http</code>
 * @param {string} [options.key] Path to private key to be used for https
 * @param {string} [options.cert] Path to certificate to be used for for https
 * @param {boolean} [options.simpleIndex=false] Use a simplified view for the server directory listing
 * @param {boolean} [options.liveReload=false] Automatically reload connected browsers when project sources change
 * @param {boolean} [options.acceptRemoteConnections=false] If true, listens to remote connections and
 * 															not only to localhost connections
 * @param {boolean|module:@ui5/server.SAPTargetCSPOptions} [options.sendSAPTargetCSP=false]
 * 										If set to <code>true</code> or an object, then the default (or configured)
 * 										set of security policies that SAP and UI5 aim for (AKA 'target policies'),
 * 										are send for any requested <code>*.html</code> file
 * @param {boolean} [options.serveCSPReports=false] Enable CSP reports serving for request url
 * 										'/.ui5/csp/csp-reports.json'
 * @param {string} [options.cache="Default"] Cache mode to use for building UI5 projects.
 * @param {string} [options.ui5DataDir] Explicit UI5 data directory to use for the build cache.
 * 										Overrides the <code>UI5_DATA_DIR</code> environment variable,
 * 										the UI5 configuration file, and the default of <code>~/.ui5</code>.
 * @param {string[]} [options.includedTasks] A list of tasks to be added to the default execution set.
 * 										Takes precedence over <code>excludedTasks</code>.
 * @param {string[]} [options.excludedTasks] A list of tasks to be excluded from the default task
 * 										execution set.
 * @param {Function} error Error callback. Will be called when an error occurs outside of request handling.
 * @returns {Promise<object>} Promise resolving once the server is listening.
 * 							It resolves with an object containing the <code>port</code>,
 * 							<code>h2</code>-flag and a <code>close</code> function,
 * 							which can be used to stop the server.
 */
export async function serve(graph, {
	port: requestedPort, changePortIfInUse = false, h2 = false, key, cert,
	acceptRemoteConnections = false, sendSAPTargetCSP = false,
	simpleIndex = false, liveReload = false, serveCSPReports = false, cache = Cache.Default,
	ui5DataDir, includedTasks, excludedTasks,
}, error) {
	const rootProject = graph.getRoot();

	const readers = [];
	await graph.traverseBreadthFirst(async function({project: dep}) {
		if (dep.getName() === rootProject.getName()) {
			// Ignore root project
			return;
		}
		readers.push(dep.getSourceReader("runtime"));
	});

	const dependencies = createReaderCollection({
		name: `Dependency reader collection for sources of project ${rootProject.getName()}`,
		readers
	});

	const rootReader = rootProject.getSourceReader("runtime");

	// TODO change to ReaderCollection once duplicates are sorted out
	const combo = new ReaderCollectionPrioritized({
		name: "Server: Reader for sources of all projects",
		readers: [rootReader, dependencies]
	});
	const sources = {
		rootProject: rootReader,
		dependencies: dependencies,
		all: combo
	};

	const initialBuildIncludedDependencies = [];
	if (graph.getProject("sap.ui.core")) {
		// Ensure sap.ui.core is always built initially (if present in the graph)
		initialBuildIncludedDependencies.push("sap.ui.core");
	}
	const buildServer = await graph.serve({
		initialBuildIncludedDependencies,
		includedTasks,
		excludedTasks,
		cache,
		ui5DataDir,
	});

	const resources = {
		rootProject: buildServer.getRootReader(),
		dependencies: buildServer.getDependenciesReader(),
		all: buildServer.getReader(),
	};

	buildServer.on("error", (err) => {
		if (typeof error === "function") {
			error(err);
			return;
		}
		log.error(`BuildServer error: ${err?.message ?? err}`);
		if (err?.stack) {
			log.verbose(err.stack);
		}
	});

	// Random 72 bits (9 * 8 bits), base64url-encoded to a 12-character string, should be sufficient for uniqueness.
	// OWASP recommends at least 64 bits of entropy for session IDs:
	// https://owasp.org/www-community/vulnerabilities/Insufficient_Session-ID_Length
	const webSocketToken = liveReload ?
		Buffer.from(getRandomValues(new Uint8Array(9))).toString("base64url") :
		null;

	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject,
		sources,
		resources,
		options: {
			sendSAPTargetCSP,
			serveCSPReports,
			simpleIndex,
			liveReload: {
				active: liveReload,
				token: webSocketToken
			}
		}
	});

	let app = express();
	await middlewareManager.applyMiddleware(app);
	// Terminal error handler for the middleware chain. Registered after applyMiddleware
	// so it sits last and intercepts every next(err) — including those from custom
	// middleware where we can't wrap a try/catch.
	app.use(createErrorHandler());

	if (h2) {
		const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);
		if (nodeVersion >= 24) {
			log.error("ERROR: With Node v24, usage of HTTP/2 is no longer supported. Please check https://github.com/UI5/cli/issues/327 for updates.");
			process.exit(1);
		}

		app = await _addSsl({app, key, cert});
	}

	let port; let server;
	try {
		({port, server} = await _listen(app, requestedPort, changePortIfInUse, acceptRemoteConnections));
	} catch (err) {
		await buildServer.destroy();
		throw err;
	}

	let liveReloadHandle;
	if (liveReload) {
		liveReloadHandle = attachLiveReloadServer({httpServer: server, buildServer, token: webSocketToken});
	}

	// Announce the bound URLs on the event bus. The server owns the network-
	// interface lookup because it knows the actual bound port (which may
	// differ from the requested one when changePortIfInUse is set). Consumers
	// (@ui5/logger writers) shape their own display from the label/url pairs.
	const protocol = h2 ? "https" : "http";
	const urls = [{label: "Local", url: `${protocol}://localhost:${port}`}];
	if (acceptRemoteConnections) {
		for (const addr of _findNetworkInterfaceAddresses()) {
			urls.push({label: "Network", url: `${protocol}://${addr}:${port}`});
		}
	}
	process.emit("ui5.server-listening", {
		urls,
		acceptRemoteConnections: !!acceptRemoteConnections,
	});

	return {
		h2,
		port,
		close: function(callback) {
			liveReloadHandle?.close();
			buildServer.destroy().then(() => {
				server.close(callback);
			}, () => {
				server.close(callback);
			});
		}
	};
}

// Collects all non-internal IPv4 addresses from the host's network interfaces
// so `ui5.server-listening` can list every reachable URL when the server binds
// to all interfaces. Returns an empty array if no suitable address is found.
function _findNetworkInterfaceAddresses() {
	const interfaces = os.networkInterfaces();
	const addresses = [];
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name] ?? []) {
			if (iface.family === "IPv4" && !iface.internal) {
				addresses.push(iface.address);
			}
		}
	}
	return addresses;
}

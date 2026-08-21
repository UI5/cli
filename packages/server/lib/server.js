import {getRandomValues} from "node:crypto";
import {getLogger} from "@ui5/logger";
import Supervisor from "./serve/Supervisor.js";

const log = getLogger("server");
/**
 * @public
 * @module @ui5/server
 */

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
 * Stops a running server.
 *
 * Can be awaited or used with a callback. Called without arguments, it returns a
 * <code>Promise</code> that resolves once teardown completes and rejects if teardown threw.
 * Called with a callback, it returns <code>undefined</code> and invokes the callback once
 * teardown completes, with no arguments on success or with the error as its first argument
 * if teardown threw.
 *
 * @public
 * @callback module:@ui5/server~closeServer
 * @param {Function} [callback] Invoked once teardown completes. Receives the teardown error as
 * 						its first argument if teardown threw, otherwise no arguments.
 * @returns {Promise<void>|undefined} A <code>Promise</code> that resolves once teardown completes
 * 						when called without a callback, otherwise <code>undefined</code>.
 */

/**
 * Handle of a running server instance.
 *
 * @public
 * @typedef {object} module:@ui5/server~ServerInstance
 * @property {number} port Port the server is listening on
 * @property {boolean} https Whether HTTPS is used
 * @property {module:@ui5/server~closeServer} close Stops the server
 * @property {Function} reinitialize Re-creates the serving stack. Returns a <code>Promise</code>
 * 						that resolves once the new stack is in place. A no-op when no
 * 						<code>graphFactory</code> was provided to {@link module:@ui5/server.serve}.
 */


/**
 * Start a server for the given project (sub-)tree.
 *
 * @public
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object} options Options
 * @param {number} options.port Port to listen to
 * @param {boolean} [options.changePortIfInUse=false] If true, change the port if it is already in use
 * @param {boolean} [options.https=false] Whether HTTPS should be used - defaults to <code>http</code>
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
 * @param {string} [options.rootConfigPath] Custom config path for the root project (from --config),
 * 										threaded to the definition watcher so it watches the right file.
 * @param {string} [options.workspaceConfigPath] Workspace config path (default ui5-workspace.yaml);
 * 										threaded to the definition watcher. Omit in static-graph mode.
 * @param {string} [options.dependencyDefinitionPath] Static dependency-definition file
 * 										(from --dependency-definition); watched when present.
 * @param {string} [options.cwd] Base directory for resolving the watcher's relative paths.
 * @param {Function} error Error callback. Will be called when an error occurs outside of request handling.
 * @param {Function} [graphFactory] Async factory that re-resolves the project graph with the
 * 										same parameters used to build the initial <code>graph</code>. When provided,
 * 										the returned <code>reinitialize</code> re-creates the serving stack on a
 * 										project-definition change. Omitted, <code>reinitialize</code> is a no-op.
 * @param {object} [projectWatcher] Injected <code>@ui5/project/internal/graph/ProjectDefinitionWatcher</code>
 * 										module namespace. The server operates on the project graph as an opaque
 * 										interface and does not depend on @ui5/project, so the owner (the UI5 CLI)
 * 										threads this in to provide the live re-resolution capability. Required
 * 										alongside <code>graphFactory</code>; omit both for a static serve.
 * @returns {Promise<module:@ui5/server~ServerInstance>} Promise resolving once the server is listening
 */
export async function serve(graph, {
	port, changePortIfInUse = false, https = false, key, cert,
	acceptRemoteConnections = false, sendSAPTargetCSP = false,
	simpleIndex = false, liveReload = false, serveCSPReports = false, cache = "Default",
	ui5DataDir, includedTasks, excludedTasks,
	rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd,
}, error, graphFactory, projectWatcher) {
	// The live-reload token is generated once and shared with every serving stack the supervisor
	// builds, so connected clients keep authenticating across a re-initialization.
	// Random 72 bits (9 * 8 bits), base64url-encoded to a 12-character string. OWASP recommends
	// at least 64 bits of entropy for session IDs:
	// https://owasp.org/www-community/vulnerabilities/Insufficient_Session-ID_Length
	const webSocketToken = liveReload ?
		Buffer.from(getRandomValues(new Uint8Array(9))).toString("base64url") :
		null;

	const config = {
		port, changePortIfInUse, https, key, cert,
		acceptRemoteConnections, sendSAPTargetCSP,
		simpleIndex, liveReload, serveCSPReports, cache,
		ui5DataDir, includedTasks, excludedTasks, webSocketToken,
		rootConfigPath, workspaceConfigPath, dependencyDefinitionPath, cwd,
	};

	let supervisor;
	try {
		supervisor = await Supervisor.create(graph, config, error, graphFactory, projectWatcher);
	} catch (err) {
		log.verbose(`Failed to start server: ${err?.message ?? err}`);
		throw err;
	}

	return {
		https,
		port: supervisor.getPort(),
		close: function(callback) {
			const p = supervisor.destroy();
			if (callback) {
				p.then(callback, callback);
			} else {
				return p;
			}
		},
		reinitialize: function() {
			return supervisor.reinitialize();
		},
	};
}

// Public API for integrating UI5's middleware into an existing HTTP server. Re-exported here
// so it is reachable via the package's main entry alongside serve(); the @public JSDoc lives
// on the function itself in serveMiddleware.js.
export {default as serveMiddleware} from "./serveMiddleware.js";

import {getLogger} from "@ui5/logger";
import Cache from "@ui5/project/build/cache/Cache";
import ServeSupervisor from "./ServeSupervisor.js";

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
 * @param {object} [options2] Additional options
 * @param {Function} [options2.graphFactory] Async factory that re-resolves the project graph with the
 * 										same parameters used to build the initial <code>graph</code>. When provided,
 * 										the returned <code>reinitialize</code> re-creates the serving stack on a
 * 										project-definition change. Omitted → <code>reinitialize</code> is a no-op.
 * @returns {Promise<object>} Promise resolving once the server is listening.
 * 							It resolves with an object containing the <code>port</code>,
 * 							<code>h2</code>-flag, a <code>close</code> function to stop the server,
 * 							and a <code>reinitialize</code> function to re-create the serving stack.
 */
export async function serve(graph, {
	port, changePortIfInUse = false, h2 = false, key, cert,
	acceptRemoteConnections = false, sendSAPTargetCSP = false,
	simpleIndex = false, liveReload = false, serveCSPReports = false, cache = Cache.Default,
	ui5DataDir, includedTasks, excludedTasks,
}, error, {graphFactory} = {}) {
	// The live-reload token is generated once and shared with every serving stack the supervisor
	// builds, so connected clients keep authenticating across a re-initialization.
	const webSocketToken = liveReload ? ServeSupervisor.generateWebSocketToken() : null;

	const config = {
		port, changePortIfInUse, h2, key, cert,
		acceptRemoteConnections, sendSAPTargetCSP,
		simpleIndex, liveReload, serveCSPReports, cache,
		ui5DataDir, includedTasks, excludedTasks, webSocketToken,
	};

	let supervisor;
	try {
		supervisor = await ServeSupervisor.create(graph, config, error, {graphFactory});
	} catch (err) {
		log.verbose(`Failed to start server: ${err?.message ?? err}`);
		throw err;
	}

	return {
		h2,
		port: supervisor.getPort(),
		close: function(callback) {
			supervisor.destroy(callback);
		},
		reinitialize: function() {
			return supervisor.reinitialize();
		},
	};
}

import Cache from "@ui5/project/build/cache/Cache";
import {buildRouter} from "./serve/stack.js";

/**
 * Assembles the UI5 middleware for a project graph and returns it as a single connect/Express
 * middleware, for mounting into an existing HTTP server rather than starting one.
 *
 * Unlike {@link module:@ui5/server.serve}, this does not bind a port, attach the live-reload
 * WebSocket server, or install the terminal HTML error handler; those belong to the server the
 * UI5 CLI owns. The caller mounts the returned <code>middleware</code> on its own
 * <code>express()</code> app or Express <code>Router</code>/Connect app via
 * <code>app.use(middleware)</code> and owns error handling and the HTTP listener.
 *
 * <code>close</code> must be called on teardown to release the BuildServer's source watcher and
 * build-cache handle.
 *
 * Note: A project graph can be served only once. Do not call both <code>serveMiddleware</code>
 * and {@link module:@ui5/server.serve} for the same graph.
 *
 * @example
 * import express from "express";
 * import {serveMiddleware} from "@ui5/server";
 *
 * const app = express();
 * const {middleware, close} = await serveMiddleware(graph);
 * app.use(middleware);
 * const listener = app.listen(8080);
 *
 * // On teardown, release the BuildServer's watcher and build-cache handle.
 * listener.close();
 * await close();
 *
 * @public
 * @alias module:@ui5/server.serveMiddleware
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object} [options] Options
 * @param {boolean|module:@ui5/server.SAPTargetCSPOptions} [options.sendSAPTargetCSP=false]
 * 										If set to <code>true</code> or an object, then the default (or configured)
 * 										set of security policies that SAP and UI5 aim for (AKA 'target policies'),
 * 										are send for any requested <code>*.html</code> file
 * @param {boolean} [options.serveCSPReports=false] Enable CSP reports serving for request url
 * 										'/.ui5/csp/csp-reports.json'
 * @param {boolean} [options.simpleIndex=false] Use a simplified view for the server directory listing
 * @param {string} [options.cache="Default"] Cache mode to use for building UI5 projects.
 * @param {string} [options.ui5DataDir] Explicit UI5 data directory to use for the build cache.
 * 										Overrides the <code>UI5_DATA_DIR</code> environment variable,
 * 										the UI5 configuration file, and the default of <code>~/.ui5</code>.
 * @param {string[]} [options.includedTasks] A list of tasks to be added to the default execution set.
 * 										Takes precedence over <code>excludedTasks</code>.
 * @param {string[]} [options.excludedTasks] A list of tasks to be excluded from the default task
 * 										execution set.
 * @param {Function} [error] Error callback. Will be called when the BuildServer emits an error
 * 										outside of request handling.
 * @returns {Promise<object>} Promise resolving with an object containing the
 * 							<code>middleware</code> (a connect/Express-compatible handler to be
 * 							mounted via <code>app.use()</code>), the <code>buildServer</code>, and a
 * 							<code>close</code> function releasing the BuildServer's watcher and cache.
 */
export default async function serveMiddleware(graph, {
	sendSAPTargetCSP = false, simpleIndex = false, serveCSPReports = false, cache = Cache.Default,
	ui5DataDir, includedTasks, excludedTasks,
} = {}, error) {
	const config = {
		sendSAPTargetCSP, simpleIndex, serveCSPReports, cache,
		ui5DataDir, includedTasks, excludedTasks,
		// The live-reload WebSocket server belongs to the UI5 CLI's HTTP server, which this
		// embedding API does not create. Inactive with no token leaves the liveReloadClient
		// middleware in place but dormant (no client script injection).
		liveReload: false,
		webSocketToken: null,
	};

	const {router, buildServer} = await buildRouter(graph, config, error);

	let destroyed = false;
	return {
		middleware: router,
		buildServer,
		close: async function close() {
			if (destroyed) {
				return;
			}
			destroyed = true;
			await buildServer.destroy();
		},
	};
}

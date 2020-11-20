const express = require("express");
const portscanner = require("portscanner");

const MiddlewareManager = require("./middleware/MiddlewareManager");

const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const ReaderCollectionPrioritized = ui5Fs.ReaderCollectionPrioritized;

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
			options.host = "localhost";
		}

		const host = options.host || "127.0.0.1";
		let portMax;
		if (changePortIfInUse) {
			portMax = port + 30;
		} else {
			portMax = port;
		}

		portscanner.findAPortNotInUse(port, portMax, host, function(error, foundPort) {
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
					error.address = host;
					error.port = portMax;
					reject(error);
					return;
				} else {
					const error = new Error(`EADDRINUSE: Port ${port} is already in use.`);
					error.code = "EADDRINUSE";
					error.errno = "EADDRINUSE";
					error.address = host;
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
 * @returns {object} The express application with SSL support
 * @private
 */
function _addSsl({app, key, cert}) {
	// Using spdy as http2 server as the native http2 implementation
	// from Node v8.4.0 doesn't seem to work with express
	return require("spdy").createServer({cert, key}, app);
}

/**
 * @public
 * @namespace
 * @alias module:@ui5/server.server
 */
module.exports = {
	/**
	 * Start a server for the given project (sub-)tree.
	 *
	 * @public
	 * @param {object} tree A (sub-)tree
	 * @param {object} options Options
	 * @param {number} options.port Port to listen to
	 * @param {boolean} [options.changePortIfInUse=false] If true, change the port if it is already in use
	 * @param {boolean} [options.h2=false] Whether HTTP/2 should be used - defaults to <code>http</code>
	 * @param {string} [options.key] Path to private key to be used for https
	 * @param {string} [options.cert] Path to certificate to be used for for https
	 * @param {boolean} [options.acceptRemoteConnections=false] If true, listens to remote connections and
	 * 															not only to localhost connections
	 * @param {boolean} [options.sendSAPTargetCSP=false] If true, then the content security policies that SAP and UI5
	 * 													aim for (AKA 'target policies'), are send for any requested
	 * 													<code>*.html</code> file
	 * @param {boolean} [options.simpleIndex=false] Use a simplified view for the server directory listing
	 * @param {boolean} [options.serveCSPReports=false] Enable csp reports serving for request url
	 * '/.ui5/csp/csp-reports.json'
	 * @returns {Promise<object>} Promise resolving once the server is listening.
	 * 							It resolves with an object containing the <code>port</code>,
	 * 							<code>h2</code>-flag and a <code>close</code> function,
	 * 							which can be used to stop the server.
	 */
	async serve(tree, {
		port: requestedPort, changePortIfInUse = false, h2 = false, key, cert,
		acceptRemoteConnections = false, sendSAPTargetCSP = false, simpleIndex = false, serveCSPReports = false
	}) {
		const projectResourceCollections = resourceFactory.createCollectionsForTree(tree);


		// TODO change to ReaderCollection once duplicates are sorted out
		const combo = new ReaderCollectionPrioritized({
			name: "server - prioritize workspace over dependencies",
			readers: [projectResourceCollections.source, projectResourceCollections.dependencies]
		});

		const resources = {
			rootProject: projectResourceCollections.source,
			dependencies: projectResourceCollections.dependencies,
			all: combo
		};

		const middlewareManager = new MiddlewareManager({
			tree,
			resources,
			options: {
				sendSAPTargetCSP,
				serveCSPReports,
				simpleIndex
			}
		});

		let app = express();
		await middlewareManager.applyMiddleware(app);

		if (h2) {
			app = _addSsl({app, key, cert});
		}

		const {port, server} = await _listen(app, requestedPort, changePortIfInUse, acceptRemoteConnections);

		return {
			h2,
			port,
			close: function(callback) {
				server.close(callback);
			}
		};
	}
};

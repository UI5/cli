const express = require("express");
const compression = require("compression");
const cors = require("cors");
const portscanner = require("portscanner");

const serveResources = require("./middleware/serveResources");
const serveIndex = require("./middleware/serveIndex");
const discovery = require("./middleware/discovery");
const versionInfo = require("./middleware/versionInfo");
const serveThemes = require("./middleware/serveThemes");
const csp = require("./middleware/csp");
const ui5connect = require("connect-openui5");
const nonReadRequests = require("./middleware/nonReadRequests");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const ReaderCollectionPrioritized = ui5Fs.ReaderCollectionPrioritized;

/**
 * Start a server for the given project (sub-)tree
 *
 * @public
 * @module @ui5/server/server
 * @param {Object} tree A (sub-)tree
 * @param {Object} options Options
 * @param {number} options.port Port to listen to
 * @param {boolean} [options.changePortIfInUse=false] If true, change the port if it is already in use
 * @param {boolean} [options.h2=false] Whether HTTP/2 should be used - defaults to <code>http</code>
 * @param {string} [options.key] Path to private key to be used for https
 * @param {string} [options.cert] Path to certificate to be used for for https
 * @param {boolean} [options.acceptRemoteConnections=false] If true, listens to remote connections and not only to localhost connections
 * @returns {Promise<Object>} Promise resolving once the server is listening. It resolves with an object containing the <code>port</code>,
 *                            <code>h2</code>-flag and a <code>close</code> function, which can be used to stop the server.
 */
function serve(tree, {port, changePortIfInUse = false, h2 = false, key, cert, acceptRemoteConnections = false}) {
	return Promise.resolve().then(() => {
		const projectResourceCollections = resourceFactory.createCollectionsForTree(tree);

		const workspace = resourceFactory.createWorkspace({
			reader: projectResourceCollections.source,
			name: tree.metadata.name
		});

		const combo = new ReaderCollectionPrioritized({
			name: "server - prioritize workspace over dependencies",
			readers: [workspace, projectResourceCollections.dependencies]
		});

		const resourceCollections = {
			source: projectResourceCollections.source,
			dependencies: projectResourceCollections.dependencies,
			combo
		};

		const app = express();

		const oCspConfig = {
			allowDynamicPolicySelection: true,
			allowDynamicPolicyDefinition: true,
			defaultPolicyIsReportOnly: true,
			definedPolicies: {
				"sap-target-level-1":
					"default-src 'self'; " +
					"script-src  'self' 'unsafe-eval'; " +
					"style-src   'self' 'unsafe-inline'; " +
					"font-src    'self' data:; " +
					"img-src     'self' * data: blob:; " +
					"frame-src   'self' https: data: blob:; " +
					"child-src   'self' https: data: blob:; " +
					"connect-src 'self' https: wss:;",
				"sap-target-level-2":
					"default-src 'self'; " +
					"script-src  'self'; " +
					"style-src   'self' 'unsafe-inline'; " +
					"font-src    'self' data:; " +
					"img-src     'self' * data: blob:; " +
					"frame-src   'self' https: data: blob:; " +
					"child-src   'self' https: data: blob:; " +
					"connect-src 'self' https: wss:;"
			}
		};
		app.use(csp("sap-ui-xx-csp-policy", oCspConfig));

		app.use(compression());
		app.use(cors());

		app.use("/discovery", discovery({resourceCollections}));
		app.use(serveResources({resourceCollections}));
		app.use(serveThemes({resourceCollections}));
		app.use("/resources/sap-ui-version.json", versionInfo({resourceCollections, tree}));

		app.use("/proxy", ui5connect.proxy({
			secure: false
		}));

		// Handle anything but read operations *before* the serveIndex middleware
		//	as it will reject them with a 405 (Method not allowed) instead of 404 like our old tooling
		app.use(nonReadRequests({resourceCollections}));
		app.use(serveIndex({resourceCollections}));

		if (h2) {
			return _addSsl({app, h2, key, cert});
		}
		return app;
	}).then((app) => {
		return _listen(app, port, changePortIfInUse, acceptRemoteConnections).then(function({port, server}) {
			return {
				h2,
				port,
				close: function(callback) {
					server.close(callback);
				}
			};
		});
	});
}

/**
 * Returns a promise resolving by starting the server.
 *
 * @param {Object} app The express applicaton object
 * @param {number} port Desired port to listen to
 * @param {boolean} changePortIfInUse If true and the port is already in use, an unused port is searched
 * @param {boolean} acceptRemoteConnections If true, listens to remote connections and not only to localhost connections
 * @returns {Promise<Object>} Returns an object containing server related information like (selected port, protocol)
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
					reject(`Could not find available ports between ${port} and ${portMax}.`);
					return;
				} else {
					reject(`Port ${port} already in use.`);
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
 * Adds SSL support to an express application
 *
 * @param {Object} app The original express application
 * @param {string} key Path to private key to be used for https
 * @param {string} cert Path to certificate to be used for for https
 * @returns {Object} The express application with SSL support
 * @private
 */
function _addSsl({app, key, cert}) {
	// Using spdy as http2 server as the native http2 implementation
	// from Node v8.4.0 doesn't seem to work with express
	return require("spdy").createServer({cert, key}, app);
}

module.exports = {
	serve: serve
};

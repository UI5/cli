const express = require("express");
const compression = require("compression");
const cors = require("cors");
const serveIndex = require("serve-index");
const portscanner = require("portscanner");

const serveResources = require("./middleware/serveResources");
const discovery = require("./middleware/discovery");
const versionInfo = require("./middleware/versionInfo");
const serveThemes = require("./middleware/serveThemes");
const ui5connect = require("connect-openui5");
const nonReadRequests = require("./middleware/nonReadRequests");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const ReaderCollectionPrioritized = ui5Fs.ReaderCollectionPrioritized;
const fsInterface = ui5Fs.fsInterface;

/**
 * Start a server for the given project (sub-)tree
 *
 * @module server/server
 * @param      {Object}   tree       	A (sub-)tree
 * @param      {Object}   options       Options
 * @param      {string}   options.port  Port to listen to
 * @param      {boolean}  [options.changePortIfInUse=false]  If true, change the port if it is already in use
 * @param      {string}   [options.protocol=http]  Protocol to be used (http|https|h2) - defaults to <pre>http</pre>
 * @param      {string}   [options.key]  Path to private key to be used for https
 * @param      {string}   [options.cert]  Path to certificate to be used for for https

 * @returns     {Promise}  Promise resolving with an object containing the <pre>port</pre> once the server is listening
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
		app.use(serveIndex("/", {
			fs: fsInterface(resourceCollections.combo),
			hidden: true,
			icons: true
		}));

		if (h2) {
			return addSsl({app, h2, key, cert});
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

function _listen(app, port, changePortIfInUse, acceptRemoteConnections) {
	return new Promise(function(resolve, reject) {
		const options = {};

		if (!acceptRemoteConnections) {
			options.host = "localhost";
		}

		let host = options.host || "127.0.0.1";
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

function addSsl({app, protocol, key, cert}) {
	// Using spdy as http2 server as the native http2 implementation
	// from Node v8.4.0 doesn't seem to work with express
	return require("spdy").createServer({cert, key}, app);
}

module.exports = {
	serve: serve
};

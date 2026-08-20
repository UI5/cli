import os from "node:os";
import https from "node:https";
import portscanner from "portscanner";

/**
 * HTTP-listener helpers used by the {@link Supervisor}, which binds the port once and
 * swaps the request handler behind it.
 *
 * @private
 * @module @ui5/server/serve/httpListener
 */

/**
 * Binds an HTTP/HTTPS server to a free port and resolves once it is listening.
 *
 * @param {object} app The http/https server to listen with
 * @param {number} port Desired port to listen to
 * @param {boolean} changePortIfInUse If true and the port is already in use, an unused port is searched
 * @param {boolean} acceptRemoteConnections If true, listens to remote connections and not only to localhost
 * @returns {Promise<object>} Resolves with the bound <code>port</code> and the <code>server</code> instance
 * @private
 */
export function listen(app, port, changePortIfInUse, acceptRemoteConnections) {
	return new Promise(function(resolve, reject) {
		const options = {};

		if (!acceptRemoteConnections) {
			// Unless remote connections are allowed, bind to the IPv4 loopback address
			options.host = "127.0.0.1";
		} // If remote connections are allowed, do not set host so the server listens on all supported interfaces

		const portScanHost = options.host || "127.0.0.1";
		const portMax = changePortIfInUse ? port + 30 : port;

		portscanner.findAPortNotInUse(port, portMax, portScanHost, function(error, foundPort) {
			if (error) {
				reject(error);
				return;
			}

			if (!foundPort) {
				const err = new Error(changePortIfInUse ?
					`EADDRINUSE: Could not find available ports between ${port} and ${portMax}.` :
					`EADDRINUSE: Port ${port} is already in use.`);
				err.code = "EADDRINUSE";
				err.errno = "EADDRINUSE";
				err.address = portScanHost;
				err.port = portMax;
				reject(err);
				return;
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
 * Wraps a request handler in an HTTPS server.
 *
 * @param {object} parameters
 * @param {Function} parameters.app The request handler to serve over HTTPS
 * @param {string} parameters.key Path to private key to be used for https
 * @param {string} parameters.cert Path to certificate to be used for for https
 * @returns {object} The https server
 * @private
 */
export function addSsl({app, key, cert}) {
	return https.createServer({key, cert}, app);
}

/**
 * Announces the bound URLs on the event bus. The server owns the network-interface lookup
 * because it knows the actual bound port (which may differ from the requested one when
 * changePortIfInUse is set). Consumers (@ui5/logger writers) shape their own display from the
 * label/url pairs.
 *
 * @param {object} parameters
 * @param {number} parameters.port The actual bound port
 * @param {boolean} parameters.https Whether HTTPS is in use
 * @param {boolean} parameters.acceptRemoteConnections Whether the server binds to all interfaces
 * @private
 */
export function announceListening({port, https, acceptRemoteConnections}) {
	const protocol = https ? "https" : "http";
	const urls = [{label: "Local", url: `${protocol}://localhost:${port}`}];
	if (acceptRemoteConnections) {
		for (const addr of findNetworkInterfaceAddresses()) {
			urls.push({label: "Network", url: `${protocol}://${addr}:${port}`});
		}
	}
	process.emit("ui5.server-listening", {
		urls,
		acceptRemoteConnections: !!acceptRemoteConnections,
	});
}

// Collects all non-internal IPv4 addresses so `ui5.server-listening` can list every reachable
// URL when the server binds to all interfaces. Empty array if none is found.
function findNetworkInterfaceAddresses() {
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

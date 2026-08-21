import os from "node:os";
import http from "node:http";
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
 * Creates the Node server for the given config, wiring the request handler in. HTTPS when a key/cert
 * pair is configured, plain HTTP otherwise. The returned server is not yet bound; pass it to
 * {@link listen}.
 *
 * @param {object} parameters
 * @param {boolean} parameters.https Whether to create an HTTPS server
 * @param {string} [parameters.key] Private key to be used for https
 * @param {string} [parameters.cert] Certificate to be used for https
 * @param {Function} requestHandler The request handler to serve
 * @returns {object} The (unbound) http/https server
 * @private
 */
export function createServer({https: useHttps, key, cert}, requestHandler) {
	return useHttps ?
		https.createServer({key, cert}, requestHandler) :
		http.createServer(requestHandler);
}

/**
 * Binds an HTTP/HTTPS server to a free port and resolves once it is listening.
 *
 * @param {object} server The http/https server to listen with
 * @param {number} port Desired port to listen to
 * @param {boolean} changePortIfInUse If true and the port is already in use, an unused port is searched
 * @param {boolean} acceptRemoteConnections If true, listens to remote connections and not only to localhost
 * @returns {Promise<object>} Resolves with the bound <code>port</code> and the <code>server</code> instance
 * @private
 */
export function listen(server, port, changePortIfInUse, acceptRemoteConnections) {
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
			server.listen(options, function() {
				resolve({port: options.port, server});
			});

			server.on("error", function(err) {
				reject(err);
			});
		});
	});
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

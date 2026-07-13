import os from "node:os";
import portscanner from "portscanner";

/**
 * HTTP-listener helpers shared between the single-shot {@link module:@ui5/server.serve}
 * wrapper and the {@link ServeSupervisor}, which binds the port once and swaps the
 * request handler behind it.
 *
 * @private
 * @module @ui5/server/serveHttp
 */

/**
 * Binds an HTTP/HTTPS server to a free port and resolves once it is listening.
 *
 * @param {object} app The express application (or spdy server) to listen with
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
export async function addSsl({app, key, cert}) {
	// Using spdy as http2 server as the native http2 implementation
	// from Node v8.4.0 doesn't seem to work with express
	const {default: spdy} = await import("spdy");
	return spdy.createServer({cert, key}, app);
}

/**
 * Announces the bound URLs on the event bus. The server owns the network-interface
 * lookup because it knows the actual bound port (which may differ from the requested
 * one when changePortIfInUse is set). Consumers (@ui5/logger writers) shape their own
 * display from the label/url pairs.
 *
 * @param {object} parameters
 * @param {number} parameters.port The actual bound port
 * @param {boolean} parameters.h2 Whether HTTP/2 (https) is in use
 * @param {boolean} parameters.acceptRemoteConnections Whether the server binds to all interfaces
 * @private
 */
export function announceListening({port, h2, acceptRemoteConnections}) {
	const protocol = h2 ? "https" : "http";
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

// Collects all non-internal IPv4 addresses from the host's network interfaces
// so `ui5.server-listening` can list every reachable URL when the server binds
// to all interfaces. Returns an empty array if no suitable address is found.
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

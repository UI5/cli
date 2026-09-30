import os from "node:os";
import net from "node:net";
import http from "node:http";
import https from "node:https";

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
// Timeout (ms) for a single port probe. On localhost a port either accepts or refuses the
// connection immediately, so this only guards against a probe that hangs indefinitely.
const PORT_PROBE_TIMEOUT = 400;

/**
 * Probes whether something is accepting TCP connections on the given host/port.
 *
 * Mirrors the connect-probe semantics of the previously used <code>portscanner</code> dependency:
 * a successful connection means the port is in use; a refused connection or a timeout means it is
 * free. Any other socket error (e.g. an unreachable host) is treated as a scan failure and rejects,
 * so unexpected problems surface to the caller instead of being silently reported as "free".
 *
 * @param {string} host Host to probe
 * @param {number} port Port to probe
 * @returns {Promise<boolean>} Resolves <code>true</code> if the port is in use, <code>false</code> if free
 * @private
 */
function isPortInUse(host, port) {
	return new Promise(function(resolve, reject) {
		const socket = new net.Socket();
		const finish = function(settle, value) {
			socket.destroy();
			settle(value);
		};
		socket.setTimeout(PORT_PROBE_TIMEOUT);
		socket.once("connect", () => finish(resolve, true));
		socket.once("timeout", () => finish(resolve, false));
		socket.once("error", function(err) {
			if (err.code === "ECONNREFUSED") {
				finish(resolve, false);
			} else {
				finish(reject, err);
			}
		});
		socket.connect(port, host);
	});
}

/**
 * Scans the inclusive port range <code>[port, portMax]</code> on the given host and returns the
 * first port not in use, or <code>null</code> if every port in the range is taken.
 *
 * @param {number} port First port of the range
 * @param {number} portMax Last port of the range (inclusive)
 * @param {string} host Host to scan
 * @returns {Promise<number|null>} The first free port, or <code>null</code> if none is available
 * @private
 */
async function findAPortNotInUse(port, portMax, host) {
	for (let candidate = port; candidate <= portMax; candidate++) {
		if (!await isPortInUse(host, candidate)) {
			return candidate;
		}
	}
	return null;
}

export function listen(server, port, changePortIfInUse, acceptRemoteConnections) {
	return new Promise(function(resolve, reject) {
		const options = {};

		if (!acceptRemoteConnections) {
			// Unless remote connections are allowed, bind to the IPv4 loopback address
			options.host = "127.0.0.1";
		} // If remote connections are allowed, do not set host so the server listens on all supported interfaces

		const portScanHost = options.host || "127.0.0.1";
		const portMax = changePortIfInUse ? port + 30 : port;

		findAPortNotInUse(port, portMax, portScanHost).then(function(foundPort) {
			if (foundPort === null) {
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
		}, reject);
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

import workerpool from "workerpool";
import themeBuilder from "./themeBuilder.js";
import {createResource} from "@ui5/fs/resourceFactory";
import {Buffer} from "node:buffer";

/**
 * Task to build library themes.
 *
 * @private
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {MessagePort} parameters.fsInterfacePort
 * @param {object[]} parameters.themeResources Input array of Uint8Array transferable objects
 * 	that are the less sources to build upon. By nature those are @ui5/fs/Resource.
 * @param {object} parameters.options Less compiler options
 * @returns {Promise<object[]>} Resulting array of Uint8Array transferable objects
 */
export default async function execThemeBuild({
	fsInterfacePort,
	themeResources = [],
	options = {}
}) {
	const fsThemeResources = deserializeResources(themeResources);
	const fsReader = new FsWorkerThreadInterface(fsInterfacePort);

	const result = await themeBuilder({
		resources: fsThemeResources,
		fs: fsReader,
		options
	});

	return serializeResources(result);
}

/**
 * Casts @ui5/fs/Resource-s into an Uint8Array transferable object
 *
 * @param {@ui5/fs/Resource[]} resourceCollection
 * @returns {Promise<object[]>}
 */
export async function serializeResources(resourceCollection) {
	return Promise.all(
		resourceCollection.map(async (res) => ({
			buffer: await res.getBuffer(),
			path: res.getPath()
		}))
	);
}

/**
 * Casts Uint8Array into @ui5/fs/Resource-s transferable object
 *
 * @param {Promise<object[]>} resources
 * @returns {@ui5/fs/Resource[]}
 */
export function deserializeResources(resources) {
	return resources.map((res) => {
		// res.buffer is an Uint8Array object and needs to be cast
		// to a Buffer in order to be read correctly.
		return createResource({path: res.path, buffer: Buffer.from(res.buffer)});
	});
}

/**
 * "@ui5/fs/fsInterface" like class that uses internally
 * "@ui5/fs/fsInterface", implements its methods, and
 * sends the results to a MessagePort.
 *
 * Used in the main thread in a combination with FsWorkerThreadInterface.
 */
export class FsMainThreadInterface {
	#comPorts = new Set();
	#fsInterfaceReader = null;
	#cache = Object.create(null);

	/**
	 * Constructor
	 *
	 * @param {@ui5/fs/fsInterface} fsInterfaceReader Reader for the Resources
	 */
	constructor(fsInterfaceReader) {
		if (!fsInterfaceReader) {
			throw new Error("fsInterfaceReader is mandatory argument");
		}

		this.#fsInterfaceReader = fsInterfaceReader;
	}

	/**
	 * Adds MessagePort and starts listening for requests on it.
	 *
	 * @param {MessagePort} comPort port1 from a {code}MessageChannel{/code}
	 */
	startCommunication(comPort) {
		if (!comPort) {
			throw new Error("Communication channel is mandatory argument");
		}

		this.#comPorts.add(comPort);
		comPort.on("message", (e) => this.#onMessage(e, comPort));
		comPort.on("close", () => comPort.close());
	}

	/**
	 * Ends MessagePort communication.
	 *
	 * @param {MessagePort} comPort port1 to remove from handling.
	 */
	endCommunication(comPort) {
		comPort.close();
		this.#comPorts.delete(comPort);
	}

	/**
	 * Destroys the FsMainThreadInterface
	 */
	cleanup() {
		this.#comPorts.forEach((comPort) => comPort.close());
		this.#cache = null;
		this.#fsInterfaceReader = null;
	}

	/**
	 * Handles messages from the MessagePort
	 *
	 * @param {object} e data to construct the request
	 * @param {string} e.action Action to perform. Corresponds to the names of
	 * 	the public methods of "@ui5/fs/fsInterface"
	 * @param {string} e.fsPath Path of the Resource
	 * @param {object} e.options Options for "readFile" action
	 * @param {MessagePort} comPort The communication channel
	 */
	#onMessage(e, comPort) {
		switch (e.action) {
		case "readFile":
			this.#doRequest(comPort, {action: "readFile", fsPath: e.fsPath, options: e.options});
			break;
		case "stat":
			this.#doRequest(comPort, {action: "stat", fsPath: e.fsPath});
			break;
		}
	}

	/**
	 * Requests a Resource from the "@ui5/fs/fsInterface" and sends it to the worker threads
	 * via postMessage.
	 *
	 * @param {MessagePort} comPort The communication channel
	 * @param {object} parameters
	 * @param {string} parameters.action Action to perform. Corresponds to the names of
	 * 	the public methods of "@ui5/fs/fsInterface" and triggers this method of the
	 *	"@ui5/fs/fsInterface" instance.
	 * @param {string} parameters.fsPath Path of the Resource
	 * @param {object} parameters.options Options for "readFile" action
	 */
	async #doRequest(comPort, {action, fsPath, options}) {
		const cacheKey = `${fsPath}-${action}`;
		if (!this.#cache[cacheKey]) {
			this.#cache[cacheKey] = new Promise((res) => {
				if (action === "readFile") {
					this.#fsInterfaceReader.readFile(fsPath, options, (error, result) => res({error, result}));
				} else if (action === "stat") {
					this.#fsInterfaceReader.stat(fsPath, (error, result) =>
						// The Stat object has some special methods that sometimes cannot be serialized
						// properly in the postMessage. In this scenario, we do not need those methods,
						// but just to check whether stats has resolved to something.
						res(JSON.parse(JSON.stringify({error, result})))
					);
				} else {
					res({error: new Error(`Action "${action}" is not available.`), result: null});
				}
			});
		}

		const fromCache = await this.#cache[cacheKey];
		comPort.postMessage({action, fsPath, ...fromCache});
	}
}

/**
 * "@ui5/fs/fsInterface" like class that uses internally
 * "@ui5/fs/fsInterface", implements its methods, and
 * requests resources via MessagePort.
 *
 * Used in the main thread in a combination with FsMainThreadInterface.
 */
export class FsWorkerThreadInterface {
	#comPort = null;
	#callbacks = [];
	#cache = Object.create(null);

	/**
	 * Constructor
	 *
	 * @param {MessagePort} comPort Communication port
	 */
	constructor(comPort) {
		if (!comPort) {
			throw new Error("Communication port is mandatory argument");
		}

		this.#comPort = comPort;
		comPort.on("message", this.#onMessage.bind(this));
		comPort.on("close", this.#onClose.bind(this));
	}

	/**
	 * Handles messages from MessagePort
	 *
	 * @param {object} e
	 * @param {string} e.action Action to perform. Corresponds to the names of
	 * 	the public methods of "@ui5/fs/fsInterface"
	 * @param {string} e.fsPath Path of the Resource
	 * @param {*} e.result Response from the "action".
	 * @param {object} e.error Error from the "action".
	 */
	#onMessage(e) {
		const cbObject = this.#callbacks.find((cb) => cb.action === e.action && cb.fsPath === e.fsPath);

		if (cbObject) {
			this.#cache[`${e.fsPath}-${e.action}`] = {error: e.error, result: e.result};
			this.#callbacks.splice(this.#callbacks.indexOf(cbObject), 1);
			cbObject.callback(e.error, e.result);
		} else {
			throw new Error("No callback found for this message! Possible hang for the thread!", e);
		}
	}

	/**
	 * End communication
	 */
	#onClose() {
		this.#comPort.close();
		this.#cache = null;
	}

	/**
	 * Makes a request via the MessagePort
	 *
	 * @param {object} parameters
	 * @param {string} parameters.action Action to perform. Corresponds to the names of
	 * 	the public methods.
	 * @param {string} parameters.fsPath Path of the Resource
	 * @param {object} parameters.options Options for "readFile" action
	 * @param {Function} callback Callback to call when the "action" is executed and ready.
	 */
	#doRequest({action, fsPath, options}, callback) {
		const cacheKey = `${fsPath}-${action}`;

		if (this.#cache[cacheKey]) {
			const {result, error} = this.#cache[cacheKey];
			callback(error, result);
		} else {
			this.#callbacks.push({action, fsPath, callback});
			this.#comPort.postMessage({action, fsPath, options});
		}
	}

	readFile(fsPath, options, callback) {
		this.#doRequest({action: "readFile", fsPath, options}, callback);
	}

	stat(fsPath, callback) {
		this.#doRequest({action: "stat", fsPath}, callback);
	}
}

// Test execution via ava is never done on the main thread
/* istanbul ignore else */
if (!workerpool.isMainThread) {
	// Script got loaded through workerpool
	// => Create a worker and register public functions
	workerpool.worker({
		execThemeBuild
	});
}

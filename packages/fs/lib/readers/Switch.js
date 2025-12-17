import AbstractReader from "../AbstractReader.js";

/**
 * Reader allowing to switch its underlying reader at runtime.
 * If no reader is set, read operations will be halted/paused until a reader is set.
 */
export default class Switch extends AbstractReader {
	#reader;
	#pendingCalls = [];

	constructor({name, reader}) {
		super(name);
		this.#reader = reader;
	}

	/**
	 * Sets the underlying reader and processes any pending read operations.
	 *
	 * @param {@ui5/fs/AbstractReader} reader The reader to delegate to.
	 */
	setReader(reader) {
		this.#reader = reader;
		this._processPendingCalls();
	}

	/**
	 * Unsets the underlying reader. Future calls will be queued.
	 */
	unsetReader() {
		this.#reader = null;
	}

	async _byGlob(virPattern, options, trace) {
		if (this.#reader) {
			return this.#reader._byGlob(virPattern, options, trace);
		}

		// No reader set, so we queue the call and return a pending promise
		return this._enqueueCall("_byGlob", [virPattern, options, trace]);
	}


	async _byPath(virPath, options, trace) {
		if (this.#reader) {
			return this.#reader._byPath(virPath, options, trace);
		}

		// No reader set, so we queue the call and return a pending promise
		return this._enqueueCall("_byPath", [virPath, options, trace]);
	}

	/**
	 * Queues a method call by returning a promise and storing its resolver.
	 *
	 * @param {string} methodName The method name to call later.
	 * @param {Array} args The arguments to pass to the method.
	 * @returns {Promise} A promise that will be resolved/rejected when the call is processed.
	 */
	_enqueueCall(methodName, args) {
		return new Promise((resolve, reject) => {
			this.#pendingCalls.push({methodName, args, resolve, reject});
		});
	}

	/**
	 * Processes all pending calls in the queue using the current reader.
	 *
	 * @private
	 */
	_processPendingCalls() {
		const callsToProcess = this.#pendingCalls;
		this.#pendingCalls = []; // Clear queue immediately to prevent race conditions

		for (const call of callsToProcess) {
			const {methodName, args, resolve, reject} = call;
			// Execute the pending call with the newly set reader
			this.#reader[methodName](...args)
				.then(resolve)
				.catch(reject);
		}
	}
}

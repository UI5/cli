const stream = require("stream");
const clone = require("clone");
const path = require("path");

const fnTrue = () => true;
const fnFalse = () => false;

/**
 * Resource
 */
class Resource {
	/**
	 * The constructor.
	 *
	 * @param {Object} parameters Parameters
	 * @param {string} parameters.path Virtual path
	 * @param {Object} [parameters.statInfo] File stat information
	 * @param {Buffer} [parameters.buffer] Content of this resources as a Buffer instance
	 *					(cannot be used in conjunction with parameters string, stream or createStream)
	 * @param {string} [parameters.string] Content of this resources as a string
	 *					(cannot be used in conjunction with parameters buffer, stream or createStream)
	 * @param {Stream} [parameters.stream] Readable stream of the content of this resource
	 *					(cannot be used in conjunction with parameters buffer, string or createStream)
	 * @param {function} [parameters.createStream] Function callback that returns a readable stream of the content
	 *					of this resource (cannot be used in conjunction with parameters buffer, string or stream)
	 */
	constructor({path, statInfo, buffer, string, createStream, stream, project}) {
		if (!path) {
			throw new Error("Cannot create Resource: path parameter missing");
		}
		if (buffer && createStream || buffer && string || string && createStream || buffer && stream ||
				string && stream || createStream && stream) {
			throw new Error("Cannot create Resource: Please set only one content parameter. " +
				"Buffer, string, stream or createStream");
		}

		this._path = path;
		this._name = this._getNameFromPath(path);
		this._project = project; // Experimental, internal parameter
		this._statInfo = statInfo || { // TODO
			isFile: fnTrue,
			isDirectory: fnFalse,
			isBlockDevice: fnFalse,
			isCharacterDevice: fnFalse,
			isSymbolicLink: fnFalse,
			isFIFO: fnFalse,
			isSocket: fnFalse,
			atimeMs: new Date().getTime(),
			mtimeMs: new Date().getTime(),
			ctimeMs: new Date().getTime(),
			birthtimeMs: new Date().getTime(),
			atime: new Date(),
			mtime: new Date(),
			ctime: new Date(),
			birthtime: new Date()
		};

		this._createStream = createStream || null;
		this._stream = stream || null;
		this._buffer = buffer || null;
		if (string) {
			this._buffer = Buffer.from(string, "utf8");
		}

		// Tracing:
		this._collections = [];
	}

	/**
	 * Gets a buffer with the resource content.
	 *
	 * @returns {Promise<Buffer>} A Promise resolving with a buffer of the resource content.
	 */
	getBuffer() {
		return new Promise((resolve, reject) => {
			if (this._buffer) {
				resolve(this._buffer);
			} else if (this._createStream || this._stream) {
				resolve(this._getBufferFromStream());
			} else {
				reject(new Error(`Resource ${this._name} has no content`));
			}
		});
	}

	/**
	 * Sets a Buffer as content.
	 *
	 * @param {Buffer} buffer A buffer instance
	 */
	setBuffer(buffer) {
		this._createStream = null;
		// if (this._stream) { // TODO this may cause strange issues
		// 	this._stream.destroy();
		// }
		this._stream = null;
		this._buffer = buffer;
	}

	/**
	 * Gets a string with the resource content.
	 *
	 * @returns {Promise<string>} A Promise resolving with a string of the resource content.
	 */
	getString() {
		return this.getBuffer().then((buffer) => buffer.toString());
	}

	/**
	 * Sets a String as content
	 *
	 * @param {string} string A string
	 */
	setString(string) {
		this.setBuffer(Buffer.from(string, "utf8"));
	}

	/**
	 * Gets a readable stream for the resource content.
	 *
	 * @returns {stream.Readable} A readable stream for the resource content.
	 */
	getStream() {
		if (this._buffer) {
			let bufferStream = new stream.PassThrough();
			bufferStream.end(this._buffer);
			return bufferStream;
		} else if (this._createStream || this._stream) {
			return this._getStream();
		} else {
			throw new Error(`Resource ${this._name} has no content`);
		}
	}

	/**
	 * Sets a readable stream as content.
	 *
	 * @param {stream.Readable} stream readable stream
	 */
	setStream(stream) {
		this._buffer = null;
		this._createStream = null;
		// if (this._stream) { // TODO this may cause strange issues
		// 	this._stream.destroy();
		// }
		this._stream = stream;
	}

	/**
	 * Gets the resources path
	 *
	 * @returns {string} (Virtual) path of the resource
	 */
	getPath() {
		return this._path;
	}

	/**
	 * Sets the resources path
	 *
	 * @param {string} path (Virtual) path of the resource
	 */
	setPath(path) {
		this._path = path;
		this._name = this._getNameFromPath(path);
	}

	/**
	 * Gets the resources stat info.
	 *
	 * @returns {fs.Stats} An object representing an fs.Stats instance
	 */
	getStatInfo() {
		return this._statInfo;
	}

	_getNameFromPath(virPath) {
		return path.posix.basename(virPath);
	}

	/**
	 * Adds a resource collection name that was involved in locating this resource.
	 *
	 * @param {string} name Resource collection name
	 */
	pushCollection(name) {
		this._collections.push(name);
	}

	/**
	 * Returns a clone of the resource.
	 *
	 * @returns {Promise<Resource>} A promise resolving the resource.
	 */
	clone() {
		let options = {
			path: this._path,
			statInfo: clone(this._statInfo)
		};

		const addContentOption = () => {
			if (this._stream) {
				return this._getBufferFromStream().then(function(buffer) {
					options.buffer = buffer;
				});
			} else {
				if (this._createStream) {
					options.createStream = this._createStream;
				} else if (this._buffer) {
					options.buffer = this._buffer;
				}
				return Promise.resolve();
			}
		};

		return addContentOption().then(() => {
			return new Resource(options);
		});
	}

	/**
	 * Tracing: Get tree for printing out trace
	 *
	 * @returns {Object}
	 */
	getPathTree() {
		let tree = {};

		let pointer = tree[this._path] = {};

		for (let i = this._collections.length - 1; i >= 0; i--) {
			pointer = pointer[this._collections[i]] = {};
		}

		return tree;
	}

	/**
	 * Returns the content as stream.
	 *
	 * @private
	 * @returns {function} The stream
	 */
	_getStream() {
		if (this._createStream) {
			return this._createStream();
		}
		return this._stream;
	}

	/**
	 * Converts the buffer into a stream.
	 *
	 * @private
	 * @returns {Promise<Buffer>} Promise resolving with buffer.
	 */
	_getBufferFromStream() {
		return new Promise((resolve, reject) => {
			let contentStream = this._getStream();
			let buffers = [];
			contentStream.on("data", (data) => {
				buffers.push(data);
			});
			contentStream.on("error", (err) => {
				reject(err);
			});
			contentStream.on("end", () => {
				let buffer = Buffer.concat(buffers);
				this.setBuffer(buffer);
				resolve(buffer);
			});
		});
	}
}

module.exports = Resource;

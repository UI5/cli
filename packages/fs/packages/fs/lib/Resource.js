const stream = require("stream");
const clone = require("clone");
const path = require("path");

const fnTrue = () => true;
const fnFalse = () => false;

/**
 * Resource
 *
 * @public
 * @memberof module:@ui5/fs
 */
class Resource {
	/**
	* Function for dynamic creation of content streams
	*
	* @public
	* @callback module:@ui5/fs.Resource~createStream
	* @returns {stream.Readable} A readable stream of a resources content
	*/

	/**
	 * The constructor.
	 *
	 * @public
	 * @param {Object} parameters Parameters
	 * @param {string} parameters.path Virtual path
	 * @param {fs.Stats|Object} [parameters.statInfo] File information. Instance of
	 *					[fs.Stats]{@link https://nodejs.org/api/fs.html#fs_class_fs_stats} or similar object
	 * @param {Buffer} [parameters.buffer] Content of this resources as a Buffer instance
	 *					(cannot be used in conjunction with parameters string, stream or createStream)
	 * @param {string} [parameters.string] Content of this resources as a string
	 *					(cannot be used in conjunction with parameters buffer, stream or createStream)
	 * @param {Stream} [parameters.stream] Readable stream of the content of this resource
	 *					(cannot be used in conjunction with parameters buffer, string or createStream)
	 * @param {module:@ui5/fs.Resource~createStream} [parameters.createStream] Function callback that returns a readable
	 *					stream of the content of this resource (cannot be used in conjunction with parameters buffer,
	 *					string or stream).
	 *					In some cases this is the most memory-efficient way to supply resource content
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
	 * @public
	 * @returns {Promise<Buffer>} Promise resolving with a buffer of the resource content.
	 */
	async getBuffer() {
		if (this._contentDrained) {
			throw new Error(`Content of Resource ${this._path} has been drained. ` +
				"This might be caused by requesting resource content after a content stream has been " +
				"requested and no new content (e.g. a new stream) has been set.");
		}
		if (this._buffer) {
			return this._buffer;
		} else if (this._createStream || this._stream) {
			return this._getBufferFromStream();
		} else {
			throw new Error(`Resource ${this._path} has no content`);
		}
	}

	/**
	 * Sets a Buffer as content.
	 *
	 * @public
	 * @param {Buffer} buffer Buffer instance
	 */
	setBuffer(buffer) {
		this._createStream = null;
		// if (this._stream) { // TODO this may cause strange issues
		// 	this._stream.destroy();
		// }
		this._stream = null;
		this._buffer = buffer;
		this._contentDrained = false;
		this._streamDrained = false;
	}

	/**
	 * Gets a string with the resource content.
	 *
	 * @public
	 * @returns {Promise<string>} Promise resolving with the resource content.
	 */
	getString() {
		if (this._contentDrained) {
			return Promise.reject(new Error(`Content of Resource ${this._path} has been drained. ` +
				"This might be caused by requesting resource content after a content stream has been " +
				"requested and no new content (e.g. a new stream) has been set."));
		}
		return this.getBuffer().then((buffer) => buffer.toString());
	}

	/**
	 * Sets a String as content
	 *
	 * @public
	 * @param {string} string Resource content
	 */
	setString(string) {
		this.setBuffer(Buffer.from(string, "utf8"));
	}

	/**
	 * Gets a readable stream for the resource content.
	 *
	 * Repetitive calls of this function are only possible if new content has been set in the meantime (through
	 * [setStream]{@link module:@ui5/fs.Resource#setStream}, [setBuffer]{@link module:@ui5/fs.Resource#setBuffer}
	 * or [setString]{@link module:@ui5/fs.Resource#setString}). This
	 * is to prevent consumers from accessing drained streams.
	 *
	 * @public
	 * @returns {stream.Readable} Readable stream for the resource content.
	 */
	getStream() {
		if (this._contentDrained) {
			throw new Error(`Content of Resource ${this._path} has been drained. ` +
				"This might be caused by requesting resource content after a content stream has been " +
				"requested and no new content (e.g. a new stream) has been set.");
		}
		let contentStream;
		if (this._buffer) {
			const bufferStream = new stream.PassThrough();
			bufferStream.end(this._buffer);
			contentStream = bufferStream;
		} else if (this._createStream || this._stream) {
			contentStream = this._getStream();
		}
		if (!contentStream) {
			throw new Error(`Resource ${this._path} has no content`);
		}
		// If a stream instance is being returned, it will typically get drained be the consumer.
		// In that case, further content access will result in a "Content stream has been drained" error.
		// However, depending on the execution environment, a resources content stream might have been
		//	transformed into a buffer. In that case further content access is possible as a buffer can't be
		//	drained.
		// To prevent unexpected "Content stream has been drained" errors caused by changing environments, we flag
		//	the resource content as "drained" every time a stream is requested. Even if actually a buffer or
		//	createStream callback is being used.
		this._contentDrained = true;
		return contentStream;
	}

	/**
	 * Sets a readable stream as content.
	 *
	 * @public
	 * @param {stream.Readable|module:@ui5/fs.Resource~createStream} stream Readable stream of the resource content or
	 														callback for dynamic creation of a readable stream
	 */
	setStream(stream) {
		this._buffer = null;
		// if (this._stream) { // TODO this may cause strange issues
		// 	this._stream.destroy();
		// }
		if (typeof stream === "function") {
			this._createStream = stream;
			this._stream = null;
		} else {
			this._stream = stream;
			this._createStream = null;
		}
		this._contentDrained = false;
		this._streamDrained = false;
	}

	/**
	 * Gets the resources path
	 *
	 * @public
	 * @returns {string} (Virtual) path of the resource
	 */
	getPath() {
		return this._path;
	}

	/**
	 * Sets the resources path
	 *
	 * @public
	 * @param {string} path (Virtual) path of the resource
	 */
	setPath(path) {
		this._path = path;
		this._name = this._getNameFromPath(path);
	}

	/**
	 * Gets the resources stat info.
	 *
	 * @public
	 * @returns {fs.Stats|Object} Instance of [fs.Stats]{@link https://nodejs.org/api/fs.html#fs_class_fs_stats}
	 *								or similar object
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
	 * Returns a clone of the resource. The clones content is independent from that of the original resource
	 *
	 * @public
	 * @returns {Promise<module:@ui5/fs.Resource>} Promise resolving with the clone
	 */
	clone() {
		const options = {
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
	 * @returns {Object} Trace tree
	 */
	getPathTree() {
		const tree = {};

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
	 * @returns {stream.Readable} Readable stream
	 */
	_getStream() {
		if (this._streamDrained) {
			throw new Error(`Content stream of Resource ${this._path} is flagged as drained.`);
		}
		if (this._createStream) {
			return this._createStream();
		}
		this._streamDrained = true;
		return this._stream;
	}

	/**
	 * Converts the buffer into a stream.
	 *
	 * @private
	 * @returns {Promise<Buffer>} Promise resolving with buffer.
	 */
	_getBufferFromStream() {
		if (this._buffering) { // Prevent simultaneous buffering, causing unexpected access to drained stream
			return this._buffering;
		}
		return this._buffering = new Promise((resolve, reject) => {
			const contentStream = this._getStream();
			const buffers = [];
			contentStream.on("data", (data) => {
				buffers.push(data);
			});
			contentStream.on("error", (err) => {
				reject(err);
			});
			contentStream.on("end", () => {
				const buffer = Buffer.concat(buffers);
				this.setBuffer(buffer);
				this._buffering = null;
				resolve(buffer);
			});
		});
	}
}

module.exports = Resource;

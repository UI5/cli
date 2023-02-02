import stream from "node:stream";
import clone from "clone";
import posixPath from "node:path/posix";

const fnTrue = () => true;
const fnFalse = () => false;

/**
 * Resource. UI5 Tooling specific representation of a file's content and metadata
 *
 * @public
 * @class
 * @alias @ui5/fs/Resource
 */
class Resource {
	#project;
	#buffer;
	#buffering;
	#collections;
	#contentDrained;
	#createStream;
	#name;
	#path;
	#sourceMetadata;
	#statInfo;
	#stream;
	#streamDrained;
	#isModified;

	/**
	* Function for dynamic creation of content streams
	*
	* @public
	* @callback @ui5/fs/Resource~createStream
	* @returns {stream.Readable} A readable stream of a resources content
	*/

	/**
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.path Absolute virtual path of the resource
	 * @param {fs.Stats|object} [parameters.statInfo] File information. Instance of
	 *					[fs.Stats]{@link https://nodejs.org/api/fs.html#fs_class_fs_stats} or similar object
	 * @param {Buffer} [parameters.buffer] Content of this resources as a Buffer instance
	 *					(cannot be used in conjunction with parameters string, stream or createStream)
	 * @param {string} [parameters.string] Content of this resources as a string
	 *					(cannot be used in conjunction with parameters buffer, stream or createStream)
	 * @param {Stream} [parameters.stream] Readable stream of the content of this resource
	 *					(cannot be used in conjunction with parameters buffer, string or createStream)
	 * @param {@ui5/fs/Resource~createStream} [parameters.createStream] Function callback that returns a readable
	 *					stream of the content of this resource (cannot be used in conjunction with parameters buffer,
	 *					string or stream).
	 *					In some cases this is the most memory-efficient way to supply resource content
	 * @param {@ui5/project/specifications/Project} [parameters.project] Project this resource is associated with
	 * @param {object} [parameters.sourceMetadata] Source metadata for UI5 Tooling internal use.
	 * 	Typically set by an adapter to store information for later retrieval.
	 */
	constructor({path, statInfo, buffer, string, createStream, stream, project, sourceMetadata}) {
		if (!path) {
			throw new Error("Unable to create Resource: Missing parameter 'path'");
		}
		if (buffer && createStream || buffer && string || string && createStream || buffer && stream ||
				string && stream || createStream && stream) {
			throw new Error("Unable to create Resource: Please set only one content parameter. " +
				"'buffer', 'string', 'stream' or 'createStream'");
		}

		this.setPath(path);

		this.#sourceMetadata = sourceMetadata;
		if (this.#sourceMetadata) {
			// This flag indicates whether a resource has changed from its original source.
			// resource.isModified() is not sufficient, since it only reflects the modification state of the
			// current instance.
			// Since the sourceMetadata object is inherited to clones, it is the only correct indicator
			this.#sourceMetadata.contentModified = this.#sourceMetadata.contentModified || false;
		}
		this.#isModified = false;

		this.#project = project;

		this.#statInfo = statInfo || { // TODO
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

		if (createStream) {
			this.#createStream = createStream;
		} else if (stream) {
			this.#stream = stream;
		} else if (buffer) {
			// Use private setter, not to accidentally set any modified flags
			this.#setBuffer(buffer);
		} else if (typeof string === "string" || string instanceof String) {
			// Use private setter, not to accidentally set any modified flags
			this.#setBuffer(Buffer.from(string, "utf8"));
		}

		// Tracing:
		this.#collections = [];
	}

	/**
	 * Gets a buffer with the resource content.
	 *
	 * @public
	 * @returns {Promise<Buffer>} Promise resolving with a buffer of the resource content.
	 */
	async getBuffer() {
		if (this.#contentDrained) {
			throw new Error(`Content of Resource ${this.#path} has been drained. ` +
				"This might be caused by requesting resource content after a content stream has been " +
				"requested and no new content (e.g. a new stream) has been set.");
		}
		if (this.#buffer) {
			return this.#buffer;
		} else if (this.#createStream || this.#stream) {
			return this.#getBufferFromStream();
		} else {
			throw new Error(`Resource ${this.#path} has no content`);
		}
	}

	/**
	 * Sets a Buffer as content.
	 *
	 * @public
	 * @param {Buffer} buffer Buffer instance
	 */
	setBuffer(buffer) {
		if (this.#sourceMetadata) {
			this.#sourceMetadata.contentModified = true;
		}
		this.#isModified = true;
		this.#setBuffer(buffer);
	}

	#setBuffer(buffer) {
		this.#createStream = null;
		// if (this.#stream) { // TODO this may cause strange issues
		// 	this.#stream.destroy();
		// }
		this.#stream = null;
		this.#buffer = buffer;
		this.#contentDrained = false;
		this.#streamDrained = false;
	}

	/**
	 * Gets a string with the resource content.
	 *
	 * @public
	 * @returns {Promise<string>} Promise resolving with the resource content.
	 */
	getString() {
		if (this.#contentDrained) {
			return Promise.reject(new Error(`Content of Resource ${this.#path} has been drained. ` +
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
	 * [setStream]{@link @ui5/fs/Resource#setStream}, [setBuffer]{@link @ui5/fs/Resource#setBuffer}
	 * or [setString]{@link @ui5/fs/Resource#setString}). This
	 * is to prevent consumers from accessing drained streams.
	 *
	 * @public
	 * @returns {stream.Readable} Readable stream for the resource content.
	 */
	getStream() {
		if (this.#contentDrained) {
			throw new Error(`Content of Resource ${this.#path} has been drained. ` +
				"This might be caused by requesting resource content after a content stream has been " +
				"requested and no new content (e.g. a new stream) has been set.");
		}
		let contentStream;
		if (this.#buffer) {
			const bufferStream = new stream.PassThrough();
			bufferStream.end(this.#buffer);
			contentStream = bufferStream;
		} else if (this.#createStream || this.#stream) {
			contentStream = this.#getStream();
		}
		if (!contentStream) {
			throw new Error(`Resource ${this.#path} has no content`);
		}
		// If a stream instance is being returned, it will typically get drained be the consumer.
		// In that case, further content access will result in a "Content stream has been drained" error.
		// However, depending on the execution environment, a resources content stream might have been
		//	transformed into a buffer. In that case further content access is possible as a buffer can't be
		//	drained.
		// To prevent unexpected "Content stream has been drained" errors caused by changing environments, we flag
		//	the resource content as "drained" every time a stream is requested. Even if actually a buffer or
		//	createStream callback is being used.
		this.#contentDrained = true;
		return contentStream;
	}

	/**
	 * Sets a readable stream as content.
	 *
	 * @public
	 * @param {stream.Readable|@ui5/fs/Resource~createStream} stream Readable stream of the resource content or
	 														callback for dynamic creation of a readable stream
	 */
	setStream(stream) {
		this.#isModified = true;
		if (this.#sourceMetadata) {
			this.#sourceMetadata.contentModified = true;
		}

		this.#buffer = null;
		// if (this.#stream) { // TODO this may cause strange issues
		// 	this.#stream.destroy();
		// }
		if (typeof stream === "function") {
			this.#createStream = stream;
			this.#stream = null;
		} else {
			this.#stream = stream;
			this.#createStream = null;
		}
		this.#contentDrained = false;
		this.#streamDrained = false;
	}

	/**
	 * Gets the virtual resources path
	 *
	 * @public
	 * @returns {string} Virtual path of the resource
	 */
	getPath() {
		return this.#path;
	}

	/**
	 * Sets the virtual resources path
	 *
	 * @public
	 * @param {string} path Absolute virtual path of the resource
	 */
	setPath(path) {
		path = posixPath.normalize(path);
		if (!posixPath.isAbsolute(path)) {
			throw new Error(`Unable to set resource path: Path must be absolute: ${path}`);
		}
		this.#path = path;
		this.#name = posixPath.basename(path);
	}

	/**
	 * Gets the resource name
	 *
	 * @public
	 * @returns {string} Name of the resource
	 */
	getName() {
		return this.#name;
	}

	/**
	 * Gets the resources stat info.
	 * Note that a resources stat information is not updated when the resource is being modified.
	 * Also, depending on the used adapter, some fields might be missing which would be present for a
	 * [fs.Stats]{@link https://nodejs.org/api/fs.html#fs_class_fs_stats} instance.
	 *
	 * @public
	 * @returns {fs.Stats|object} Instance of [fs.Stats]{@link https://nodejs.org/api/fs.html#fs_class_fs_stats}
	 *								or similar object
	 */
	getStatInfo() {
		return this.#statInfo;
	}

	/**
	 * Size in bytes allocated by the underlying buffer.
	 *
	 * @see {TypedArray#byteLength}
	 * @returns {Promise<number>} size in bytes, <code>0</code> if there is no content yet
	 */
	async getSize() {
		// if resource does not have any content it should have 0 bytes
		if (!this.#buffer && !this.#createStream && !this.#stream) {
			return 0;
		}
		const buffer = await this.getBuffer();
		return buffer.byteLength;
	}

	/**
	 * Adds a resource collection name that was involved in locating this resource.
	 *
	 * @param {string} name Resource collection name
	 */
	pushCollection(name) {
		this.#collections.push(name);
	}

	/**
	 * Returns a clone of the resource. The clones content is independent from that of the original resource
	 *
	 * @public
	 * @returns {Promise<@ui5/fs/Resource>} Promise resolving with the clone
	 */
	async clone() {
		const options = await this.#getCloneOptions();
		return new Resource(options);
	}

	async #getCloneOptions() {
		const options = {
			path: this.#path,
			statInfo: clone(this.#statInfo),
			sourceMetadata: clone(this.#sourceMetadata)
		};

		if (this.#stream) {
			options.buffer = await this.#getBufferFromStream();
		} else if (this.#createStream) {
			options.createStream = this.#createStream;
		} else if (this.#buffer) {
			options.buffer = this.#buffer;
		}

		return options;
	}

	/**
	 * Retrieve the project assigned to the resource
	 * <br/>
	 * <b>Note for UI5 Tooling extensions (i.e. custom tasks, custom middleware):</b>
	 * In order to ensure compatibility across UI5 Tooling versions, consider using the
	 * <code>getProject(resource)</code> method provided by
	 * [TaskUtil]{@link module:@ui5/project/build/helpers/TaskUtil} and
	 * [MiddlewareUtil]{@link module:@ui5/server.middleware.MiddlewareUtil}, which will
	 * return a Specification Version-compatible Project interface.
	 *
	 * @public
	 * @returns {@ui5/project/specifications/Project} Project this resource is associated with
	 */
	getProject() {
		return this.#project;
	}

	/**
	 * Assign a project to the resource
	 *
	 * @public
	 * @param {@ui5/project/specifications/Project} project Project this resource is associated with
	 */
	setProject(project) {
		if (this.#project) {
			throw new Error(`Unable to assign project ${project.getName()} to resource ${this.#path}: ` +
				`Resource is already associated to project ${this.#project}`);
		}
		this.#project = project;
	}

	/**
	 * Check whether a project has been assigned to the resource
	 *
	 * @public
	 * @returns {boolean} True if the resource is associated with a project
	 */
	hasProject() {
		return !!this.#project;
	}

	/**
	 * Check whether the content of this resource has been changed during its life cycle
	 *
	 * @public
	 * @returns {boolean} True if the resource's content has been changed
	 */
	isModified() {
		return this.#isModified;
	}

	/**
	 * Tracing: Get tree for printing out trace
	 *
	 * @returns {object} Trace tree
	 */
	getPathTree() {
		const tree = Object.create(null);

		let pointer = tree[this.#path] = Object.create(null);

		for (let i = this.#collections.length - 1; i >= 0; i--) {
			pointer = pointer[this.#collections[i]] = Object.create(null);
		}

		return tree;
	}

	/**
	 * Returns source metadata if any where provided during the creation of this resource.
	 * Typically set by an adapter to store information for later retrieval.
	 *
	 * @returns {object|null}
	 */
	getSourceMetadata() {
		return this.#sourceMetadata || null;
	}

	/**
	 * Returns the content as stream.
	 *
	 * @private
	 * @returns {stream.Readable} Readable stream
	 */
	#getStream() {
		if (this.#streamDrained) {
			throw new Error(`Content stream of Resource ${this.#path} is flagged as drained.`);
		}
		if (this.#createStream) {
			return this.#createStream();
		}
		this.#streamDrained = true;
		return this.#stream;
	}

	/**
	 * Converts the buffer into a stream.
	 *
	 * @private
	 * @returns {Promise<Buffer>} Promise resolving with buffer.
	 */
	#getBufferFromStream() {
		if (this.#buffering) { // Prevent simultaneous buffering, causing unexpected access to drained stream
			return this.#buffering;
		}
		return this.#buffering = new Promise((resolve, reject) => {
			const contentStream = this.#getStream();
			const buffers = [];
			contentStream.on("data", (data) => {
				buffers.push(data);
			});
			contentStream.on("error", (err) => {
				reject(err);
			});
			contentStream.on("end", () => {
				const buffer = Buffer.concat(buffers);
				this.#setBuffer(buffer);
				this.#buffering = null;
				resolve(buffer);
			});
		});
	}
}

export default Resource;

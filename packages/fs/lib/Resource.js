import {Readable} from "node:stream";
import {buffer as streamToBuffer} from "node:stream/consumers";
import ssri from "ssri";
import clone from "clone";
import posixPath from "node:path/posix";
import {setTimeout} from "node:timers/promises";
import {withTimeout, Mutex} from "async-mutex";
import {getLogger} from "@ui5/logger";

const log = getLogger("fs:Resource");
let deprecatedGetStreamCalled = false;
let deprecatedGetStatInfoCalled = false;

const ALLOWED_SOURCE_METADATA_KEYS = ["adapter", "fsPath", "contentModified"];

const CONTENT_TYPES = {
	BUFFER: "buffer",
	STREAM: "stream",
	FACTORY: "factory",
	DRAINED_STREAM: "drainedStream",
	IN_TRANSFORMATION: "inTransformation",
};

const SSRI_OPTIONS = {algorithms: ["sha256"]};

/**
 * Resource. UI5 CLI specific representation of a file's content and metadata
 *
 * @public
 * @class
 * @alias @ui5/fs/Resource
 */
class Resource {
	#name;
	#path;
	#project;
	#sourceMetadata;

	/* Resource Content */
	#content;
	#createBufferFactory;
	#createStreamFactory;
	#contentType;

	/* Content Metadata */
	#byteSize;
	#lastModified;
	#statInfo;
	#isDirectory;

	/* States */
	#isModified = false;
	// Mutex to prevent access/modification while content is being transformed. 100 ms timeout
	#contentMutex = withTimeout(new Mutex(), 100, new Error("Timeout waiting for resource content access"));

	// Tracing
	#collections = [];

	/**
	* Factory function to dynamic (and potentially repeated) creation of readable streams of the resource's content
	*
	* @public
	* @callback @ui5/fs/Resource~createStream
	* @returns {stream.Readable} A readable stream of the resource's content
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
	 * @param {@ui5/fs/Resource~createBuffer} [parameters.createBuffer] Function callback that returns a promise
	 * 					resolving with a Buffer of the content of this resource (cannot be used in conjunction with
	 * 					parameters buffer, string or stream). Must be used in conjunction with parameters createStream.
	 * @param {@ui5/fs/Resource~createStream} [parameters.createStream] Function callback that returns a readable
	 *					stream of the content of this resource (cannot be used in conjunction with parameters buffer,
	 *					string or stream).
	 *					In some cases this is the most memory-efficient way to supply resource content
	 * @param {@ui5/project/specifications/Project} [parameters.project] Project this resource is associated with
	 * @param {object} [parameters.sourceMetadata] Source metadata for UI5 CLI internal use.
	 * 	Some information may be set by an adapter to store information for later retrieval. Also keeps track of whether
	 *  a resource content has been modified since it has been read from a source
	 * @param {boolean} [parameters.isDirectory] Flag whether the resource represents a directory
	 * @param {number} [parameters.byteSize] Size of the resource content in bytes
	 * @param {number} [parameters.lastModified] Last modified timestamp (in milliseconds since UNIX epoch)
	 */
	constructor({
		path, statInfo, buffer, createBuffer, string, createStream, stream, project, sourceMetadata,
		isDirectory, byteSize, lastModified,
	}) {
		if (!path) {
			throw new Error("Unable to create Resource: Missing parameter 'path'");
		}
		if (createBuffer && !createStream) {
			// If createBuffer is provided, createStream must be provided as well
			throw new Error("Unable to create Resource: Parameter 'createStream' must be provided when " +
				"parameter 'createBuffer' is used");
		}
		if (buffer && createStream || buffer && string || string && createStream || buffer && stream ||
				string && stream || createStream && stream) {
			throw new Error("Unable to create Resource: Multiple content parameters provided. " +
				"Please provide only one of the following parameters: " +
				"'buffer', 'string', 'stream' or 'createStream'");
		}

		if (sourceMetadata) {
			if (typeof sourceMetadata !== "object") {
				throw new Error(`Unable to create Resource: Parameter 'sourceMetadata' must be of type "object"`);
			}

			/* eslint-disable-next-line guard-for-in */
			for (const metadataKey in sourceMetadata) { // Also check prototype
				if (!ALLOWED_SOURCE_METADATA_KEYS.includes(metadataKey)) {
					throw new Error(`Parameter 'sourceMetadata' contains an illegal attribute: ${metadataKey}`);
				}
				if (!["string", "boolean"].includes(typeof sourceMetadata[metadataKey])) {
					throw new Error(
						`Attribute '${metadataKey}' of parameter 'sourceMetadata' ` +
						`must be of type "string" or "boolean"`);
				}
			}
		}

		this.setPath(path);

		this.#sourceMetadata = sourceMetadata || {};

		// This flag indicates whether a resource has changed from its original source.
		// resource.isModified() is not sufficient, since it only reflects the modification state of the
		// current instance.
		// Since the sourceMetadata object is inherited to clones, it is the only correct indicator
		this.#sourceMetadata.contentModified ??= false;

		this.#project = project;

		if (createStream) {
			// We store both factories individually
			// This allows to create either a stream or a buffer on demand
			// Note that it's possible and acceptable if only one factory is provided
			if (createBuffer) {
				if (typeof createBuffer !== "function") {
					throw new Error("Unable to create Resource: Parameter 'createBuffer' must be a function");
				}
				this.#createBufferFactory = createBuffer;
			}
			// createStream is always provided if a factory is used
			if (typeof createStream !== "function") {
				throw new Error("Unable to create Resource: Parameter 'createStream' must be a function");
			}
			this.#createStreamFactory = createStream;
			this.#contentType = CONTENT_TYPES.FACTORY;
		} if (stream) {
			if (typeof stream !== "object" || typeof stream.pipe !== "function") {
				throw new Error("Unable to create Resource: Parameter 'stream' must be a readable stream");
			}
			this.#content = stream;
			this.#contentType = CONTENT_TYPES.STREAM;
		} else if (buffer) {
			if (!Buffer.isBuffer(buffer)) {
				throw new Error("Unable to create Resource: Parameter 'buffer' must be of type Buffer");
			}
			this.#content = buffer;
			this.#contentType = CONTENT_TYPES.BUFFER;
		} else if (string !== undefined) {
			if (typeof string !== "string" && !(string instanceof String)) {
				throw new Error("Unable to create Resource: Parameter 'string' must be of type string");
			}
			this.#content = Buffer.from(string, "utf8"); // Assuming utf8 encoding
			this.#contentType = CONTENT_TYPES.BUFFER;
		}

		if (isDirectory !== undefined) {
			this.#isDirectory = !!isDirectory;
		}
		if (byteSize !== undefined) {
			if (typeof byteSize !== "number" || byteSize < 0) {
				throw new Error("Unable to create Resource: Parameter 'byteSize' must be a positive number");
			}
			this.#byteSize = byteSize;
		}
		if (lastModified !== undefined) {
			if (typeof lastModified !== "number" || lastModified < 0) {
				throw new Error("Unable to create Resource: Parameter 'lastModified' must be a positive number");
			}
			this.#lastModified = lastModified;
		}

		if (statInfo) {
			this.#isDirectory ??= statInfo.isDirectory();
			if (!this.#isDirectory && statInfo.isFile && !statInfo.isFile()) {
				throw new Error("Unable to create Resource: statInfo must represent either a file or a directory");
			}
			this.#byteSize ??= statInfo.size;
			this.#lastModified ??= statInfo.mtimeMs;

			// Create legacy statInfo object
			this.#statInfo = parseStat(statInfo);
		} else {
			// if (this.#byteSize === undefined && this.#contentType) {
			// 	if (this.#contentType !== CONTENT_TYPES.BUFFER) {
			// 		throw new Error("Unable to create Resource: byteSize or statInfo must be provided when resource " +
			// 			"content is stream- or factory-based");
			// 	}
			// 	this.#byteSize ??= this.#content.byteLength;
			// }

			// Create legacy statInfo object
			this.#statInfo = createStat(this.#byteSize, this.#isDirectory, this.#lastModified);
		}
	}

	/**
	 * Gets a buffer with the resource content.
	 *
	 * @public
	 * @returns {Promise<Buffer>} Promise resolving with a buffer of the resource content.
	 */
	async getBuffer() {
		// First wait for new content if the current content is flagged as drained
		if (this.#contentType === CONTENT_TYPES.DRAINED_STREAM) {
			await this.#waitForNewContent();
		}

		// Then make sure no other operation is currently modifying the content (such as a concurrent getBuffer call
		// that might be transforming the content right now)
		if (this.#contentMutex.isLocked()) {
			await this.#contentMutex.waitForUnlock();
		}

		switch (this.#contentType) {
		case CONTENT_TYPES.FACTORY:
			if (this.#createBufferFactory) {
				// Prefer buffer factory if available
				return await this.#getBufferFromFactory(this.#createBufferFactory);
			}
			// Fallback to stream factory
			return this.#getBufferFromStream(this.#createStreamFactory());
		case CONTENT_TYPES.STREAM:
			return this.#getBufferFromStream(this.#content);
		case CONTENT_TYPES.BUFFER:
			return this.#content;
		case CONTENT_TYPES.DRAINED_STREAM:
			// waitForNewContent call above should prevent this from ever happening
			throw new Error(`Unexpected error: Content of Resource ${this.#path} is flagged as drained.`);
		case CONTENT_TYPES.IN_TRANSFORMATION:
			// contentMutex.waitForUnlock call above should prevent this from ever happening
			throw new Error(`Unexpected error: Content of Resource ${this.#path} is currently being transformed`);
		default:
			throw new Error(`Resource ${this.#path} has no content`);
		}
	}

	async #getBufferFromFactory(factoryFn) {
		const release = await this.#contentMutex.acquire();
		try {
			this.#contentType = CONTENT_TYPES.IN_TRANSFORMATION;
			const buffer = await factoryFn();
			if (!Buffer.isBuffer(buffer)) {
				throw new Error(`Buffer factory of Resource ${this.#path} did not return a Buffer instance`);
			}
			this.#content = buffer;
			this.#contentType = CONTENT_TYPES.BUFFER;
			return buffer;
		} finally {
			release();
		}
	}

	/**
	 * Sets a Buffer as content.
	 *
	 * @public
	 * @param {Buffer} buffer Buffer instance
	 */
	setBuffer(buffer) {
		if (this.#contentMutex.isLocked()) {
			throw new Error(`Unable to set buffer: Content of Resource ${this.#path} is currently being transformed`);
		}
		this.#content = buffer;
		this.#contentType = CONTENT_TYPES.BUFFER;
		this.#contendModified();
	}

	/**
	 * Gets a string with the resource content.
	 *
	 * @public
	 * @returns {Promise<string>} Promise resolving with the resource content.
	 */
	async getString() {
		const buff = await this.getBuffer();
		return buff.toString("utf8");
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
	 * or [setString]{@link @ui5/fs/Resource#setString}).
	 * This is to prevent subsequent consumers from accessing drained streams.
	 *
	 * This method is deprecated. Please use the asynchronous version
	 * [getStreamAsync]{@link @ui5/fs/Resource#getStreamAsync} instead.
	 *
	 * For atomic operations, consider using [modifyStream]{@link @ui5/fs/Resource#modifyStream}.
	 *
	 * @public
	 * @deprecated Use asynchronous Resource.getStreamAsync() instead
	 * @returns {stream.Readable} Readable stream for the resource content.
	 */
	getStream() {
		if (!deprecatedGetStreamCalled) {
			log.verbose(`[DEPRECATION] Synchronous Resource.getStream() is deprecated and will be removed ` +
				`in future versions. Please use asynchronous Resource.getStreamAsync() instead.`);
			deprecatedGetStreamCalled = true;
		}

		// First check for drained content
		if (this.#contentType === CONTENT_TYPES.DRAINED_STREAM) {
			throw new Error(`Content of Resource ${this.#path} is currently flagged as drained. ` +
				`Consider using Resource.getStreamAsync() to wait for new content.`);
		}

		// Make sure no other operation is currently modifying the content
		if (this.#contentMutex.isLocked()) {
			throw new Error(`Content of Resource ${this.#path} is currently being transformed. ` +
				`Consider using Resource.getStreamAsync() to wait for the transformation to finish.`);
		}

		return this.#getStream();
	}

	/**
	 * Gets a readable stream for the resource content.
	 *
	 * Repetitive calls of this function are only possible if new content has been set in the meantime (through
	 * [setStream]{@link @ui5/fs/Resource#setStream}, [setBuffer]{@link @ui5/fs/Resource#setBuffer}
	 * or [setString]{@link @ui5/fs/Resource#setString}).
	 * This is to prevent subsequent consumers from accessing drained streams.
	 *
	 * For atomic operations, consider using [modifyStream]{@link @ui5/fs/Resource#modifyStream}.
	 *
	 * @public
	 * @returns {Promise<stream.Readable>} Promise resolving with a readable stream for the resource content.
	 */
	async getStreamAsync() {
		// First wait for new content if the current content is flagged as drained
		if (this.#contentType === CONTENT_TYPES.DRAINED_STREAM) {
			await this.#waitForNewContent();
		}

		// Then make sure no other operation is currently modifying the content
		if (this.#contentMutex.isLocked()) {
			await this.#contentMutex.waitForUnlock();
		}

		return this.#getStream();
	}

	/**
	 * Modifies the resource content by applying the given callback function.
	 * The callback function receives a readable stream of the current content
	 * and must return either a Buffer or a readable stream with the new content.
	 * The resource content is locked during the modification to prevent concurrent access.
	 *
	 * @param {function(stream.Readable): (Buffer|stream.Readable|Promise<Buffer|stream.Readable>)} callback
	 */
	async modifyStream(callback) {
		// First wait for new content if the current content is flagged as drained
		if (this.#contentType === CONTENT_TYPES.DRAINED_STREAM) {
			await this.#waitForNewContent();
		}
		// Then make sure no other operation is currently modifying the content and then lock it
		const release = await this.#contentMutex.acquire();
		const newContent = await callback(this.#getStream());

		// New content is either buffer or stream
		if (Buffer.isBuffer(newContent)) {
			this.#content = newContent;
			this.#contentType = CONTENT_TYPES.BUFFER;
		} else if (typeof newContent === "object" && typeof newContent.pipe === "function") {
			this.#content = newContent;
			this.#contentType = CONTENT_TYPES.STREAM;
		} else {
			throw new Error("Unable to set new content: Content must be either a Buffer or a Readable Stream");
		}
		this.#contendModified();
		release();
	}

	/**
	 * Returns the content as stream.
	 *
	 * @private
	 * @returns {stream.Readable} Readable stream
	 */
	#getStream() {
		let stream;
		switch (this.#contentType) {
		case CONTENT_TYPES.BUFFER:
			stream = Readable.from(this.#content);
			break;
		case CONTENT_TYPES.FACTORY:
			// Prefer stream factory (which must always be set if content type is FACTORY)
			stream = this.#createStreamFactory();
			break;
		case CONTENT_TYPES.STREAM:
			stream = this.#content;
			break;
		case CONTENT_TYPES.DRAINED_STREAM:
			// This case is unexpected as callers should already handle this content type (by waiting for it to change)
			throw new Error(`Unexpected error: Content of Resource ${this.#path} is flagged as drained.`);
		case CONTENT_TYPES.IN_TRANSFORMATION:
			// This case is unexpected as callers should already handle this content type (by waiting for it to change)
			throw new Error(`Unexpected error: Content of Resource ${this.#path} is currently being transformed`);
		default:
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
		this.#contentType = CONTENT_TYPES.DRAINED_STREAM;
		return stream;
	}

	/**
	 * Converts the buffer into a stream.
	 *
	 * @private
	 * @param {stream.Readable} stream Readable stream
	 * @returns {Promise<Buffer>} Promise resolving with buffer.
	 */
	async #getBufferFromStream(stream) {
		const release = await this.#contentMutex.acquire();
		try {
			this.#contentType = CONTENT_TYPES.IN_TRANSFORMATION;
			if (this.hasSize()) {
				// If size is known. preallocate buffer for improved performance
				try {
					const size = await this.getSize();
					const buffer = Buffer.allocUnsafe(size);
					let offset = 0;
					for await (const chunk of stream) {
						const len = chunk.length;
						if (offset + len > size) {
							throw new Error(`Stream exceeded expected size: ${size}, got at least ${offset + len}`);
						}
						chunk.copy(buffer, offset);
						offset += len;
					}
					if (offset !== size) {
						throw new Error(`Stream ended early: expected ${size} bytes, got ${offset}`);
					}
					this.#content = buffer;
				} catch (err) {
					// Ensure the stream is cleaned up on error
					if (!stream.destroyed) {
						stream.destroy(err);
					}
					throw err;
				}
			} else {
				// Is size is unknown, simply use utility consumer from Node.js webstreams
				// See https://nodejs.org/api/webstreams.html#utility-consumers
				this.#content = await streamToBuffer(stream);
			}
			this.#contentType = CONTENT_TYPES.BUFFER;
		} finally {
			release();
		}
		return this.#content;
	}

	/**
	 * Sets a readable stream as content.
	 *
	 * @public
	 * @param {stream.Readable|@ui5/fs/Resource~createStream} stream Readable stream of the resource content or
	 														callback for dynamic creation of a readable stream
	 */
	setStream(stream) {
		if (this.#contentMutex.isLocked()) {
			throw new Error(`Unable to set stream: Content of Resource ${this.#path} is currently being transformed`);
		}
		if (typeof stream === "function") {
			this.#content = undefined;
			this.#createStreamFactory = stream;
			this.#contentType = CONTENT_TYPES.FACTORY;
		} else {
			this.#content = stream;
			this.#contentType = CONTENT_TYPES.STREAM;
		}
		this.#contendModified();
	}

	async getHash() {
		if (this.isDirectory()) {
			throw new Error(`Unable to calculate hash for directory resource: ${this.#path}`);
		}

		// First wait for new content if the current content is flagged as drained
		if (this.#contentType === CONTENT_TYPES.DRAINED_STREAM) {
			await this.#waitForNewContent();
		}

		// Then make sure no other operation is currently modifying the content
		if (this.#contentMutex.isLocked()) {
			await this.#contentMutex.waitForUnlock();
		}

		switch (this.#contentType) {
		case CONTENT_TYPES.BUFFER:
			return ssri.fromData(this.#content, SSRI_OPTIONS).toString();
		case CONTENT_TYPES.FACTORY:
			return (await ssri.fromStream(this.#createStreamFactory(), SSRI_OPTIONS)).toString();
		case CONTENT_TYPES.STREAM:
			// To be discussed: Should we read the stream into a buffer here (using #getBufferFromStream) to avoid
			// draining it?
			return (await ssri.fromStream(this.#getStream(), SSRI_OPTIONS)).toString();
		case CONTENT_TYPES.DRAINED_STREAM:
			throw new Error(`Unexpected error: Content of Resource ${this.#path} is flagged as drained.`);
		case CONTENT_TYPES.IN_TRANSFORMATION:
			throw new Error(`Unexpected error: Content of Resource ${this.#path} is currently being transformed`);
		default:
			throw new Error(`Resource ${this.#path} has no content`);
		}
	}

	#contendModified() {
		this.#sourceMetadata.contentModified = true;
		this.#isModified = true;

		this.#byteSize = undefined;
		this.#lastModified = new Date().getTime(); // TODO: Always update or keep initial value (= fs stat)?

		if (this.#contentType === CONTENT_TYPES.BUFFER) {
			this.#byteSize = this.#content.byteLength;
			this.#updateStatInfo(this.#byteSize);
		} else {
			this.#byteSize = undefined;
			// Stat-info can't be updated based on streams or factory functions
		}
	}

	/**
	 * In case the resource content is flagged as drained stream, wait for new content to be set.
	 * Either resolves once the content type is no longer DRAINED_STREAM, or rejects with a timeout error.
	 */
	async #waitForNewContent() {
		if (this.#contentType !== CONTENT_TYPES.DRAINED_STREAM) {
			return;
		}
		// Stream might currently be processed by another consumer. Try again after a short wait, hoping the
		// other consumer has processing it and has set new content
		let timeoutCounter = 0;
		log.verbose(`Content of Resource ${this.#path} is flagged as drained, waiting for new content...`);
		while (this.#contentType === CONTENT_TYPES.DRAINED_STREAM) {
			timeoutCounter++;
			await setTimeout(1);
			if (timeoutCounter > 100) { // 100 ms timeout
				throw new Error(`Timeout waiting for content of Resource ${this.#path} to become available.`);
			}
		}
		// New content is now available
	}

	#updateStatInfo(byteSize) {
		const now = new Date();
		this.#statInfo.mtimeMs = now.getTime();
		this.#statInfo.mtime = now;
		this.#statInfo.size = byteSize;
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
	 * Gets the virtual resources path
	 *
	 * @public
	 * @returns {string} (Virtual) path of the resource
	 */
	getOriginalPath() {
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
	 * @deprecated Use dedicated APIs like Resource.getSize(), .isDirectory(), .getLastModified() instead
	 * @returns {fs.Stats|object} Instance of [fs.Stats]{@link https://nodejs.org/api/fs.html#fs_class_fs_stats}
	 *								or similar object
	 */
	getStatInfo() {
		if (!deprecatedGetStatInfoCalled) {
			log.verbose(`[DEPRECATION] Resource.getStatInfo() is deprecated and will be removed in future versions. ` +
				`Please switch to dedicated APIs like Resource.getSize() instead.`);
			deprecatedGetStatInfoCalled = true;
		}
		return this.#statInfo;
	}

	/**
	 * Checks whether the resource represents a directory.
	 *
	 * @public
	 * @returns {boolean} True if resource is a directory
	 */
	isDirectory() {
		return this.#isDirectory;
	}

	/**
	 * Gets the last modified timestamp of the resource.
	 *
	 * @public
	 * @returns {number} Last modified timestamp (in milliseconds since UNIX epoch)
	 */
	getLastModified() {
		return this.#lastModified;
	}

	/**
	 * Resource content size in bytes.
	 *
	 * @public
	 * @see {TypedArray#byteLength}
	 * @returns {Promise<number>} size in bytes, <code>0</code> if the resource has no content
	 */
	async getSize() {
		if (this.#byteSize !== undefined) {
			return this.#byteSize;
		}
		if (this.#contentType === undefined) {
			return 0;
		}
		const buffer = await this.getBuffer();
		this.#byteSize = buffer.byteLength;
		return this.#byteSize;
	}

	/**
	 * Checks whether the resource size can be determined without reading the entire content.
	 * E.g. for buffer-based content or if the size has been provided when the resource was created.
	 *
	 * @public
	 * @returns {boolean} True if size can be determined statically
	 */
	hasSize() {
		return (
			this.#contentType === undefined || // No content => size is 0
			this.#byteSize !== undefined || // Size has been determined already
			this.#contentType === CONTENT_TYPES.BUFFER // Buffer content => size can be determined
		);
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
		// First wait for new content if the current content is flagged as drained
		if (this.#contentType === CONTENT_TYPES.DRAINED_STREAM) {
			await this.#waitForNewContent();
		}

		// Then make sure no other operation is currently modifying the content
		if (this.#contentMutex.isLocked()) {
			await this.#contentMutex.waitForUnlock();
		}

		const options = {
			path: this.#path,
			statInfo: this.#statInfo, // Will be cloned in constructor
			isDirectory: this.#isDirectory,
			byteSize: this.#byteSize,
			lastModified: this.#lastModified,
			sourceMetadata: clone(this.#sourceMetadata)
		};

		switch (this.#contentType) {
		case CONTENT_TYPES.STREAM:
			// When cloning resource we have to read the stream into memory
			options.buffer = await this.#getBufferFromStream(this.#content);
			break;
		case CONTENT_TYPES.BUFFER:
			options.buffer = this.#content;
			break;
		case CONTENT_TYPES.FACTORY:
			if (this.#createBufferFactory) {
				options.createBuffer = this.#createBufferFactory;
			}
			options.createStream = this.#createStreamFactory;
			break;
		}
		return options;
	}

	/**
	 * Retrieve the project assigned to the resource
	 * <br/>
	 * <b>Note for UI5 CLI extensions (i.e. custom tasks, custom middleware):</b>
	 * In order to ensure compatibility across UI5 CLI versions, consider using the
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
	 * Returns source metadata which may contain information specific to the adapter that created the resource
	 * Typically set by an adapter to store information for later retrieval.
	 *
	 * @returns {object}
	 */
	getSourceMetadata() {
		return this.#sourceMetadata;
	}
}

const fnTrue = function() {
	return true;
};
const fnFalse = function() {
	return false;
};

/**
 * Parses a Node.js stat object to a UI5 Tooling stat object
 *
 * @param {fs.Stats} statInfo Node.js stat
 * @returns {object} UI5 Tooling stat
*/
function parseStat(statInfo) {
	return {
		isFile: statInfo.isFile?.bind(statInfo),
		isDirectory: statInfo.isDirectory?.bind(statInfo),
		isBlockDevice: statInfo.isBlockDevice?.bind(statInfo),
		isCharacterDevice: statInfo.isCharacterDevice?.bind(statInfo),
		isSymbolicLink: statInfo.isSymbolicLink?.bind(statInfo),
		isFIFO: statInfo.isFIFO?.bind(statInfo),
		isSocket: statInfo.isSocket?.bind(statInfo),
		ino: statInfo.ino,
		size: statInfo.size,
		atimeMs: statInfo.atimeMs,
		mtimeMs: statInfo.mtimeMs,
		ctimeMs: statInfo.ctimeMs,
		birthtimeMs: statInfo.birthtimeMs,
		atime: statInfo.atime,
		mtime: statInfo.mtime,
		ctime: statInfo.ctime,
		birthtime: statInfo.birthtime,
	};
}

function createStat(size, isDirectory = false, lastModified) {
	const now = new Date();
	const mtime = lastModified === undefined ? now : new Date(lastModified);
	return {
		isFile: isDirectory ? fnFalse : fnTrue,
		isDirectory: isDirectory ? fnTrue : fnFalse,
		isBlockDevice: fnFalse,
		isCharacterDevice: fnFalse,
		isSymbolicLink: fnFalse,
		isFIFO: fnFalse,
		isSocket: fnFalse,
		ino: 0,
		size, // Might be undefined
		atimeMs: now.getTime(),
		mtimeMs: mtime.getTime(),
		ctimeMs: now.getTime(),
		birthtimeMs: now.getTime(),
		atime: now,
		mtime,
		ctime: now,
		birthtime: now,
	};
}

export default Resource;

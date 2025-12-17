import posixPath from "node:path/posix";

/**
 * A {@link @ui5/fs/Resource Resource} with a different path than it's original
 *
 * @public
 * @class
 * @alias @ui5/fs/ResourceFacade
 */
class ResourceFacade {
	#path;
	#name;
	#resource;

	/**
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.path Virtual path of the facade resource
	 * @param {@ui5/fs/Resource} parameters.resource Resource to conceal
	 */
	constructor({path, resource}) {
		if (!path) {
			throw new Error("Unable to create ResourceFacade: Missing parameter 'path'");
		}
		if (!resource) {
			throw new Error("Unable to create ResourceFacade: Missing parameter 'resource'");
		}
		path = posixPath.normalize(path);
		if (!posixPath.isAbsolute(path)) {
			throw new Error(`Unable to create ResourceFacade: Parameter 'path' must be absolute: ${path}`);
		}
		this.#path = path;
		this.#name = posixPath.basename(path);
		this.#resource = resource;
	}

	/**
	 * Gets the resources path
	 *
	 * @public
	 * @returns {string} (Virtual) path of the resource
	 */
	getPath() {
		return this.#path;
	}

	/**
	 * Gets the path original resource's path
	 *
	 * @public
	 * @returns {string} (Virtual) path of the resource
	 */
	getOriginalPath() {
		return this.#resource.getPath();
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
	 * Sets the resources path
	 *
	 * @public
	 * @param {string} path (Virtual) path of the resource
	 */
	setPath(path) {
		throw new Error(`The path of a ResourceFacade can't be changed`);
	}

	/**
	 * Returns a clone of the resource. The clones content is independent from that of the original resource.
	 * A ResourceFacade becomes a Resource
	 *
	 * @public
	 * @returns {Promise<@ui5/fs/Resource>} Promise resolving with the clone
	 */
	async clone() {
		// Cloning resolves the facade
		const resourceClone = await this.#resource.clone();
		resourceClone.setPath(this.getPath());
		return resourceClone;
	}

	/**
	 * ======================================================================
	 * Call through functions to original resource
	 * ======================================================================
	 */
	/**
	 * Gets a buffer with the resource content.
	 *
	 * @public
	 * @returns {Promise<Buffer>} Promise resolving with a buffer of the resource content.
	 */
	async getBuffer() {
		return this.#resource.getBuffer();
	}

	/**
	 * Sets a Buffer as content.
	 *
	 * @public
	 * @param {Buffer} buffer Buffer instance
	 */
	setBuffer(buffer) {
		return this.#resource.setBuffer(buffer);
	}

	/**
	 * Gets a string with the resource content.
	 *
	 * @public
	 * @returns {Promise<string>} Promise resolving with the resource content.
	 */
	getString() {
		return this.#resource.getString();
	}

	/**
	 * Sets a String as content
	 *
	 * @public
	 * @param {string} string Resource content
	 */
	setString(string) {
		return this.#resource.setString(string);
	}

	/**
	 * Gets a readable stream for the resource content.
	 *
	 * Repetitive calls of this function are only possible if new content has been set in the meantime (through
	 * [setStream]{@link @ui5/fs/Resource#setStream}, [setBuffer]{@link @ui5/fs/Resource#setBuffer}
	 * or [setString]{@link @ui5/fs/Resource#setString}).
	 * This is to prevent subsequent consumers from accessing drained streams.
	 *
	 * @public
	 * @deprecated Use asynchronous Resource.getStreamAsync() instead
	 * @returns {stream.Readable} Readable stream for the resource content.
	 */
	getStream() {
		return this.#resource.getStream();
	}

	/**
	 * Gets a readable stream for the resource content.
	 *
	 * Repetitive calls of this function are only possible if new content has been set in the meantime (through
	 * [setStream]{@link @ui5/fs/Resource#setStream}, [setBuffer]{@link @ui5/fs/Resource#setBuffer}
	 * or [setString]{@link @ui5/fs/Resource#setString}).
	 * This is to prevent subsequent consumers from accessing drained streams.
	 *
	 * For atomic operations, please use [modifyStream]{@link @ui5/fs/Resource#modifyStream}
	 *
	 * @public
	 * @returns {Promise<stream.Readable>} Promise resolving with a readable stream for the resource content.
	 */
	async getStreamAsync() {
		return this.#resource.getStreamAsync();
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
		return this.#resource.modifyStream(callback);
	}

	/**
	 * Sets a readable stream as content.
	 *
	 * @public
	 * @param {stream.Readable|@ui5/fs/Resource~createStream} stream Readable stream of the resource content or
															callback for dynamic creation of a readable stream
	 */
	setStream(stream) {
		return this.#resource.setStream(stream);
	}

	getIntegrity() {
		return this.#resource.getIntegrity();
	}

	getInode() {
		return this.#resource.getInode();
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
		return this.#resource.getStatInfo();
	}

	/**
	 * Checks whether the resource represents a directory.
	 *
	 * @public
	 * @returns {boolean} True if resource is a directory
	 */
	isDirectory() {
		return this.#resource.isDirectory();
	}

	/**
	 * Gets the last modified timestamp of the resource.
	 *
	 * @public
	 * @returns {number} Last modified timestamp (in milliseconds since UNIX epoch)
	 */
	getLastModified() {
		return this.#resource.getLastModified();
	}

	/**
	 * Size in bytes allocated by the underlying buffer.
	 *
	 * @see {TypedArray#byteLength}
	 * @returns {Promise<number>} size in bytes, <code>0</code> if the resource has no content
	 */
	async getSize() {
		return this.#resource.getSize();
	}

	/**
	 * Checks whether the resource size can be determined without reading the entire content.
	 * E.g. for buffer-based content or if the size has been provided when the resource was created.
	 *
	 * @public
	 * @returns {boolean} True if size can be determined statically
	 */
	hasSize() {
		return this.#resource.hasSize();
	}

	/**
	 * Adds a resource collection name that was involved in locating this resource.
	 *
	 * @param {string} name Resource collection name
	 */
	pushCollection(name) {
		return this.#resource.pushCollection(name);
	}

	/**
	 * Tracing: Get tree for printing out trace
	 *
	 * @returns {object} Trace tree
	 */
	getPathTree() {
		return this.#resource.getPathTree();
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
		return this.#resource.getProject();
	}

	/**
	 * Assign a project to the resource
	 *
	 * @public
	 * @param {@ui5/project/specifications/Project} project Project this resource is associated with
	 */
	setProject(project) {
		return this.#resource.setProject(project);
	}

	/**
	 * Check whether a project has been assigned to the resource
	 *
	 * @public
	 * @returns {boolean} True if the resource is associated with a project
	 */
	hasProject() {
		return this.#resource.hasProject();
	}
	/**
	 * Check whether the content of this resource has been changed during its life cycle
	 *
	 * @public
	 * @returns {boolean} True if the resource's content has been changed
	 */
	isModified() {
		return this.#resource.isModified();
	}

	/**
	 * Returns source metadata if any where provided during the creation of this resource.
	 * Typically set by an adapter to store information for later retrieval.
	 *
	 * @returns {object|null}
	 */
	getSourceMetadata() {
		return this.#resource.getSourceMetadata();
	}


	/**
	 * Returns the resource concealed by this facade
	 *
	 * @returns {@ui5/fs/Resource}
	 */
	getConcealedResource() {
		return this.#resource;
	}
}

export default ResourceFacade;

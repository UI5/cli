/**
 * A [Resource]{@ui5/project.Resource} with a different path than it's original
 *
 * @public
 * @class
 * @alias @ui5/fs/ResourceFacade
 */
class ResourceFacade {
	/**
	 * The constructor.
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.path Virtual path
	 * @param {@ui5/fs/Resource} parameters.resource Resource to cover
	 */
	constructor({path, resource}) {
		if (!path) {
			throw new Error("Cannot create ResourceFacade: path parameter missing");
		}
		if (!resource) {
			throw new Error("Cannot create ResourceFacade: resource parameter missing");
		}
		this._path = path;
		this._resource = resource;
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
		const resourceClone = await this._resource.clone();
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
		return this._resource.getBuffer();
	}

	/**
	 * Sets a Buffer as content.
	 *
	 * @public
	 * @param {Buffer} buffer Buffer instance
	 */
	setBuffer(buffer) {
		return this._resource.setBuffer(buffer);
	}

	/**
	 * Gets a string with the resource content.
	 *
	 * @public
	 * @returns {Promise<string>} Promise resolving with the resource content.
	 */
	getString() {
		return this._resource.getString();
	}

	/**
	 * Sets a String as content
	 *
	 * @public
	 * @param {string} string Resource content
	 */
	setString(string) {
		return this._resource.setString(string);
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
		return this._resource.getStream();
	}

	/**
	 * Sets a readable stream as content.
	 *
	 * @public
	 * @param {stream.Readable|@ui5/fs/Resource~createStream} stream Readable stream of the resource content or
															callback for dynamic creation of a readable stream
	 */
	setStream(stream) {
		return this._resource.setStream(stream);
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
		return this._resource.getStatInfo();
	}

	/**
	 * Size in bytes allocated by the underlying buffer.
	 *
	 * @see {TypedArray#byteLength}
	 * @returns {Promise<number>} size in bytes, <code>0</code> if there is no content yet
	 */
	async getSize() {
		return this._resource.getSize();
	}

	/**
	 * Adds a resource collection name that was involved in locating this resource.
	 *
	 * @param {string} name Resource collection name
	 */
	pushCollection(name) {
		return this._resource.pushCollection(name);
	}

	/**
	 * Tracing: Get tree for printing out trace
	 *
	 * @returns {object} Trace tree
	 */
	getPathTree() {
		return this._resource.getPathTree();
	}

	/**
	 * Retrieve the project assigned to the resource
	 *
	 * @public
	 * @returns {@ui5/project/specifications/Project} Project this resource is associated with
	 */
	getProject() {
		return this._resource.getProject();
	}

	/**
	 * Assign a project to the resource
	 *
	 * @public
	 * @param {@ui5/project/specifications/Project} project Project this resource is associated with
	 */
	setProject(project) {
		return this._resource.setProject(project);
	}

	/**
	 * Check whether a project has been assigned to the resource
	 *
	 * @public
	 * @returns {boolean} True if the resource is associated with a project
	 */
	hasProject() {
		return this._resource.hasProject();
	}

	getConcealedResource() {
		return this._resource;
	}

	getSource() {
		return this._resource.getSource();
	}
}

export default ResourceFacade;

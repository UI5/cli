/**
 * Convenience functions for UI5 Builder tasks.
 * An instance of this class is passed to every standard UI5 Builder task.
 * Custom tasks that define a specification version >= 2.2 will also receive an instance
 * of this class when called.
 *
 * The set of functions that can be accessed by a custom tasks depends on the specification
 * version defined for the extension.
 *
 * @public
 * @memberof module:@ui5/builder.tasks
 */
class TaskUtil {
	/**
	 * Standard Build Tags. See UI5 Tooling RFC 0008 for details.
	 *
	 * @public
	 * @typedef {object} StandardBuildTags
	 * @property {string} OmitFromBuildResult
	 * 		Setting this tag to true for a resource will prevent it from being written to the build target
	 */

	/**
	 * Constructor
	 *
	 * @param {object} parameters
	 * @param {module:@ui5/builder.builder.ProjectBuildContext} parameters.projectBuildContext ProjectBuildContext
	 * @public
	 * @hideconstructor
	 */
	constructor({projectBuildContext}) {
		this._projectBuildContext = projectBuildContext;

		/**
		 * @member {StandardBuildTags}
		 * @public
		*/
		this.STANDARD_TAGS = this._projectBuildContext.STANDARD_TAGS;
	}

	/**
	 * Stores a tag with value for a given resource's path. Note that the tag is independent of the supplied
	 * resource instance. For two resource instances with the same path, the same tag value is returned.
	 * If the path of a resource is changed, any tag information previously stored for that resource is lost.
	 *
	 * @param {module:@ui5/fs.Resource} resource Resource the tag should be stored for
	 * @param {string} tag Name of the tag.
	 * 		Currently only the [STANDARD_TAGS]{@link module:@ui5/builder.tasks.TaskUtil#STANDARD_TAGS} are allowed
	 * @param {string|boolean|integer} [value=true] Tag value. Must be primitive
	 * @public
	 */
	setTag(resource, tag, value) {
		return this._projectBuildContext.getResourceTagCollection().setTag(resource, tag, value);
	}

	/**
	 * Retrieves the value for a stored tag. If no value is stored, <code>undefined</code> is returned.
	 *
	 * @param {module:@ui5/fs.Resource} resource Resource the tag should be retrieved for
	 * @param {string} tag Name of the tag
	 * @returns {string|boolean|integer} Tag value for the given resource.
	 * 										<code>undefined</code> if no value is available
	 * @public
	 */
	getTag(resource, tag) {
		return this._projectBuildContext.getResourceTagCollection().getTag(resource, tag);
	}

	/**
	 * Clears the value of a tag stored for the given resource's path.
	 * It's like the tag was never set for that resource.
	 *
	 * @param {module:@ui5/fs.Resource} resource Resource the tag should be cleared for
	 * @param {string} tag Tag
	 * @public
	 */
	clearTag(resource, tag) {
		return this._projectBuildContext.getResourceTagCollection().clearTag(resource, tag);
	}

	/**
	 * Check whether the project currently being build is the root project.
	 *
	 * @returns {boolean} True if the currently built project is the root project
	 * @public
	 */
	isRootProject() {
		return this._projectBuildContext.isRootProject();
	}

	/**
	 * Register a function that must be executed once the build is finished. This can be used to for example
	 * cleanup files temporarily created on the file system. If the callback returns a Promise, it will be waited for.
	 *
	 * @param {Function} callback Callback to register. If it returns a Promise, it will be waited for
	 * @public
	 */
	registerCleanupTask(callback) {
		return this._projectBuildContext.registerCleanupTask(callback);
	}

	/**
	 * Get an interface to an instance of this class that only provides those functions
	 * that are supported by the given custom middleware extension specification version.
	 *
	 * @param {string} specVersion Specification Version of custom middleware extension
	 * @returns {object} An object with bound instance methods supported by the given specification version
	 */
	getInterface(specVersion) {
		const baseInterface = {
			STANDARD_TAGS: this.STANDARD_TAGS,
			setTag: this.setTag.bind(this),
			clearTag: this.clearTag.bind(this),
			getTag: this.getTag.bind(this),
			isRootProject: this.isRootProject.bind(this),
			registerCleanupTask: this.registerCleanupTask.bind(this)
		};
		switch (specVersion) {
		case "0.1":
		case "1.0":
		case "1.1":
		case "2.0":
		case "2.1":
			return undefined;
		case "2.2":
			return baseInterface;
		default:
			throw new Error(`TaskUtil: Unknown or unsupported specification version ${specVersion}`);
		}
	}
}

module.exports = TaskUtil;

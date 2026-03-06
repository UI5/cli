/**
 * Proxy of ResourceTagCollection
 *
 * @class
 * @alias @ui5/fs/internal/MonitoredTagCollection
 */
class MonitoredTagCollection {
	#tagCollection;
	#tagOperations = new Map(); // resourcePath -> Map<key, value>

	/**
	 * Constructor
	 *
	 * @param {object} tagCollection The ResourceTagCollection instance to wrap
	 */
	constructor(tagCollection) {
		this.#tagCollection = tagCollection;
	}

	/**
	 * Returns tags created or cleared via this MonitoredTagCollection during the execution of a task
	 *
	 * @returns {Map<string, Map<string, {string|number|boolean|undefined}>>}
	 *  Map of resource paths to their tags that were set or cleared during this task's execution
	 */
	getTagOperations() {
		return this.#tagOperations;
	}

	/**
	 * Set a tag on a resource and track the operation
	 *
	 * @param {string|object} resourcePathOrResource Path of the resource or a resource instance
	 * @param {string} tag Tag in the format "namespace:Name"
	 * @param {string|number|boolean} [value=true] Tag value
	 */
	setTag(resourcePathOrResource, tag, value = true) {
		this.#tagCollection.setTag(resourcePathOrResource, tag, value);
		const resourcePath = this.#tagCollection._getPath(resourcePathOrResource);

		// Track tags set during this task's execution
		if (!this.#tagOperations.has(resourcePath)) {
			this.#tagOperations.set(resourcePath, new Map());
		}
		this.#tagOperations.get(resourcePath).set(tag, value);
	}

	/**
	 * Get a tag value from a resource
	 *
	 * @param {string|object} resourcePathOrResource Path of the resource or a resource instance
	 * @param {string} tag Tag in the format "namespace:Name"
	 * @returns {string|number|boolean|undefined} Tag value or undefined if not set
	 */
	getTag(resourcePathOrResource, tag) {
		return this.#tagCollection.getTag(resourcePathOrResource, tag);
	}

	/**
	 * Clear a tag from a resource and track the operation
	 *
	 * @param {string|object} resourcePathOrResource Path of the resource or a resource instance
	 * @param {string} tag Tag in the format "namespace:Name"
	 */
	clearTag(resourcePathOrResource, tag) {
		this.#tagCollection.clearTag(resourcePathOrResource, tag);
		const resourcePath = this.#tagCollection._getPath(resourcePathOrResource);

		// Track cleared tags during this task's execution
		const resourceTags = this.#tagOperations.has(resourcePath);
		if (resourceTags) {
			resourceTags.set(tag, undefined);
		}
	}
}

export default MonitoredTagCollection;

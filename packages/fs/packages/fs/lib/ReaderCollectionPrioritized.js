const AbstractReader = require("./AbstractReader");

/**
 * Prioritized Resource Locator Collection
 *
 * @augments AbstractReader
 */
class ReaderCollectionPrioritized extends AbstractReader {
	/**
	 * The constructor.
	 *
	 * @param {Object} parameters
	 * @param {string} parameters.name The collection name
	 * @param {AbstractReader[]} parameters.readers Prioritized list of resource readers (first is tried first)
	 */
	constructor({readers, name}) {
		super();
		this._name = name;
		this._readers = readers;
	}

	/**
	 * Locates resources by GLOB.
	 *
	 * @private
	 * @param {string} pattern GLOB pattern
	 * @param {Object} options GLOB options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to list of resources
	 */
	_byGlob(pattern, options, trace) {
		return Promise.all(this._readers.map(function(resourceLocator) {
			return resourceLocator._byGlob(pattern, options, trace);
		})).then((result) => {
			let files = {};
			let resources = [];
			// Prefer files found in preceding resource locators
			for (let i = 0; i < result.length; i++) {
				for (let j = 0; j < result[i].length; j++) {
					let resource = result[i][j];
					let path = resource.getPath();
					if (!files[path]) {
						files[path] = true;
						resources.push(resource);
					}
				}
			}

			trace.collection(this._name);
			return resources;
		});
	}

	/**
	 * Locates resources by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {Object} options Options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to a list of resources
	 */
	_byPath(virPath, options, trace) {
		const byPath = (i) => {
			if (i > this._readers.length - 1) {
				return null;
			}
			return this._readers[i]._byPath(virPath, options, trace).then((result) => {
				if (result) {
					result.pushCollection(this._name);
					return result;
				} else {
					return byPath(++i);
				}
			});
		};
		return byPath(0);
	}
}

module.exports = ReaderCollectionPrioritized;

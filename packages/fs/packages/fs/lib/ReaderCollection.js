import AbstractReader from "./AbstractReader.js";

/**
 * Resource Locator ReaderCollection
 *
 * @public
 * @class
 * @alias @ui5/fs/ReaderCollection
 * @extends @ui5/fs/AbstractReader
 */
class ReaderCollection extends AbstractReader {
	/**
	 * The constructor.
	 *
	 * @param {object} parameters Parameters
	 * @param {string} parameters.name The collection name
	 * @param {@ui5/fs/AbstractReader[]} parameters.readers List of resource readers (all tried in parallel)
	 */
	constructor({name, readers}) {
		super(name);
		this._readers = readers;
	}

	/**
	 * Locates resources by glob.
	 *
	 * @private
	 * @param {string|string[]} pattern glob pattern as string or an array of
	 *         glob patterns for virtual directory structure
	 * @param {object} options glob options
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	_byGlob(pattern, options, trace) {
		return Promise.all(this._readers.map(function(resourceLocator) {
			return resourceLocator._byGlob(pattern, options, trace);
		})).then((result) => {
			trace.collection(this._name);
			return Array.prototype.concat.apply([], result);
		});
	}

	/**
	 * Locates resources by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {object} options Options
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource>} Promise resolving to a single resource
	 */
	_byPath(virPath, options, trace) {
		const that = this;
		const resourceLocatorCount = this._readers.length;
		let resolveCount = 0;

		if (this._readers.length === 0) {
			// Promise.race doesn't resolve for empty arrays
			return Promise.resolve();
		}

		/* Promise.race to cover the following (self defined) requirement:
			Deliver files that can be found fast at the cost of slower response times for files that cannot be found.
		*/
		return Promise.race(this._readers.map(function(resourceLocator) {
			return resourceLocator._byPath(virPath, options, trace).then(function(resource) {
				return new Promise(function(resolve, reject) {
					trace.collection(that._name);
					resolveCount++;
					if (resource) {
						resource.pushCollection(that._name);
						resolve(resource);
					} else if (resolveCount === resourceLocatorCount) {
						resolve(null);
					}
				});
			});
		}));
	}
}

export default ReaderCollection;

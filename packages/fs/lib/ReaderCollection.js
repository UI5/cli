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
	 * @param {@ui5/fs/AbstractReader[]} [parameters.readers]
	 *   List of resource readers (all tried in parallel).
	 *   If none are provided, the collection will never return any results.
	 */
	constructor({name, readers}) {
		super(name);

		// Remove any undefined (empty) readers from array
		this._readers = readers.filter(($) => $);
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
	 * @returns {Promise<@ui5/fs/Resource|null>}
	 *   Promise resolving to a single resource or <code>null</code> if no resource is found
	 */
	_byPath(virPath, options, trace) {
		const that = this;
		const resourceLocatorCount = this._readers.length;
		let resolveCount = 0;

		if (resourceLocatorCount === 0) {
			// Short-circuit if there are no readers (Promise.race does not settle for empty arrays)
			trace.collection(that._name);
			return Promise.resolve(null);
		}

		// Using Promise.race to deliver files that can be found as fast as possible
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

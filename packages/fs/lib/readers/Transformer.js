const AbstractReader = require("../AbstractReader");

/**
 * A reader that allows modification of all resources passed through it.
 *
 * @public
 * @memberof module:@ui5/fs.readers
 * @augments module:@ui5/fs.AbstractReader
 */
class Transformer extends AbstractReader {
	/**
	* Callback to check and eventually transform a resource
	*
	* @public
	* @callback module:@ui5/fs.readers.Transformer~callback
	* @param {module:@ui5/fs.Resource} resourcePath Path of the resource to process.
	* 			This can be used to decide whether the resource should be transformed
	* @param {module:@ui5/fs.readers.Transformer~getResource}
	* 			Function to retrieve the given resource instance in order to transform it
	* @returns {Promise} Promise resolving once the transformation is done
	*/

	/**
	* Callback to retrieve a resource for modification. This will create a clone of the original
	* resource which then takes its place in the result set of the reader
	*
	* @public
	* @callback module:@ui5/fs.readers.Transformer~getResource
	* @returns {Promise<module:@ui5/fs.Resource>} Promise resolving to the resource
	*/

	/**
	 * Constructor
	 *
	 * @param {object} parameters Parameters
	 * @param {module:@ui5/fs.AbstractReader} parameters.reader The resource reader to wrap
	 * @param {module:@ui5/fs.readers.Transformer~callback} parameters.callback
	 * 				Filter function. Will be called for every resource read through this reader.
	 */
	constructor({reader, callback}) {
		super();
		if (!reader) {
			throw new Error(`Missing parameter "reader"`);
		}
		if (!callback) {
			throw new Error(`Missing parameter "callback"`);
		}
		this._reader = reader;
		this._callback = callback;
	}

	/**
	 * Locates resources by glob.
	 *
	 * @private
	 * @param {string|string[]} pattern glob pattern as string or an array of
	 *         glob patterns for virtual directory structure
	 * @param {object} options glob options
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	async _byGlob(pattern, options, trace) {
		const result = await this._reader._byGlob(pattern, options, trace);
		return Promise.all(result.map(async (resource) => {
			let resourceClone;
			await this._callback(resource.getPath(), async function() {
				// Make sure to only clone once
				resourceClone = resourceClone || await resource.clone();
				return resourceClone;
			});
			return resourceClone || resource;
		}));
	}

	/**
	 * Locates resources by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {object} options Options
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource>} Promise resolving to a single resource
	 */
	async _byPath(virPath, options, trace) {
		const resource = await this._reader._byPath(virPath, options, trace);
		let resourceClone;
		if (resource) {
			await this._callback(resource.getPath(), async function() {
				// Make sure to only clone once
				resourceClone = resourceClone || await resource.clone();
				return resourceClone;
			});
		}
		return resourceClone || resource;
	}
}

module.exports = Transformer;

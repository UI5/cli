import AbstractReader from "../AbstractReader.js";

/**
 * A reader that allows dynamic filtering of resources passed through it
 *
 * @public
 * @class
 * @alias @ui5/fs/readers/Filter
 * @extends @ui5/fs/AbstractReader
 */
class Filter extends AbstractReader {
	/**
	* Filter callback
	*
	* @public
	* @callback @ui5/fs/readers/Filter~callback
	* @param {@ui5/fs/Resource} resource Resource to test
	* @returns {boolean} Whether to keep the resource
	*/

	/**
	 * Constructor
	 *
 	 * @public
	 * @param {object} parameters Parameters
	 * @param {@ui5/fs/AbstractReader} parameters.reader The resource reader or collection to wrap
	 * @param {@ui5/fs/readers/Filter~callback} parameters.callback
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
	 * @param {@ui5/fs/tracing/Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	async _byGlob(pattern, options, trace) {
		const result = await this._reader._byGlob(pattern, options, trace);
		return result.filter(this._callback);
	}

	/**
	 * Locates resources by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {object} options Options
	 * @param {@ui5/fs/tracing/Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource>} Promise resolving to a single resource
	 */
	async _byPath(virPath, options, trace) {
		const result = await this._reader._byPath(virPath, options, trace);
		if (result && !this._callback(result)) {
			return null;
		}
		return result;
	}
}

export default Filter;

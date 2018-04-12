const AbstractReader = require("./AbstractReader");

/**
 * Abstract resource locator
 *
 * @abstract
 * @augments AbstractReader
 */
class AbstractReaderWriter extends AbstractReader {
	/**
	 * The constructor.
	 */
	constructor() {
		if (new.target === AbstractReaderWriter) {
			throw new TypeError("Class 'AbstractReaderWriter' is abstract");
		}
		super();
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @param {Resource} resource The Resource to write
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	write(resource) {
		return this._write(resource);
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @abstract
	 * @protected
	 * @param {Resource} resource The Resource to write
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	_write(resource) {
		throw new Error("Not implemented");
	}
}

module.exports = AbstractReaderWriter;

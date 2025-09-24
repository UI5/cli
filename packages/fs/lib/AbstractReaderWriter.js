import AbstractReader from "./AbstractReader.js";

/**
 * Abstract resource locator implementing the general API for <b>reading and writing</b> resources
 *
 * @abstract
 * @public
 * @class
 * @alias @ui5/fs/AbstractReaderWriter
 * @extends @ui5/fs/AbstractReader
 */
class AbstractReaderWriter extends AbstractReader {
	/**
	 * The constructor.
	 *
	 * @public
	 * @param {string} name Name of the reader/writer. Typically used for tracing purposes
	 */
	constructor(name) {
		if (new.target === AbstractReaderWriter) {
			throw new TypeError("Class 'AbstractReaderWriter' is abstract");
		}
		super(name);
	}

	/*
	 * Returns the name of the reader/writer instance. This can be used for logging/tracing purposes.
	 *
	 * @returns {string} Name of the reader/writer
	 */
	getName() {
		return this._name || `<unnamed ${this.constructor.name} Reader/Writer>`;
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @public
	 * @param {@ui5/fs/Resource} resource Resource to write
	 * @param {object} [options]
	 * @param {boolean} [options.readOnly=false] Whether the resource content shall be written read-only
	 *						Do not use in conjunction with the <code>drain</code> option.
	 *						The written file will be used as the new source of this resources content.
	 *						Therefore the written file should not be altered by any means.
	 *						Activating this option might improve overall memory consumption.
	 * @param {boolean} [options.drain=false] Whether the resource content shall be emptied during the write process.
	 *						Do not use in conjunction with the <code>readOnly</code> option.
	 *						Activating this option might improve overall memory consumption.
	 *						This should be used in cases where this is the last access to the resource.
	 *						E.g. the final write of a resource after all processing is finished.
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	write(resource, options = {drain: false, readOnly: false}) {
		return this._write(resource, options);
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @abstract
	 * @protected
	 * @param {@ui5/fs/Resource} resource Resource to write
	 * @param {object} [options] Write options, see above
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	_write(resource, options) {
		throw new Error("Not implemented");
	}
}

export default AbstractReaderWriter;

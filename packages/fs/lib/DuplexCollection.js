const AbstractReaderWriter = require("./AbstractReaderWriter");
const ReaderCollectionPrioritized = require("./ReaderCollectionPrioritized");

/**
 * Wrapper to keep readers and writers together
 *
 * @augments AbstractReaderWriter
 */
class DuplexCollection extends AbstractReaderWriter {
	/**
	 * The Constructor.
	 *
	 * @param {Object} parameters
	 * @param {AbstractReader} parameters.reader Single reader or collection of readers
	 * @param {AbstractReaderWriter} parameters.writer A ReaderWriter instance which is only used for writing files
	 * @param {string} [parameters.name=""] The collection name
	 */
	constructor({reader, writer, name = ""}) {
		super();
		this._reader = reader;
		this._writer = writer;

		this._combo = new ReaderCollectionPrioritized({
			name: name,
			readers: [
				writer,
				reader
			]
		});
	}

	/**
	 * Locates resources by GLOB.
	 *
	 * @private
	 * @param {string} virPattern GLOB pattern for virtual directory structure
	 * @param {Object} options GLOB options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise} Promise resolving to list of resources
	 */
	_byGlob(virPattern, options, trace) {
		return this._combo._byGlob(virPattern, options, trace);
	}

	/**
	 * Locates resources by GLOB from source reader only.
	 * For found resources that are also available in the writer, the writer resource will be returned.
	 *
	 * @param {string} virPattern GLOB pattern for virtual directory structure
	 * @param {Object} [options={}] GLOB options
	 * @returns {Promise<Resource[]>} Promise resolving to list of resources
	 */
	byGlobSource(virPattern, options = {}) {
		return this._reader.byGlob(virPattern, options).then((resources) => {
			return Promise.all(resources.map((readerResource) => {
				return this._writer.byPath(readerResource.getPath()).then((writerResource) => {
					return writerResource || readerResource;
				});
			}));
		});
	}

	/**
	 * Locates resources by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {Object} options Options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to a resources
	 */
	_byPath(virPath, options, trace) {
		return this._combo._byPath(virPath, options, trace);
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @private
	 * @param {Resource} resource The Resource to write
	 * @returns {Promise} Promise resolving once data has been written
	 */
	_write(resource) {
		return this._writer.write(resource);
	}
}

module.exports = DuplexCollection;

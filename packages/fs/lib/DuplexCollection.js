import AbstractReaderWriter from "./AbstractReaderWriter.js";
import ReaderCollectionPrioritized from "./ReaderCollectionPrioritized.js";

/**
 * Wrapper to keep readers and writers together
 *
 * @public
 * @class
 * @alias @ui5/fs/DuplexCollection
 * @extends @ui5/fs/AbstractReaderWriter
 */
class DuplexCollection extends AbstractReaderWriter {
	/**
	 * The Constructor.
	 *
	 * @param {object} parameters
	 * @param {@ui5/fs/AbstractReader} parameters.reader Single reader or collection of readers
	 * @param {@ui5/fs/AbstractReaderWriter} parameters.writer
	 *			A ReaderWriter instance which is only used for writing files
	 * @param {string} [parameters.name=""] The collection name
	 */
	constructor({reader, writer, name = ""}) {
		super(name);

		if (!reader) {
			throw new Error(`Cannot create DuplexCollection ${this._name}: No reader provided`);
		}
		if (!writer) {
			throw new Error(`Cannot create DuplexCollection ${this._name}: No writer provided`);
		}

		this._reader = reader;
		this._writer = writer;

		this._combo = new ReaderCollectionPrioritized({
			name: `${name} - ReaderCollectionPrioritized`,
			readers: [
				writer,
				reader
			]
		});
	}

	/**
	 * Locates resources by glob.
	 *
	 * @private
	 * @param {string|string[]} virPattern glob pattern as string or an array of
	 *         glob patterns for virtual directory structure
	 * @param {object} options glob options
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with a list of resources
	 */
	_byGlob(virPattern, options, trace) {
		return this._combo._byGlob(virPattern, options, trace);
	}

	/**
	 * Locates resources by glob from source reader only.
	 * For found resources that are also available in the writer, the writer resource will be returned.
	 *
	 * @param {string} virPattern glob pattern for virtual directory structure
	 * @param {object} [options] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	byGlobSource(virPattern, options = {nodir: true}) {
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
	 * @param {object} options Options
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource|null>}
	 *   Promise resolving to a single resource or <code>null</code> if no resource is found
	 */
	_byPath(virPath, options, trace) {
		return this._combo._byPath(virPath, options, trace);
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @private
	 * @param {@ui5/fs/Resource} resource The Resource to write
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	_write(resource) {
		return this._writer.write(resource);
	}
}

export default DuplexCollection;

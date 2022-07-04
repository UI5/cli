const randomInt = require("random-int");
const Trace = require("./tracing/Trace");

/**
 * Abstract resource locator
 *
 * @public
 * @abstract
 * @memberof module:@ui5/fs
 */
class AbstractReader {
	/**
	 * The constructor.
	 *
	 * @public
	 */
	constructor() {
		if (new.target === AbstractReader) {
			throw new TypeError("Class 'AbstractReader' is abstract");
		}
	}

	/**
	 * Locates resources by matching glob patterns.
	 *
	 * @example
	 * byGlob("**‏/*.{html,htm}");
	 * byGlob("**‏/.library");
	 * byGlob("/pony/*");
	 *
	 * @public
	 * @param {string|string[]} virPattern glob pattern as string or array of glob patterns for
	 * 										virtual directory structure
	 * @param {object} [options] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	byGlob(virPattern, options = {nodir: true}) {
		const trace = new Trace(virPattern);
		return this._byGlob(virPattern, options, trace).then(function(result) {
			trace.printReport();
			return result;
		}).then((resources) => {
			if (resources.length > 1) {
				// Pseudo randomize result order to prevent consumers from relying on it:
				// Swap the first object with a randomly chosen one
				const x = 0;
				const y = randomInt(0, resources.length - 1);
				// Swap object at index "x" with  "y"
				resources[x] = [resources[y], resources[y]=resources[x]][0];
			}
			return resources;
		});
	}

	/**
	 * Locates resources by matching a given path.
	 *
	 * @public
	 * @param {string} virPath Virtual path
	 * @param {object} [options] Options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @returns {Promise<module:@ui5/fs.Resource>} Promise resolving to a single resource
	 */
	byPath(virPath, options = {nodir: true}) {
		const trace = new Trace(virPath);
		return this._byPath(virPath, options, trace).then(function(resource) {
			trace.printReport();
			return resource;
		});
	}


	/**
	 * Create a [Filter-Reader]{@link module:@ui5/fs.readers.Filter} from the current reader
	 *
	 * @public
	 * @param {module:@ui5/fs.readers.Filter~callback} callback
	 * 				Filter function. Will be called for every resource passed through this reader.
	 * @returns {module:@ui5/fs.reader.Filter} Filter instance
	 */
	filter(callback) {
		const Filter = require("./readers/Filter");
		return new Filter({
			reader: this,
			callback
		});
	}

	/**
	 * Create a [Transformer-Reader]{@link module:@ui5/fs.readers.Transformer} from the current reader
	 *
	 * @private
	 * @param {module:@ui5/fs.readers.Transformer~callback} callback
	 * 				Callback to check and eventually transform any resource passed through the reader
	 * @returns {module:@ui5/fs.reader.Transformer} Transformer instance
	 */
	transform(callback) {
		const Transformer = require("./readers/Transformer");
		return new Transformer({
			reader: this,
			callback
		});
	}
	/**
	 * Create an abstraction of this reader instance where all requests are prefixed with
	 * <code>/resources/<namespace></code>.
	 *
	 * This simulates "flat" resource access, which is for example common for projects of type
	 * "application"
	 *
	 * @public
	 * @param {string} namespace Project namespace
	 * @returns {module:@ui5/fs.reader.AbstractReader} Reader instance
	 */
	flatten(namespace) {
		const Link = require("./readers/Link");
		return new Link({
			reader: this,
			pathMapping: {
				linkPath: `/`,
				targetPath: `/resources/${namespace}/`
			}
		});
	}

	/**
	 * Locates resources by one or more glob patterns.
	 *
	 * @abstract
	 * @protected
	 * @param {string|string[]} virPattern glob pattern as string or an array of
	 *         glob patterns for virtual directory structure
	 * @param {object} options glob options
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	_byGlob(virPattern, options, trace) {
		throw new Error("Function '_byGlob' is not implemented");
	}

	/**
	 * Locate resources by matching a single glob pattern.
	 *
	 * @abstract
	 * @protected
	 * @param {string} pattern glob pattern
	 * @param {object} options glob options
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	_runGlob(pattern, options, trace) {
		throw new Error("Function '_runGlob' is not implemented");
	}

	/**
	 * Locates resources by path.
	 *
	 * @abstract
	 * @protected
	 * @param {string} virPath Virtual path
	 * @param {object} options Options
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource>} Promise resolving to a single resource
	 */
	_byPath(virPath, options, trace) {
		throw new Error("Function '_byPath' is not implemented");
	}
}

module.exports = AbstractReader;

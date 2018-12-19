const randomInt = require("random-int");
const Trace = require("./tracing/Trace");

/**
 * Abstract resource locator
 *
 * @abstract
 */
class AbstractReader {
	/**
	 * The constructor.
	 */
	constructor() {
		if (new.target === AbstractReader) {
			throw new TypeError("Class 'AbstractReader' is abstract");
		}
	}

	/**
	 * Locates resourcess by GLOB.
	 *
	 * @example
	 * <caption>Example patterns:</caption>
	 * // **\u00002F*.{html,htm}
	 * // **\u00002F.library
	 * // /pony/*
	 *
	 * @param {string|Array} virPattern GLOB pattern as string or array of glob patterns for virtual directory structure
	 * @param {Object} [options={}] GLOB options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @returns {Promise<Resource[]>} Promise resolving to list of resources
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
	 * Locates resources by path.
	 *
	 * @param {string} virPath Virtual path
	 * @param {Object} options Options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @returns {Promise<Resource>} Promise resolving to a single resource
	 */
	byPath(virPath, options = {nodir: true}) {
		const trace = new Trace(virPath);
		return this._byPath(virPath, options, trace).then(function(resource) {
			trace.printReport();
			return resource;
		});
	}

	/**
	 * Locates resources by GLOB.
	 *
	 * @abstract
	 * @protected
	 * @param {string} virPattern GLOB pattern for virtual directory structure
	 * @param {Object} options GLOB options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to list of resources
	 */
	_byGlob(virPattern, options, trace) {
		throw new Error("Not implemented");
	}

	/**
	 * Locate resources by GLOB
	 *
	 * @abstract
	 * @protected
	 * @param {string} pattern GLOB pattern
	 * @param {Object} options GLOB options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to list of resources
	 */
	_runGlob(pattern, options, trace) {
		throw new Error("Not implemented");
	}

	/**
	 * Locates resources by path.
	 *
	 * @abstract
	 * @protected
	 * @param {string} virPath Virtual path
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource>} Promise resolving to a single resource
	 */
	_byPath(virPath, trace) {
		throw new Error("Not implemented");
	}
}

module.exports = AbstractReader;

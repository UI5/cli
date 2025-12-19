import micromatch from "micromatch";
import AbstractReader from "../AbstractReader.js";

/**
 * Callback function to retrieve a resource by its virtual path.
 *
 * @public
 * @callback @ui5/fs/readers/Proxy~getResource
 * @param {string} virPath Virtual path
 * @returns {Promise<module:@ui5/fs/Resource>} Promise resolving with a Resource instance
 */

/**
 * Callback function to list all available virtual resource paths.
 *
 * @public
 * @callback @ui5/fs/readers/Proxy~listResourcePaths
 * @returns {Promise<string[]>} Promise resolving to an array of strings (the virtual resource paths)
 */

/**
 * Generic proxy adapter. Allowing to serve resources using callback functions. Read only.
 *
 * @public
 * @class
 * @alias @ui5/fs/readers/Proxy
 * @extends @ui5/fs/readers/AbstractReader
 */
class Proxy extends AbstractReader {
	/**
	 * Constructor
	 *
	 * @public
	 * @param {object} parameters
	 * @param {object} parameters.name Name of the reader
	 * @param {@ui5/fs/readers/Proxy~getResource} parameters.getResource
	 * 	Callback function to retrieve a resource by its virtual path.
	 * @param {@ui5/fs/readers/Proxy~listResourcePaths} parameters.listResourcePaths
	 * 	Callback function to list all available virtual resource paths.
	 * @returns {@ui5/fs/readers/Proxy} Reader instance
	 */
	constructor({name, getResource, listResourcePaths}) {
		super(name);
		if (typeof getResource !== "function") {
			throw new Error(`Proxy adapter: Missing or invalid parameter 'getResource'`);
		}
		if (typeof listResourcePaths !== "function") {
			throw new Error(`Proxy adapter: Missing or invalid parameter 'listResourcePaths'`);
		}
		this._getResource = getResource;
		this._listResourcePaths = listResourcePaths;
	}

	async _listResourcePaths() {
		const virPaths = await this._listResourcePaths();
		if (!Array.isArray(virPaths) || !virPaths.every((p) => typeof p === "string")) {
			throw new Error(
				`Proxy adapter: 'listResourcePaths' did not return an array of strings`);
		}
		return virPaths;
	}

	/**
	 * Matches and returns resources from a given map (either _virFiles or _virDirs).
	 *
	 * @private
	 * @param {string[]} patterns
	 * @param {string[]} resourcePaths
	 * @returns {Promise<module:@ui5/fs.Resource[]>}
	 */
	async _matchPatterns(patterns, resourcePaths) {
		const matchedPaths = micromatch(resourcePaths, patterns, {
			dot: true
		});
		return await Promise.all(matchedPaths.map((virPath) => {
			return this._getResource(virPath);
		}));
	}

	/**
	 * Locate resources by glob.
	 *
	 * @private
	 * @param {string|string[]} virPattern glob pattern as string or array of glob patterns for
	 * 										virtual directory structure
	 * @param {object} [options={}] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	async _byGlob(virPattern, options = {nodir: true}, trace) {
		if (!(virPattern instanceof Array)) {
			virPattern = [virPattern];
		}

		if (virPattern[0] === "" && !options.nodir) { // Match virtual root directory
			return [
				this._createDirectoryResource(this._virBasePath.slice(0, -1))
			];
		}

		return await this._matchPatterns(virPattern, await this._listResourcePaths());
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
	async _byPath(virPath, options, trace) {
		trace.pathCall();

		const resource = await this._getResource(virPath);
		if (!resource || (options.nodir && resource.getStatInfo().isDirectory())) {
			return null;
		} else {
			return resource;
		}
	}
}

export default Proxy;

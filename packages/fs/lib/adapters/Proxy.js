import micromatch from "micromatch";
import AbstractAdapter from "./AbstractAdapter.js";

/**
 * Generic proxy adapter. Allowing to serve resources using callback functions. Read only.
 *
 * @public
 * @class
 * @alias @ui5/fs/adapters/Proxy
 * @extends @ui5/fs/adapters/AbstractAdapter
 */
class Proxy extends AbstractAdapter {
	constructor({name, virBasePath, project, excludes, getResourceCallback, listResourcePathsCallback}) {
		super({name, virBasePath, project, excludes});
		if (typeof getResourceCallback !== "function") {
			throw new Error(`Proxy adapter: Missing or invalid parameter 'getResourceCallback'`);
		}
		if (typeof listResourcePathsCallback !== "function") {
			throw new Error(`Proxy adapter: Missing or invalid parameter 'listResourcePathsCallback'`);
		}
		this._getResourceCallback = getResourceCallback;
		this._listResourcePathsCallback = listResourcePathsCallback;
	}

	async _listResourcePaths() {
		const virPaths = await this._listResourcePathsCallback();
		if (!Array.isArray(virPaths) || !virPaths.every((p) => typeof p === "string")) {
			throw new Error(
				`Proxy adapter: 'listResourcePathsCallback' did not return an array of strings`);
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
			return this._getResourceCallback(virPath);
		}));
	}

	/**
	 * Locate resources by glob.
	 *
	 * @private
	 * @param {Array} patterns array of glob patterns
	 * @param {object} [options={}] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	async _runGlob(patterns, options = {nodir: true}, trace) {
		if (patterns[0] === "" && !options.nodir) { // Match virtual root directory
			return [
				this._createDirectoryResource(this._virBasePath.slice(0, -1))
			];
		}

		return await this._matchPatterns(patterns, await this._listResourcePaths());
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
		const relPath = this._resolveVirtualPathToBase(virPath);
		if (relPath === null) {
			return null;
		}

		trace.pathCall();

		const resource = this._virFiles[relPath];

		if (!resource || (options.nodir && resource.getStatInfo().isDirectory())) {
			return null;
		} else {
			return await this._cloneResource(resource);
		}
	}

	async _write() {

	}
}

export default Proxy;

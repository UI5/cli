import {getLogger} from "@ui5/logger";
const log = getLogger("resources:adapters:Memory");
import micromatch from "micromatch";
import AbstractAdapter from "./AbstractAdapter.js";

const ADAPTER_NAME = "Memory";

/**
 * Virtual resource Adapter
 *
 * @public
 * @class
 * @alias @ui5/fs/adapters/Memory
 * @extends @ui5/fs/adapters/AbstractAdapter
 */
class Memory extends AbstractAdapter {
	/**
	 * The constructor.
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.virBasePath
	 *   Virtual base path. Must be absolute, POSIX-style, and must end with a slash
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 * @param {@ui5/project/specifications/Project} [parameters.project] Project this adapter belongs to (if any)
	 */
	constructor({virBasePath, project, excludes}) {
		super({virBasePath, project, excludes});
		this._virFiles = Object.create(null); // map full of files
		this._virDirs = Object.create(null); // map full of directories
	}

	/**
	 * Matches and returns resources from a given map (either _virFiles or _virDirs).
	 *
	 * @private
	 * @param {string[]} patterns
	 * @param {object} resourceMap
	 * @returns {Promise<module:@ui5/fs.Resource[]>}
	 */
	async _matchPatterns(patterns, resourceMap) {
		const resourcePaths = Object.keys(resourceMap);
		const matchedPaths = micromatch(resourcePaths, patterns, {
			dot: true
		});
		return await Promise.all(matchedPaths.map((virPath) => {
			const resource = resourceMap[virPath];
			if (resource) {
				return this._cloneResource(resource);
			}
		}));
	}

	async _cloneResource(resource) {
		const clonedResource = await resource.clone();
		if (this._project) {
			clonedResource.setProject(this._project);
		}
		return clonedResource;
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
				this._createResource({
					project: this._project,
					statInfo: { // TODO: make closer to fs stat info
						isDirectory: function() {
							return true;
						}
					},
					sourceMetadata: {
						adapter: ADAPTER_NAME
					},
					path: this._virBasePath.slice(0, -1)
				})
			];
		}

		let matchedResources = await this._matchPatterns(patterns, this._virFiles);

		if (!options.nodir) {
			const matchedDirs = await this._matchPatterns(patterns, this._virDirs);
			matchedResources = matchedResources.concat(matchedDirs);
		}

		return matchedResources;
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

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @private
	 * @param {@ui5/fs/Resource} resource The Resource to write
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	async _write(resource) {
		resource = this._migrateResource(resource);
		if (resource instanceof Promise) {
			// Only await if the migrate function returned a promise
			// Otherwise await would automatically create a Promise, causing unwanted overhead
			resource = await resource;
		}
		this._assignProjectToResource(resource);
		const relPath = this._resolveVirtualPathToBase(resource.getPath(), true);
		log.silly(`Writing to virtual path ${resource.getPath()}`);
		this._virFiles[relPath] = await resource.clone();

		// Add virtual directories for all path segments of the written resource
		// TODO: Add tests for all this
		const pathSegments = relPath.split("/");
		pathSegments.pop(); // Remove last segment representing the resource itself

		pathSegments.forEach((segment, i) => {
			if (i >= 1) {
				segment = pathSegments[i - 1] + "/" + segment;
			}
			pathSegments[i] = segment;
		});

		for (let i = pathSegments.length - 1; i >= 0; i--) {
			const segment = pathSegments[i];
			if (!this._virDirs[segment]) {
				this._virDirs[segment] = this._createResource({
					project: this._project,
					sourceMetadata: {
						adapter: ADAPTER_NAME
					},
					statInfo: { // TODO: make closer to fs stat info
						isDirectory: function() {
							return true;
						}
					},
					path: this._virBasePath + segment
				});
			}
		}
	}
}

export default Memory;

const log = require("@ui5/logger").getLogger("resources:adapters:Memory");
const micromatch = require("micromatch");
const Resource = require("../Resource");
const AbstractAdapter = require("./AbstractAdapter");

/**
 * Virtual resource Adapter
 *
 * @public
 * @memberof module:@ui5/fs.adapters
 * @augments module:@ui5/fs.adapters.AbstractAdapter
 */
class Memory extends AbstractAdapter {
	/**
	 * The constructor.
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 */
	constructor({virBasePath, project, excludes}) {
		super({virBasePath, project, excludes});
		this._virFiles = {}; // map full of files
		this._virDirs = {}; // map full of directories
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
		return Promise.all(matchedPaths.map((virPath) => {
			return resourceMap[virPath] && resourceMap[virPath].clone();
		}));
	}

	/**
	 * Locate resources by glob.
	 *
	 * @private
	 * @param {Array} patterns array of glob patterns
	 * @param {object} [options={}] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	async _runGlob(patterns, options = {nodir: true}, trace) {
		if (patterns[0] === "" && !options.nodir) { // Match virtual root directory
			return [
				new Resource({
					project: this.project,
					statInfo: { // TODO: make closer to fs stat info
						isDirectory: function() {
							return true;
						}
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
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource>} Promise resolving to a single resource
	 */
	async _byPath(virPath, options, trace) {
		if (this.isPathExcluded(virPath)) {
			return null;
		}
		if (!virPath.startsWith(this._virBasePath) && virPath !== this._virBaseDir) {
			// Neither starts with basePath, nor equals baseDirectory
			return null;
		}

		const relPath = virPath.substr(this._virBasePath.length);
		trace.pathCall();

		const resource = this._virFiles[relPath];

		if (!resource || (options.nodir && resource.getStatInfo().isDirectory())) {
			return null;
		} else {
			return await resource.clone();
		}
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @private
	 * @param {module:@ui5/fs.Resource} resource The Resource to write
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	_write(resource) {
		return new Promise((resolve, reject) => {
			const relPath = resource.getPath().substr(this._virBasePath.length);
			log.verbose("Writing to virtual path %s", resource.getPath());
			this._virFiles[relPath] = resource;

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
					this._virDirs[segment] = new Resource({
						project: this.project,
						statInfo: { // TODO: make closer to fs stat info
							isDirectory: function() {
								return true;
							}
						},
						path: this._virBasePath + segment
					});
				}
			}
			resolve();
		});
	}
}

module.exports = Memory;

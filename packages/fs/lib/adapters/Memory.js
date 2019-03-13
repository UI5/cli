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
	 * @param {Object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 */
	constructor({virBasePath, project}) {
		super({virBasePath, project});
		this._virFiles = {}; // map full of files
		this._virDirs = {}; // map full of directories
	}

	/**
	 * Locate resources by glob.
	 *
	 * @private
	 * @param {Array} patterns array of glob patterns
	 * @param {Object} [options={}] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	_runGlob(patterns, options = {nodir: true}, trace) {
		if (patterns[0] === "" && !options.nodir) { // Match virtual root directory
			return Promise.resolve([
				new Resource({
					project: this.project,
					statInfo: { // TODO: make closer to fs stat info
						isDirectory: function() {
							return true;
						}
					},
					path: this._virBasePath.slice(0, -1)
				})
			]);
		}

		const filePaths = Object.keys(this._virFiles);
		const matchedFilePaths = micromatch(filePaths, patterns, {
			dot: true
		});
		let matchedResources = matchedFilePaths.map((virPath) => {
			return this._virFiles[virPath];
		});

		if (!options.nodir) {
			const dirPaths = Object.keys(this._virDirs);
			const matchedDirs = micromatch(dirPaths, patterns, {
				dot: true
			});
			matchedResources = matchedResources.concat(matchedDirs.map((virPath) => {
				return this._virDirs[virPath];
			}));
		}

		return Promise.resolve(matchedResources);
	}

	/**
	 * Locates resources by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {Object} options Options
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource>} Promise resolving to a single resource
	 */
	_byPath(virPath, options, trace) {
		return new Promise((resolve, reject) => {
			if (!virPath.startsWith(this._virBasePath) && virPath !== this._virBaseDir) {
				// Neither starts with basePath, nor equals baseDirectory
				resolve(null);
				return;
			}

			const relPath = virPath.substr(this._virBasePath.length);
			trace.pathCall();

			const resource = this._virFiles[relPath];

			if (!resource || (options.nodir && resource.getStatInfo().isDirectory())) {
				resolve(null);
			} else {
				resolve(resource);
			}
		});
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

const log = require("@ui5/logger").getLogger("resources:adapters:FileSystem");
const path = require("path");
const fs = require("graceful-fs");
const glob = require("globby");
const defaults = require("defaults");
const clone = require("clone");
const makeDir = require("make-dir");
const Resource = require("../Resource");
const AbstractAdapter = require("./AbstractAdapter");

/**
 * File system resource adapter
 *
 * @augments AbstractAdapter
 */
class FileSystem extends AbstractAdapter {
	/**
	 * The Constructor.
	 *
	 * @param {Object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 * @param {string} parameters.fsBasePath (Physical) File system path
	 */
	constructor({virBasePath, project, fsBasePath}) {
		super({virBasePath, project});
		this._fsBasePath = fsBasePath;
	}

	/**
	 * Locate resources by GLOB.
	 *
	 * @private
	 * @param {Array} patterns Array of GLOB patterns
	 * @param {Object} [options] GLOB options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to list of resources
	 */
	_runGlob(patterns, options, trace) {
		return new Promise((resolve, reject) => {
			let opt = defaults(clone(options), { // Clone needed to prevent side effects
				cwd: this._fsBasePath,			 // (todo: maybe make this a module itself)
				dot: true
			});

			trace.globCall();
			glob(patterns, opt).then((matches) => {
				const promises = [];
				if (!opt.nodir && patterns[0] === "") { // Match physical root directory
					promises.push(new Promise((resolve, reject) => {
						fs.stat(this._fsBasePath, (err, stat) => {
							if (err) {
								reject(err);
							} else {
								resolve(new Resource({
									project: this._project,
									statInfo: stat,
									path: this._virBaseDir,
									createStream: () => {
										return fs.createReadStream(this._fsBasePath);
									}
								}));
							}
						});
					}));
				}

				for (let i = matches.length - 1; i >= 0; i--) {
					promises.push(new Promise((resolve, reject) => {
						let fsPath = path.join(this._fsBasePath, matches[i]);
						let virPath = (this._virBasePath + matches[i]);

						// Workaround for not getting the stat from the glob
						fs.stat(fsPath, (err, stat) => {
							if (err) {
								reject(err);
							} else {
								resolve(new Resource({
									project: this._project,
									statInfo: stat,
									path: virPath,
									createStream: () => {
										return fs.createReadStream(fsPath);
									}
								}));
							}
						});
					}));
				}

				Promise.all(promises).then(function(results) {
					let flat = Array.prototype.concat.apply([], results);
					resolve(flat);
				}, function(err) {
					reject(err);
				});
			}).catch((err) => {
				log.error(err);
			});
		});
	}

	/**
	 * Locate a resource by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {Object} options Options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to a list of resources
	 */
	_byPath(virPath, options, trace) {
		return new Promise((resolve, reject) => {
			if (!virPath.startsWith(this._virBasePath) && virPath !== this._virBaseDir) {
				// Neither starts with basePath, nor equals baseDirectory
				if (!options.nodir && this._virBasePath.startsWith(virPath)) {
					resolve(new Resource({
						project: this._project,
						statInfo: { // TODO: make closer to fs stat info
							isDirectory: function() {
								return true;
							}
						},
						path: virPath
					}));
				} else {
					resolve(null);
				}

				return;
			}
			const relPath = virPath.substr(this._virBasePath.length);
			const fsPath = path.join(this._fsBasePath, relPath);

			trace.pathCall();
			fs.stat(fsPath, (err, stat) => {
				if (err) {
					if (err.code === "ENOENT") { // "File or directory does not exist"
						resolve(null);
					} else {
						reject(err);
					}
				} else if (options.nodir && stat.isDirectory()) {
					resolve(null);
				} else {
					let options = {
						project: this._project,
						statInfo: stat,
						path: virPath,
						fsPath
					};

					if (!stat.isDirectory()) {
						// Add content
						options.createStream = () => {
							return fs.createReadStream(fsPath);
						};
					}

					resolve(new Resource(options));
				}
			});
		});
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @private
	 * @param {Resource} resource The Resource
	 * @returns {Promise} Promise resolving once data has been written
	 */
	_write(resource) {
		const relPath = resource.getPath().substr(this._virBasePath.length);
		const fsPath = path.join(this._fsBasePath, relPath);
		const dirPath = path.dirname(fsPath);

		log.verbose("Writing to %s", fsPath);

		return makeDir(dirPath, {
			fs
		}).then(() => {
			return new Promise((resolve, reject) => {
				let contentStream = resource.getStream();
				contentStream.on("error", function(err) {
					reject(err);
				});
				let write = fs.createWriteStream(fsPath);
				write.on("error", function(err) {
					reject(err);
				});
				write.on("close", function(ex) {
					resolve();
				});
				contentStream.pipe(write);
			});
		});
	}
}

module.exports = FileSystem;

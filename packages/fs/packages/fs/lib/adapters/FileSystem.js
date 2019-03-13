const log = require("@ui5/logger").getLogger("resources:adapters:FileSystem");
const path = require("path");
const fs = require("graceful-fs");
const glob = require("globby");
const makeDir = require("make-dir");
const {PassThrough} = require("stream");
const Resource = require("../Resource");
const AbstractAdapter = require("./AbstractAdapter");

/**
 * File system resource adapter
 *
 * @public
 * @alias module:@ui5/fs.adapters.FileSystem
 * @augments module:@ui5/fs.adapters.AbstractAdapter
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
	 * Locate resources by glob.
	 *
	 * @private
	 * @param {Array} patterns Array of glob patterns
	 * @param {Object} [options={}] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	_runGlob(patterns, options = {nodir: true}, trace) {
		return new Promise((resolve, reject) => {
			const opt = {
				cwd: this._fsBasePath,
				dot: true,
				nodir: options.nodir
			};

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
						const fsPath = path.join(this._fsBasePath, matches[i]);
						const virPath = (this._virBasePath + matches[i]);

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
					const flat = Array.prototype.concat.apply([], results);
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
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource>} Promise resolving to a single resource or null if not found
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
					const options = {
						project: this._project,
						statInfo: stat,
						path: virPath,
						fsPath
					};

					if (!stat.isDirectory()) {
						// Add content
						options.createStream = function() {
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
	 * @param {module:@ui5/fs.Resource} resource Resource to write
	 * @param {Object} [options]
	 * @param {boolean} [options.readOnly] Whether the resource content shall be written read-only
	 *						Do not use in conjunction with the <code>drain</code> option.
	 *						The written file will be used as the new source of this resources content.
	 *						Therefore the written file should not be altered by any means.
	 *						Activating this option might improve overall memory consumption.
	 * @param {boolean} [options.drain] Whether the resource content shall be emptied during the write process.
	 *						Do not use in conjunction with the <code>readOnly</code> option.
	 *						Activating this option might improve overall memory consumption.
	 *						This should be used in cases where this is the last access to the resource.
	 *						E.g. the final write of a resource after all processing is finished.
	 * @returns {Promise<undefined>} Promise resolving once data has been written
	 */
	async _write(resource, {drain, readOnly}) {
		if (drain && readOnly) {
			throw new Error(`Error while writing resource ${resource.getPath()}: ` +
				"Do not use options 'drain' and 'readOnly' at the same time.");
		}

		const relPath = resource.getPath().substr(this._virBasePath.length);
		const fsPath = path.join(this._fsBasePath, relPath);
		const dirPath = path.dirname(fsPath);

		log.verbose("Writing to %s", fsPath);

		await makeDir(dirPath, {fs});
		return new Promise((resolve, reject) => {
			let contentStream;

			if (drain || readOnly) {
				// Stream will be drained
				contentStream = resource.getStream();

				contentStream.on("error", (err) => {
					reject(err);
				});
			} else {
				// Transform stream into buffer before writing
				contentStream = new PassThrough();
				const buffers = [];
				contentStream.on("error", (err) => {
					reject(err);
				});
				contentStream.on("data", (data) => {
					buffers.push(data);
				});
				contentStream.on("end", () => {
					const buffer = Buffer.concat(buffers);
					resource.setBuffer(buffer);
				});
				resource.getStream().pipe(contentStream);
			}

			const writeOptions = {};
			if (readOnly) {
				writeOptions.mode = 0o444; // read only
			}

			const write = fs.createWriteStream(fsPath, writeOptions);
			write.on("error", (err) => {
				reject(err);
			});
			write.on("close", (ex) => {
				if (readOnly) {
					// Create new stream from written file
					resource.setStream(function() {
						return fs.createReadStream(fsPath);
					});
				}
				resolve();
			});
			contentStream.pipe(write);
		});
	}
}

module.exports = FileSystem;

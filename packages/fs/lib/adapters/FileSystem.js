import logger from "@ui5/logger";
const log = logger.getLogger("resources:adapters:FileSystem");
import path from "node:path";
import {promisify} from "node:util";
import fs from "graceful-fs";
const copyFile = promisify(fs.copyFile);
const chmod = promisify(fs.chmod);
const mkdir = promisify(fs.mkdir);
import {globby} from "globby";
import {PassThrough} from "node:stream";
import AbstractAdapter from "./AbstractAdapter.js";

const READ_ONLY_MODE = 0o444;

/**
 * File system resource adapter
 *
 * @public
 * @class
 * @alias @ui5/fs/adapters/FileSystem
 * @extends @ui5/fs/adapters/AbstractAdapter
 */
class FileSystem extends AbstractAdapter {
	/**
	 * The Constructor.
	 *
	 * @param {object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 * @param {string} parameters.fsBasePath (Physical) File system path
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 * @param {object} [parameters.project] Experimental, internal parameter. Do not use
	 */
	constructor({virBasePath, project, fsBasePath, excludes}) {
		super({virBasePath, project, excludes});
		this._fsBasePath = path.resolve(fsBasePath);
	}

	/**
	 * Locate resources by glob.
	 *
	 * @private
	 * @param {Array} patterns Array of glob patterns
	 * @param {object} [options={}] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	async _runGlob(patterns, options = {nodir: true}, trace) {
		const opt = {
			cwd: this._fsBasePath,
			dot: true,
			onlyFiles: options.nodir,
			followSymbolicLinks: false
		};
		trace.globCall();

		const promises = [];
		if (!opt.onlyFiles && patterns.includes("")) { // Match physical root directory
			promises.push(new Promise((resolve, reject) => {
				fs.stat(this._fsBasePath, (err, stat) => {
					if (err) {
						reject(err);
					} else {
						resolve(this._createResource({
							project: this._project,
							statInfo: stat,
							path: this._virBaseDir,
							source: {
								adapter: "FileSystem",
								fsPath: this._fsBasePath
							},
							createStream: () => {
								return fs.createReadStream(this._fsBasePath);
							}
						}));
					}
				});
			}));
		}

		// Remove empty string glob patterns
		// Starting with globby v8 or v9 empty glob patterns "" act like "**"
		// Micromatch throws on empty strings. We just ignore them since they are
		// typically caused by our normalization in the AbstractAdapter
		const globbyPatterns = patterns.filter((pattern) => {
			return pattern !== "";
		});
		if (globbyPatterns.length > 0) {
			const matches = await globby(globbyPatterns, opt);
			for (let i = matches.length - 1; i >= 0; i--) {
				promises.push(new Promise((resolve, reject) => {
					const fsPath = path.join(this._fsBasePath, matches[i]);
					const virPath = (this._virBasePath + matches[i]);

					// Workaround for not getting the stat from the glob
					fs.stat(fsPath, (err, stat) => {
						if (err) {
							reject(err);
						} else {
							resolve(this._createResource({
								project: this._project,
								statInfo: stat,
								path: virPath,
								source: {
									adapter: "FileSystem",
									fsPath: fsPath
								},
								createStream: () => {
									return fs.createReadStream(fsPath);
								}
							}));
						}
					});
				}));
			}
		}
		const results = await Promise.all(promises);

		// Flatten results
		return Array.prototype.concat.apply([], results);
	}

	/**
	 * Locate a resource by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {object} options Options
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource>} Promise resolving to a single resource or null if not found
	 */
	_byPath(virPath, options, trace) {
		if (this.isPathExcluded(virPath)) {
			return Promise.resolve(null);
		}

		return new Promise((resolve, reject) => {
			if (!virPath.startsWith(this._virBasePath) && virPath !== this._virBaseDir) {
				// Neither starts with basePath, nor equals baseDirectory
				if (!options.nodir && this._virBasePath.startsWith(virPath)) {
					resolve(this._createResource({
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
						source: {
							adapter: "FileSystem",
							fsPath
						}
					};

					if (!stat.isDirectory()) {
						// Add content
						options.createStream = function() {
							return fs.createReadStream(fsPath);
						};
					}

					resolve(this._createResource(options));
				}
			});
		});
	}

	/**
	 * Writes the content of a resource to a path.
	 *
	 * @private
	 * @param {@ui5/fs/Resource} resource Resource to write
	 * @param {object} [options]
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
		resource = await this._migrateResource(resource);
		super._write(resource);
		if (drain && readOnly) {
			throw new Error(`Error while writing resource ${resource.getPath()}: ` +
				"Do not use options 'drain' and 'readOnly' at the same time.");
		}

		const relPath = resource.getPath().substr(this._virBasePath.length);
		const fsPath = path.join(this._fsBasePath, relPath);
		const dirPath = path.dirname(fsPath);

		await mkdir(dirPath, {recursive: true});

		const resourceSource = resource.getSource();
		if (!resourceSource.modified && resourceSource.adapter === "FileSystem" && resourceSource.fsPath) {
			// fs.copyFile can be used when the resource is from FS and hasn't been modified
			// In addition, nothing needs to be done when src === dest
			if (resourceSource.fsPath === fsPath) {
				log.silly(`Skip writing to ${fsPath} (Resource hasn't been modified)`);
			} else {
				log.silly(`Copying resource from ${resourceSource.fsPath} to ${fsPath}`);
				await copyFile(resourceSource.fsPath, fsPath);
				if (readOnly) {
					await chmod(fsPath, READ_ONLY_MODE);
				}
			}
			return;
		}

		log.silly(`Writing to ${fsPath}`);

		return new Promise((resolve, reject) => {
			let contentStream;

			if ((drain || readOnly) && resourceSource.fsPath !== fsPath) {
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
				writeOptions.mode = READ_ONLY_MODE;
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

export default FileSystem;

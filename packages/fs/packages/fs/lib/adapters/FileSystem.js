import {getLogger} from "@ui5/logger";
const log = getLogger("resources:adapters:FileSystem");
import path from "node:path";
import {promisify} from "node:util";
import fs from "graceful-fs";
const copyFile = promisify(fs.copyFile);
const chmod = promisify(fs.chmod);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);
import {globby, isGitIgnored} from "globby";
import {PassThrough} from "node:stream";
import AbstractAdapter from "./AbstractAdapter.js";

const READ_ONLY_MODE = 0o444;
const ADAPTER_NAME = "FileSystem";
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
	 * @param {string} parameters.virBasePath
	 *   Virtual base path. Must be absolute, POSIX-style, and must end with a slash
	 * @param {string} parameters.fsBasePath
	 *   File System base path. Must be absolute and must use platform-specific path segment separators
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 * @param {object} [parameters.useGitignore=false]
	 *   Whether to apply any excludes defined in an optional .gitignore in the given <code>fsBasePath</code> directory
	 * @param {@ui5/project/specifications/Project} [parameters.project] Project this adapter belongs to (if any)
	 */
	constructor({virBasePath, project, fsBasePath, excludes, useGitignore=false}) {
		super({virBasePath, project, excludes});

		if (!fsBasePath) {
			throw new Error(`Unable to create adapter: Missing parameter 'fsBasePath'`);
		}

		// Ensure path is resolved to an absolute path, ending with a slash (or backslash on Windows)
		// path.resolve will always remove any trailing segment separator
		this._fsBasePath = path.join(path.resolve(fsBasePath), path.sep);
		this._useGitignore = !!useGitignore;
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
			followSymbolicLinks: false,
			gitignore: this._useGitignore,
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
							sourceMetadata: {
								adapter: ADAPTER_NAME,
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
					const virPath = (this._virBasePath + matches[i]);
					const relPath = this._resolveVirtualPathToBase(virPath);
					if (relPath === null) {
						// Match is likely outside adapter base path
						log.verbose(
							`Failed to resolve virtual path of glob match '${virPath}': Path must start with ` +
							`the configured virtual base path of the adapter. Base path: '${this._virBasePath}'`);
						resolve(null);
					}
					const fsPath = this._resolveToFileSystem(relPath);

					// Workaround for not getting the stat from the glob
					fs.stat(fsPath, (err, stat) => {
						if (err) {
							reject(err);
						} else {
							resolve(this._createResource({
								project: this._project,
								statInfo: stat,
								path: virPath,
								sourceMetadata: {
									adapter: ADAPTER_NAME,
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
		return Array.prototype.concat.apply([], results).filter(($) => $);
	}

	/**
	 * Locate a resource by path.
	 *
	 * @private
	 * @param {string} virPath Absolute virtual path
	 * @param {object} options Options
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource>} Promise resolving to a single resource or null if not found
	 */
	async _byPath(virPath, options, trace) {
		const relPath = this._resolveVirtualPathToBase(virPath);

		if (relPath === null) {
			// Neither starts with basePath, nor equals baseDirectory
			if (!options.nodir && this._virBasePath.startsWith(virPath)) {
				// Create virtual directories for the virtual base path (which has to exist)
				// TODO: Maybe improve this by actually matching the base paths segments to the virPath
				return this._createResource({
					project: this._project,
					statInfo: { // TODO: make closer to fs stat info
						isDirectory: function() {
							return true;
						}
					},
					path: virPath
				});
			} else {
				return null;
			}
		}

		const fsPath = this._resolveToFileSystem(relPath);

		trace.pathCall();

		if (this._useGitignore) {
			if (!this._isGitIgnored) {
				this._isGitIgnored = await isGitIgnored({
					cwd: this._fsBasePath
				});
			}
			// Check whether path should be ignored
			if (this._isGitIgnored(fsPath)) {
				// Path is ignored by .gitignore
				return null;
			}
		}

		try {
			const statInfo = await stat(fsPath);
			if (options.nodir && statInfo.isDirectory()) {
				return null;
			}
			const resourceOptions = {
				project: this._project,
				statInfo,
				path: virPath,
				sourceMetadata: {
					adapter: ADAPTER_NAME,
					fsPath
				}
			};

			if (!statInfo.isDirectory()) {
				// Add content as lazy stream
				resourceOptions.createStream = function() {
					return fs.createReadStream(fsPath);
				};
			}

			return this._createResource(resourceOptions);
		} catch (err) {
			if (err.code === "ENOENT") { // "File or directory does not exist"
				return null;
			} else {
				throw err;
			}
		}
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
		resource = this._migrateResource(resource);
		if (resource instanceof Promise) {
			// Only await if the migrate function returned a promise
			// Otherwise await would automatically create a Promise, causing unwanted overhead
			resource = await resource;
		}
		this._assignProjectToResource(resource);
		if (drain && readOnly) {
			throw new Error(`Error while writing resource ${resource.getPath()}: ` +
				"Do not use options 'drain' and 'readOnly' at the same time.");
		}

		const relPath = this._resolveVirtualPathToBase(resource.getPath(), true);
		const fsPath = this._resolveToFileSystem(relPath);
		const dirPath = path.dirname(fsPath);

		await mkdir(dirPath, {recursive: true});

		const sourceMetadata = resource.getSourceMetadata();
		if (sourceMetadata && sourceMetadata.adapter === ADAPTER_NAME && sourceMetadata.fsPath) {
			// Resource has been created by FileSystem adapter. This means it might require special handling

			/* The following code covers these four conditions:
				1. FS-paths not equal + Resource not modified => Shortcut: Use fs.copyFile
				2. FS-paths equal + Resource not modified => Shortcut: Skip write altogether
				3. FS-paths equal + Resource modified => Drain stream into buffer. Later write from buffer as usual
				4. FS-paths not equal + Resource modified => No special handling. Write from stream or buffer
			*/

			if (sourceMetadata.fsPath !== fsPath && !sourceMetadata.contentModified) {
				// Shortcut: fs.copyFile can be used when the resource hasn't been modified
				log.silly(`Resource hasn't been modified. Copying resource from ${sourceMetadata.fsPath} to ${fsPath}`);
				await copyFile(sourceMetadata.fsPath, fsPath);
				if (readOnly) {
					await chmod(fsPath, READ_ONLY_MODE);
				}
				return;
			} else if (sourceMetadata.fsPath === fsPath && !sourceMetadata.contentModified) {
				log.silly(
					`Resource hasn't been modified, target path equals source path. Skipping write to ${fsPath}`);
				if (readOnly) {
					await chmod(fsPath, READ_ONLY_MODE);
				}
				return;
			} else if (sourceMetadata.fsPath === fsPath && sourceMetadata.contentModified) {
				// Resource has been modified. Make sure all streams are drained to prevent
				// issues caused by piping the original read-stream into a write-stream for the same path
				await resource.getBuffer();
			} else {/* Different paths + modifications require no special handling */}
		}

		log.silly(`Writing to ${fsPath}`);

		await new Promise((resolve, reject) => {
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
				writeOptions.mode = READ_ONLY_MODE;
			}

			const write = fs.createWriteStream(fsPath, writeOptions);
			write.on("error", (err) => {
				reject(err);
			});
			write.on("close", (ex) => {
				resolve();
			});
			contentStream.pipe(write);
		});

		if (readOnly) {
			if (sourceMetadata?.fsPath === fsPath) {
				// When streaming into the same file, permissions need to be changed explicitly
				await chmod(fsPath, READ_ONLY_MODE);
			}

			// In case of readOnly, we drained the stream and can now set a new callback
			// for creating a stream from written file
			// This should be identical to buffering the resource content in memory, since the written file
			// can not be modified.
			// We chose this approach to be more memory efficient in scenarios where readOnly is used
			resource.setStream(function() {
				return fs.createReadStream(fsPath);
			});
		}
	}

	_resolveToFileSystem(relPath) {
		const fsPath = path.join(this._fsBasePath, relPath);

		if (!fsPath.startsWith(this._fsBasePath)) {
			log.verbose(`Failed to resolve virtual path internally: ${relPath}`);
			log.verbose(`  Adapter base path: ${this._fsBasePath}`);
			log.verbose(`  Resulting path: ${fsPath}`);
			throw new Error(
				`Error while resolving internal virtual path: '${relPath}' resolves ` +
				`to a directory not accessible by this File System adapter instance`);
		}
		return fsPath;
	}
}

export default FileSystem;

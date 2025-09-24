import path from "node:path/posix";
import {getLogger} from "@ui5/logger";
const log = getLogger("resources:adapters:AbstractAdapter");
import {minimatch} from "minimatch";
import micromatch from "micromatch";
import AbstractReaderWriter from "../AbstractReaderWriter.js";
import Resource from "../Resource.js";

/**
 * Abstract Resource Adapter
 *
 * @abstract
 * @public
 * @class
 * @alias @ui5/fs/adapters/AbstractAdapter
 * @extends @ui5/fs/AbstractReaderWriter
 */
class AbstractAdapter extends AbstractReaderWriter {
	/**
	 * The constructor
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.virBasePath
	 *   Virtual base path. Must be absolute, POSIX-style, and must end with a slash
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 * @param {object} [parameters.project] Experimental, internal parameter. Do not use
	 */
	constructor({virBasePath, excludes = [], project}) {
		if (new.target === AbstractAdapter) {
			throw new TypeError("Class 'AbstractAdapter' is abstract");
		}
		super();

		if (!virBasePath) {
			throw new Error(`Unable to create adapter: Missing parameter 'virBasePath'`);
		}
		if (!path.isAbsolute(virBasePath)) {
			throw new Error(`Unable to create adapter: Virtual base path must be absolute but is '${virBasePath}'`);
		}
		if (!virBasePath.endsWith("/")) {
			throw new Error(
				`Unable to create adapter: Virtual base path must end with a slash but is '${virBasePath}'`);
		}
		this._virBasePath = virBasePath;
		this._virBaseDir = virBasePath.slice(0, -1);
		this._excludes = excludes;
		this._excludesNegated = excludes.map((pattern) => `!${pattern}`);
		this._project = project;
	}
	/**
	 * Locates resources by glob.
	 *
	 * @abstract
	 * @private
	 * @param {string|string[]} virPattern glob pattern as string or an array of
	 *         glob patterns for virtual directory structure
	 * @param {object} [options={}] glob options
	 * @param {boolean} [options.nodir=true] Do not match directories
	 * @param {@ui5/fs/tracing.Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	async _byGlob(virPattern, options = {nodir: true}, trace) {
		const excludes = this._excludesNegated;

		if (!(virPattern instanceof Array)) {
			virPattern = [virPattern];
		}

		// Append static exclude patterns
		virPattern = Array.prototype.concat.apply(virPattern, excludes);
		let patterns = virPattern.map(this._normalizePattern, this);
		patterns = Array.prototype.concat.apply([], patterns);
		if (patterns.length === 0) {
			return [];
		}

		if (!options.nodir) {
			for (let i = patterns.length - 1; i >= 0; i--) {
				const idx = this._virBaseDir.indexOf(patterns[i]);
				if (patterns[i] && idx !== -1 && idx < this._virBaseDir.length) {
					const subPath = patterns[i];
					return [
						this._createResource({
							statInfo: { // TODO: make closer to fs stat info
								isDirectory: function() {
									return true;
								}
							},
							source: {
								adapter: "Abstract"
							},
							path: subPath
						})
					];
				}
			}
		}
		return await this._runGlob(patterns, options, trace);
	}

	/**
	 * Validate if virtual path should be excluded
	 *
	 * @param {string} virPath Virtual Path
	 * @returns {boolean} True if path is excluded, otherwise false
	 */
	_isPathExcluded(virPath) {
		return micromatch(virPath, this._excludes).length > 0;
	}

	/**
	 * Validate if virtual path should be handled by the adapter.
	 * This means that it either starts with the virtual base path of the adapter
	 * or equals the base directory (base path without a trailing slash)
	 *
	 * @param {string} virPath Virtual Path
	 * @returns {boolean} True if path should be handled
	 */
	_isPathHandled(virPath) {
		// Check whether path starts with base path, or equals base directory
		return virPath.startsWith(this._virBasePath) || virPath === this._virBaseDir;
	}

	/**
	 * Normalizes virtual glob patterns.
	 *
	 * @private
	 * @param {string} virPattern glob pattern for virtual directory structure
	 * @returns {string[]} A list of normalized glob patterns
	 */
	_normalizePattern(virPattern) {
		const that = this;
		const mm = new minimatch.Minimatch(virPattern);

		const basePathParts = this._virBaseDir.split("/");

		function matchSubset(subset) {
			let i;
			for (i = 0; i < basePathParts.length; i++) {
				const globPart = subset[i];
				if (globPart === undefined) {
					log.verbose("Ran out of glob parts to match (this should not happen):");
					if (that._project) { // project is optional
						log.verbose(`Project: ${that._project.getName()}`);
					}
					log.verbose(`Virtual base path: ${that._virBaseDir}`);
					log.verbose(`Pattern to match: ${virPattern}`);
					log.verbose(`Current subset (tried index ${i}):`);
					log.verbose(subset);
					return {idx: i, virtualMatch: true};
				}
				const basePathPart = basePathParts[i];
				if (typeof globPart === "string") {
					if (globPart !== basePathPart) {
						return null;
					} else {
						continue;
					}
				} else if (globPart === minimatch.GLOBSTAR) {
					return {idx: i};
				} else { // Regex
					if (!globPart.test(basePathPart)) {
						return null;
					} else {
						continue;
					}
				}
			}
			if (subset.length === basePathParts.length) {
				return {rootMatch: true};
			}
			return {idx: i};
		}

		const resultGlobs = [];
		for (let i = 0; i < mm.set.length; i++) {
			const match = matchSubset(mm.set[i]);
			if (match) {
				let resultPattern;
				if (match.virtualMatch) {
					resultPattern = basePathParts.slice(0, match.idx).join("/");
				} else if (match.rootMatch) { // matched one up
					resultPattern = ""; // root "/"
				} else { // matched at some part of the glob
					resultPattern = mm.globParts[i].slice(match.idx).join("/");
					if (resultPattern.startsWith("/")) {
						resultPattern = resultPattern.substr(1);
					}
				}
				if (mm.negate) {
					resultPattern = "!" + resultPattern;
				}
				resultGlobs.push(resultPattern);
			}
		}
		return resultGlobs;
	}

	_createResource(parameters) {
		if (this._project) {
			parameters.project = this._project;
		}
		return new Resource(parameters);
	}

	_migrateResource(resource) {
		// This function only returns a promise if a migration is necessary.
		// Since this is rarely the case, we therefore reduce the amount of
		// created Promises by making this differentiation

		// Check if its a fs/Resource v3, function 'hasProject' was
		// introduced with v3 therefore take it as the indicator
		if (resource.hasProject) {
			return resource;
		}
		return this._createFromLegacyResource(resource);
	}

	async _createFromLegacyResource(resource) {
		const options = {
			path: resource._path,
			statInfo: resource._statInfo,
			source: resource._source
		};

		if (resource._stream) {
			options.buffer = await resource._getBufferFromStream();
		} else if (resource._createStream) {
			options.createStream = resource._createStream;
		} else if (resource._buffer) {
			options.buffer = resource._buffer;
		}
		return new Resource(options);
	}

	_assignProjectToResource(resource) {
		if (this._project) {
			// Assign project to resource if necessary
			if (resource.hasProject()) {
				if (resource.getProject() !== this._project) {
					throw new Error(
						`Unable to write resource associated with project ` +
						`${resource.getProject().getName()} into adapter of project ${this._project.getName()}: ` +
						resource.getPath());
				}
				return;
			}
			log.silly(`Associating resource ${resource.getPath()} with project ${this._project.getName()}`);
			resource.setProject(this._project);
		}
	}

	_resolveVirtualPathToBase(inputVirPath, writeMode = false) {
		if (!path.isAbsolute(inputVirPath)) {
			throw new Error(`Failed to resolve virtual path '${inputVirPath}': Path must be absolute`);
		}
		// Resolve any ".." segments to make sure we compare the effective start of the path
		// with the virBasePath
		const virPath = path.normalize(inputVirPath);

		if (!writeMode) {
			// When reading resources, validate against path excludes and return null if the given path
			// does not match this adapters base path
			if (!this._isPathHandled(virPath)) {
				if (log.isLevelEnabled("silly")) {
					log.silly(`Failed to resolve virtual path '${inputVirPath}': ` +
						`Resolved path does not start with adapter base path '${this._virBasePath}' or equals ` +
						`base dir: ${this._virBaseDir}`);
				}
				return null;
			}
			if (this._isPathExcluded(virPath)) {
				if (log.isLevelEnabled("silly")) {
					log.silly(`Failed to resolve virtual path '${inputVirPath}': ` +
						`Resolved path is excluded by configuration of adapter with base path '${this._virBasePath}'`);
				}
				return null;
			}
		} else if (!this._isPathHandled(virPath)) {
			// Resolved path is not within the configured base path and does
			// not equal the virtual base directory.
			// Since we don't want to write resources to foreign locations, we throw an error
			throw new Error(
				`Failed to write resource with virtual path '${inputVirPath}': Path must start with ` +
				`the configured virtual base path of the adapter. Base path: '${this._virBasePath}'`);
		}

		const relPath = virPath.substr(this._virBasePath.length);
		return relPath;
	}
}

export default AbstractAdapter;

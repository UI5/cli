import posixPath from "node:path/posix";
import AbstractReader from "../AbstractReader.js";
import ResourceFacade from "../ResourceFacade.js";
import {prefixGlobPattern} from "../resourceFactory.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("resources:readers:Link");

/**
 * A reader that allows for rewriting paths segments of all resources passed through it.
 *
 * ```js
 * import Link from "@ui5/fs/readers/Link";
 * const linkedReader = new Link({
 *     reader: sourceReader,
 *     pathMapping: {
 *          linkPath: `/app`,
 *          targetPath: `/resources/my-app-name/`
 *      }
 * });
 *
 * // The following resolves with a @ui5/fs/ResourceFacade of the resource
 * // located at "/resources/my-app-name/Component.js" in the sourceReader
 * const resource = await linkedReader.byPath("/app/Component.js");
 * ```
 *
 * @public
 * @class
 * @alias @ui5/fs/readers/Link
 * @extends @ui5/fs/AbstractReader
 */
class Link extends AbstractReader {
	/**
	 * Path mapping for a [Link]{@link @ui5/fs/readers/Link}
	 *
	 * @public
	 * @typedef {object} @ui5/fs/readers/Link/PathMapping
	 * @property {string} linkPath Path to match and replace in the requested path or pattern
	 * @property {string} targetPath Path to use as a replacement in the request for the source reader
	 */

	/**
	 * Constructor
	 *
 	 * @public
	 * @param {object} parameters Parameters
	 * @param {object} parameters.name Name of the reader
	 * @param {@ui5/fs/AbstractReader} parameters.reader The resource reader or collection to wrap
	 * @param {@ui5/fs/readers/Link/PathMapping} parameters.pathMapping
	 */
	constructor({name, reader, pathMapping}) {
		super(name);
		if (!reader) {
			throw new Error(`Missing parameter "reader"`);
		}
		if (!pathMapping) {
			throw new Error(`Missing parameter "pathMapping"`);
		}
		this._reader = reader;
		this._pathMapping = pathMapping;
		Link._validatePathMapping(pathMapping);
		// targetPath ends with a slash (enforced by _validatePathMapping), and normalize preserves it.
		// Containment checks rely on that trailing slash to stay segment-aware, so a sibling such as
		// "/resources/application/" is not accepted for "/resources/app/".
		this._normalizedTargetPath = posixPath.normalize(pathMapping.targetPath);
	}

	resolvePattern(patterns) {
		if (!(patterns instanceof Array)) {
			patterns = [patterns];
		}
		patterns = patterns.map((pattern) => {
			if (pattern.startsWith(this._pathMapping.linkPath)) {
				pattern = pattern.substr(this._pathMapping.linkPath.length);
			}
			return prefixGlobPattern(pattern, this._pathMapping.targetPath);
		});

		// Flatten prefixed patterns
		return Array.prototype.concat.apply([], patterns);
	}

	resolvePath(virPath) {
		if (!virPath.startsWith(this._pathMapping.linkPath)) {
			return null;
		}
		const targetPath = posixPath.normalize(
			this._pathMapping.targetPath + virPath.substr(this._pathMapping.linkPath.length));
		if (this._getRelativePath(targetPath) === null) {
			return null;
		}
		return targetPath;
	}

	/**
	 * Locates resources by glob.
	 *
	 * @private
	 * @param {string|string[]} patterns glob pattern as string or an array of
	 *         glob patterns for virtual directory structure
	 * @param {object} options glob options
	 * @param {@ui5/fs/tracing/Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving to list of resources
	 */
	async _byGlob(patterns, options, trace) {
		patterns = this.resolvePattern(patterns);

		const resources = await this._reader._byGlob(patterns, options, trace);
		return resources.flatMap((resource) => {
			const relativePath = this._getRelativePath(resource.getPath());
			if (relativePath !== null) {
				return [new ResourceFacade({
					resource,
					path: this._pathMapping.linkPath + relativePath
				})];
			}
			// Drop resources outside the mapped target path
			return [];
		});
	}

	/**
	 * Locates resources by path.
	 *
	 * @private
	 * @param {string} virPath Virtual path
	 * @param {object} options Options
	 * @param {@ui5/fs/tracing/Trace} trace Trace instance
	 * @returns {Promise<@ui5/fs/Resource>} Promise resolving to a single resource
	 */
	async _byPath(virPath, options, trace) {
		const targetPath = this.resolvePath(virPath);
		if (!targetPath) {
			return null;
		}
		log.silly(`byPath: Rewriting virtual path ${virPath} to ${targetPath}`);

		const resource = await this._reader._byPath(targetPath, options, trace);
		if (resource) {
			const relativePath = this._getRelativePath(resource.getPath());
			if (relativePath !== null) {
				return new ResourceFacade({
					resource,
					path: this._pathMapping.linkPath + relativePath
				});
			}
		}
		return null;
	}

	/**
	 * Resolves a path from the backing reader to its path relative to the mapped target subtree.
	 *
	 * @private
	 * @param {string} resourcePath Path in the backing reader's namespace
	 * @returns {string|null} Path relative to targetPath, or null if the path is outside the subtree
	 */
	_getRelativePath(resourcePath) {
		const normalizedPath = posixPath.normalize(resourcePath);
		// startsWith matches resources inside the subtree, since targetPath ends with a slash.
		// The second check matches the target directory itself, without its trailing slash.
		if (normalizedPath.startsWith(this._normalizedTargetPath) ||
			normalizedPath === this._normalizedTargetPath.slice(0, -1)) {
			return normalizedPath.substr(this._normalizedTargetPath.length);
		}
		return null;
	}

	static _validatePathMapping({linkPath, targetPath}) {
		if (!linkPath) {
			throw new Error(`Path mapping is missing attribute "linkPath"`);
		}
		if (!targetPath) {
			throw new Error(`Path mapping is missing attribute "targetPath"`);
		}
		if (!linkPath.endsWith("/")) {
			throw new Error(`Link path must end with a slash: ${linkPath}`);
		}
		if (!targetPath.endsWith("/")) {
			throw new Error(`Target path must end with a slash: ${targetPath}`);
		}
	}
}

export default Link;

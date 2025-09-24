import AbstractReader from "../AbstractReader.js";
import ResourceFacade from "../ResourceFacade.js";
import {prefixGlobPattern} from "../resourceFactory.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("resources:readers:Link");

/**
 * A reader that allows for rewriting paths segments of all resources passed through it.
 *
 * @example
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
	 * @param {@ui5/fs/AbstractReader} parameters.reader The resource reader or collection to wrap
	 * @param {@ui5/fs/readers/Link/PathMapping} parameters.pathMapping
	 */
	constructor({reader, pathMapping}) {
		super();
		if (!reader) {
			throw new Error(`Missing parameter "reader"`);
		}
		if (!pathMapping) {
			throw new Error(`Missing parameter "pathMapping"`);
		}
		this._reader = reader;
		this._pathMapping = pathMapping;
		Link._validatePathMapping(pathMapping);
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
		patterns = Array.prototype.concat.apply([], patterns);

		// Keep resource's internal path unchanged for now
		const resources = await this._reader._byGlob(patterns, options, trace);
		return resources.map((resource) => {
			const resourcePath = resource.getPath();
			if (resourcePath.startsWith(this._pathMapping.targetPath)) {
				return new ResourceFacade({
					resource,
					path: this._pathMapping.linkPath + resourcePath.substr(this._pathMapping.targetPath.length)
				});
			}
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
		if (!virPath.startsWith(this._pathMapping.linkPath)) {
			return null;
		}
		const targetPath = this._pathMapping.targetPath + virPath.substr(this._pathMapping.linkPath.length);
		log.silly(`byPath: Rewriting virtual path ${virPath} to ${targetPath}`);

		const resource = await this._reader._byPath(targetPath, options, trace);
		if (resource) {
			return new ResourceFacade({
				resource,
				path: this._pathMapping.linkPath + resource.getPath().substr(this._pathMapping.targetPath.length)
			});
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

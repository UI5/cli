const log = require("@ui5/logger").getLogger("resources:adapters:AbstractAdapter");
const minimatch = require("minimatch");
const AbstractReaderWriter = require("../AbstractReaderWriter");

/**
 * Abstract Resource Adapter
 *
 * @abstract
 * @augments AbstractReaderWriter
 */
class AbstractAdapter extends AbstractReaderWriter {
	/**
	 *
	 * @param {Object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 */
	constructor({virBasePath, project}) {
		if (new.target === AbstractAdapter) {
			throw new TypeError("Class 'AbstractAdapter' is abstract");
		}
		super();
		this._virBasePath = virBasePath;
		this._virBaseDir = virBasePath.slice(0, -1);
		this._project = project;
	}

	/**
	 * Locates resources by GLOB.
	 *
	 * @abstract
	 * @private
	 * @param {string|Array} virPattern GLOB pattern as string or an array of glob patterns for virtual directory structure
	 * @param {Object} options GLOB options
	 * @param {Trace} trace Trace instance
	 * @returns {Promise<Resource[]>} Promise resolving to list of resources
	 */
	_byGlob(virPattern, options, trace) {
		if (!(virPattern instanceof Array)) {
			virPattern = [virPattern];
		}
		return Promise.all(virPattern.map(this._normalizePattern, this)).then((patterns) => {
			if (patterns.length === 0) {
				return [];
			}
			patterns = Array.prototype.concat.apply([], patterns);
			return this._runGlob(patterns, options, trace);
		});
	}

	/**
	 * Normalizes virtual GLOB patterns.
	 *
	 * @private
	 * @param {string} virPattern GLOB pattern for virtual directory structure
	 * @returns {Promise<string[]>} Promise resolving to list of normalized GLOB patterns
	 */
	_normalizePattern(virPattern) {
		return Promise.resolve().then(() => {
			const mm = new minimatch.Minimatch(virPattern);

			let basePathParts = this._virBaseDir.split("/");

			function matchSubset(subset) {
				let i;
				for (i = 0; i < basePathParts.length; i++) {
					const globPart = subset[i];
					if (globPart === undefined) {
						log.verbose("Ran out of glob parts to match. This should not happen.");
						return -42;
					}
					const basePathPart = basePathParts[i];
					if (typeof globPart === "string") {
						if (globPart !== basePathPart) {
							return -42;
						} else {
							continue;
						}
					} else if (globPart === minimatch.GLOBSTAR) {
						return i > 0 ? i - 1 : i;
					} else { // Regex
						if (!globPart.test(basePathPart)) {
							return -42;
						} else {
							continue;
						}
					}
				}
				if (subset.length === basePathParts.length) {
					return -1;
				}
				return i;
			}

			const resultGlobs = [];
			for (let i = 0; i < mm.set.length; i++) {
				let matchIdx = matchSubset(mm.set[i]);
				let resultPattern;
				if (matchIdx !== -42) {
					if (matchIdx === -1) { // matched one up
						resultPattern = ""; // root "/"
					} else { // matched at some part of the glob
						resultPattern = mm.globParts[i].slice(matchIdx).join("/");
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
		});
	}
}

module.exports = AbstractAdapter;

const log = require("@ui5/logger").getLogger("resources:adapters:AbstractAdapter");
const minimatch = require("minimatch");
const micromatch = require("micromatch");
const AbstractReaderWriter = require("../AbstractReaderWriter");
const Resource = require("../Resource");

/**
 * Abstract Resource Adapter
 *
 * @abstract
 * @public
 * @memberof module:@ui5/fs.adapters
 * @augments module:@ui5/fs.AbstractReaderWriter
 */
class AbstractAdapter extends AbstractReaderWriter {
	/**
	 * The constructor
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 * @param {object} [parameters.project] Experimental, internal parameter. Do not use
	 */
	constructor({virBasePath, excludes = [], project}) {
		if (new.target === AbstractAdapter) {
			throw new TypeError("Class 'AbstractAdapter' is abstract");
		}
		super();
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
	 * @param {module:@ui5/fs.tracing.Trace} trace Trace instance
	 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving to list of resources
	 */
	_byGlob(virPattern, options = {nodir: true}, trace) {
		const excludes = this._excludesNegated;

		if (!(virPattern instanceof Array)) {
			virPattern = [virPattern];
		}

		// Append static exclude patterns
		virPattern = Array.prototype.concat.apply(virPattern, excludes);

		return Promise.all(virPattern.map(this._normalizePattern, this)).then((patterns) => {
			patterns = Array.prototype.concat.apply([], patterns);
			if (patterns.length === 0) {
				return [];
			}

			if (!options.nodir) {
				for (let i = patterns.length - 1; i >= 0; i--) {
					const idx = this._virBaseDir.indexOf(patterns[i]);
					if (patterns[i] && idx !== -1 && idx < this._virBaseDir.length) {
						const subPath = patterns[i];
						return Promise.resolve([
							new Resource({
								project: this.project,
								statInfo: { // TODO: make closer to fs stat info
									isDirectory: function() {
										return true;
									}
								},
								path: subPath
							})
						]);
					}
				}
			}
			return this._runGlob(patterns, options, trace);
		});
	}

	/**
	 * Validate if virtual path should be excluded
	 *
	 * @param {string} virPath Virtual Path
	 * @returns {boolean} True if path is excluded, otherwise false
	 */
	isPathExcluded(virPath) {
		return micromatch(virPath, this._excludes).length > 0;
	}

	/**
	 * Normalizes virtual glob patterns.
	 *
	 * @private
	 * @param {string} virPattern glob pattern for virtual directory structure
	 * @returns {Promise<string[]>} Promise resolving to list of normalized glob patterns
	 */
	_normalizePattern(virPattern) {
		return Promise.resolve().then(() => {
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
							log.verbose(`Project: ${that._project.metadata.name}`);
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
		});
	}
}

module.exports = AbstractAdapter;

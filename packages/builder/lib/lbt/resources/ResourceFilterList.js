
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:resources:ResourceFilterList");

const FILTER_PREFIXES = /^[-!+]/;

function makeFileTypePattern(fileTypes) {
	if ( fileTypes == null ) {
		return undefined;
	}
	return "(?:" + fileTypes.map((type) => {
		if ( !type.startsWith(".") ) {
			type = "." + type;
		}
		return type.replace(/[*+?.()|^$\\]/g, "\\$&");
	}).join("|") + ")";
}

function makeMatcher(globPattern, fileTypesPattern) {
	const result = {
		pattern: globPattern,
		include: true
	};

	// cut off leading '!', '-' or '+'
	if ( FILTER_PREFIXES.test(globPattern) ) {
		result.include = globPattern[0] === "+";
		globPattern = globPattern.slice(1);
	}

	// normalize some convenience shortcuts
	// - a lonely 'any sub-path' pattern implies the 'any file' pattern:
	//      "**/" --> "**/*"
	// - a trailing 'any sub-path' pattern also implies the 'any file' pattern:
	//      ".../foo/**/" --> "../foo/**/*"
	// - any other trailing slash matches any files in any sub-folder:
	//      ".../foo/" --> ".../foo/**/*"
	if ( globPattern.endsWith("/") ) {
		if ( globPattern === "**/" || globPattern.endsWith("/**/") ) {
			globPattern = globPattern + "*";
		} else {
			globPattern = globPattern + "**/*";
		}
	}

	// check for wildcards
	if ( /\*/.test(globPattern) ) {
		// Transform the globPattern into a regular expression pattern by converting
		// the "all sub-directories" pattern "/**/" and the "any file name" pattern "*"
		// to their respective regexp counterparts and escape all other regexp special
		// characters.
		let regexp = globPattern.replace(/^\*\*\/|\/\*\*\/|\*|[[\]{}()+?.\\^$|]/g, (match) => {
			switch (match) {
			case "**/": return "(?:[^/]+/)*";
			case "/**/": return "/(?:[^/]+/)*";
			case "*": return "[^/]*";
			default: return "\\" + match;
			}
		});

		// if the pattern ended with an asterisk and if a default file type pattern is defined,
		// add that pattern. This limits the matches to the specified set of file types
		if ( fileTypesPattern != null && regexp.endsWith("[^/]*") ) {
			regexp = regexp + fileTypesPattern;
		}

		result.regexp = new RegExp("^" + regexp + "$");
		result.calcMatch = result.include ? function(candidate, matchSoFar) {
			return matchSoFar || this.regexp.test(candidate);
		} : function(candidate, matchSoFar) {
			return matchSoFar && !this.regexp.test(candidate);
		};

		log.verbose(`  ${result.pattern} --> ${result.include ? "include" : "exclude"}: /${result.regexp.source}/`);
	} else {
		result.value = globPattern;
		log.verbose(`  ${result.pattern} --> ${result.include ? "include" : "exclude"}: "${globPattern}"`);
		result.calcMatch = result.include ? function(candidate, matchSoFar) {
			return matchSoFar || candidate === this.value;
		} : function(candidate, matchSoFar) {
			return matchSoFar && candidate !== this.value;
		};
	}

	return result;
}

/**
 * Helper class to manage multiple resource name filters.
 *
 * Each filter can be flagged as include or exclude.
 * Order of the filters is significant.
 *
 * @author Frank Weigel
 * @since 1.16.2
 * @private
 */
export default class ResourceFilterList {
	constructor(filters, fileTypes) {
		this.matchers = [];
		this.matchByDefault = true;
		this.fileTypes = makeFileTypePattern(fileTypes);
		log.verbose(`Filetypes: ${fileTypes}`);
		this.addFilters(filters);
	}

	addFilters(filters) {
		if ( Array.isArray(filters) ) {
			filters.forEach( (filter) => {
				const matcher = makeMatcher(filter, this.fileTypes);
				this.matchers.push( matcher );
				this.matchByDefault = this.matchByDefault && !matcher.include;
			});
		} else if ( filters != null ) {
			throw new Error("unsupported filter " + filters);
		}
		return this;
	}

	matches(candidate, initialMatch) {
		return this.matchers.reduce(
			(acc, cur) => cur.calcMatch(candidate, acc),
			initialMatch == null ? this.matchByDefault : initialMatch
		);
	}

	toString() {
		return this.matchers.map((matcher) => matcher.pattern).join(",");
	}

	/**
	 * Converts the filter list to glob patterns for use with UI5 FS APIs.
	 *
	 * This method analyzes the sequential include/exclude filters and attempts to convert them
	 * to glob patterns. However, some sequential filter combinations cannot be fully expressed
	 * as glob patterns (e.g., excluding a path then re-including a subset of it).
	 *
	 * @returns {{
	 *   positivePatterns: string[],
	 *   negativePatterns: string[],
	 *   requiresPostFiltering: boolean
	 * }} Object containing:
	 *   - positivePatterns: Array of glob patterns to include
	 *   - negativePatterns: Array of glob patterns to exclude
	 *   - requiresPostFiltering: True if the sequential filter semantics cannot be fully
	 *     preserved with glob patterns alone and additional filtering via matches() is needed
	 */
	toGlobPatterns() {
		const positivePatterns = [];
		const negativePatterns = [];
		let requiresPostFiltering = false;

		// Special case: if matchByDefault is true and we have no includes yet,
		// we need a wildcard positive pattern
		let needsWildcard = this.matchByDefault;

		// Track if we've seen exclusions followed by inclusions that overlap
		// This indicates we need post-filtering to preserve sequential semantics
		let hasExcludeBeforeInclude = false;

		for (let i = 0; i < this.matchers.length; i++) {
			const matcher = this.matchers[i];
			const pattern = matcher.value || matcher.regexp?.source;

			if (!pattern) {
				continue;
			}

			// Convert pattern to glob-compatible format
			let globPattern;
			if (matcher.regexp) {
				// Convert internal regexp back to glob-like pattern
				// This is a simplified conversion - the original pattern is stored in matcher.pattern
				globPattern = matcher.pattern;
			} else {
				// String match - use as-is
				globPattern = pattern;
			}

			// Remove prefix markers (+, -, !)
			globPattern = globPattern.replace(/^[+\-!]/, "");

			if (matcher.include) {
				// Check if we had any excludes before this include
				if (negativePatterns.length > 0) {
					// Check if this include could potentially overlap with previous excludes
					// For now, conservatively mark as requiring post-filtering
					hasExcludeBeforeInclude = true;
				}
				// Once we have an include, we don't need the wildcard
				needsWildcard = false;
				positivePatterns.push(globPattern);
			} else {
				negativePatterns.push(globPattern);
			}
		}

		// If we have includes after excludes, we might need post-filtering
		// to handle re-inclusion scenarios that glob patterns can't express
		if (hasExcludeBeforeInclude) {
			requiresPostFiltering = true;
		}

		// Add wildcard if needed (only excludes with matchByDefault=true)
		if (needsWildcard) {
			positivePatterns.unshift("**/*");
		}

		return {
			positivePatterns,
			negativePatterns,
			requiresPostFiltering
		};
	}

	/**
	 * Each filter entry can be a comma separated list of simple filters. Each simple filter
	 * can be a pattern in resource name pattern syntax: A double asterisk '&0x2a;&0x2a;/' denotes an arbitrary
	 * number of resource name segments (folders) incl. a trailing slash, whereas a simple asterisk '*'
	 * denotes an arbitrary number of resource name characters, but not the segment separator '/'.
	 * A dot is interpreted as a dot, all other special regular expression characters keep their
	 * special meaning. This is a mixture of ANT-style path patterns and regular expressions.
	 *
	 * Excludes can be denoted by a leading '-' or '!', includes optionally by a leading '+'.
	 * Order of filters is significant, a later exclusion overrides an earlier inclusion
	 * and vice versa.
	 *
	 * Example:
	 * <pre>
	 *	 !sap/ui/core/
	*	 +sap/ui/core/utils/
	* </pre>
	* excludes everything from sap/ui/core, but includes everything from the subpackage sap/ui/core/utils/.
	*
	* Note that the filter operates on the full name of each resource. If a resource name
	* <code>prefix</code> is configured for a resource set, the filter will be applied
	* to the combination of prefix and local file path and not only to the local file path.
	*
	* @param {string} filterStr comma separated list of simple filters
	* @returns {ResourceFilterList}
	*/
	static fromString(filterStr) {
		const result = new ResourceFilterList();
		if ( filterStr != null ) {
			result.addFilters( filterStr.trim().split(/\s*,\s*/).filter(Boolean) );
		}
		return result;
	}
}

export function negateFilters(patterns) {
	return patterns.map((pattern) => {
		let include = true;

		// cut off leading '!', '-' or '+'
		if (FILTER_PREFIXES.test(pattern)) {
			include = pattern[0] === "+";
			pattern = pattern.slice(1);
		}

		if (include) {
			// include => exclude
			return "!" + pattern;
		} else {
			// exclude => include
			return "+" + pattern;
		}
	});
}

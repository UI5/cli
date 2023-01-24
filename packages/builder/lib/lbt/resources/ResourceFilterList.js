
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
		return type.replace(/[*+?.()|^$]/g, "\\$&");
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

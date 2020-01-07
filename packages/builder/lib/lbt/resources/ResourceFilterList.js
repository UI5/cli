"use strict";

const log = require("@ui5/logger").getLogger("lbt:resources:ResourceFilterList");

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
	if ( /^[-!+]/.test(globPattern) ) {
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
class ResourceFilterList {
	constructor(filters, fileTypes) {
		this.matchers = [];
		this.matchByDefault = true;
		this.fileTypes = makeFileTypePattern(fileTypes);
		log.verbose(`filetypes: ${fileTypes}`);
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
}

ResourceFilterList.fromString = function(filterStr) {
	const result = new ResourceFilterList();
	if ( filterStr != null ) {
		result.addFilters( filterStr.trim().split(/\s*,\s*/).filter(Boolean) );
	}
	return result;
};

module.exports = ResourceFilterList;

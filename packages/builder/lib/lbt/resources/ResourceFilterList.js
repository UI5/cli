"use strict";

const log = require("@ui5/logger").getLogger("lbt:resources:ResourceFilterList");

function makeMatcher(globPattern) {
	let result = {
		pattern: globPattern,
		include: true
	};

	// cut off leading '!', '-' or '+'
	if ( /^[-!+]/.test(globPattern) ) {
		result.include = globPattern[0] === "+";
		globPattern = globPattern.slice(1);
	}

	// check for wildcards
	if ( /\*|\/$/.test(globPattern) ) {
		if ( !/\/\*\*\/$/.test(globPattern) ) {
			globPattern = globPattern.replace(/\/$/, "/**/");
		}

		let regexp = globPattern.replace(/\*\*\/|\*|[[\]{}()+?.\\^$|]/g, function(match) {
			switch (match) {
			case "**/": return "(?:[^/]+/)*";
			case "*": return "[^/]*";
			default: return "\\" + match;
			}
		});

		log.verbose("%s -> %s,%s", result.pattern, "^" + regexp, result.include ? "include" : "exclude" );
		result.regexp = new RegExp("^" + regexp);
		result.calcMatch = result.include ? function(candidate, matchSoFar) {
			return matchSoFar || this.regexp.test(candidate);
		} : function(candidate, matchSoFar) {
			return matchSoFar && !this.regexp.test(candidate);
		};
	} else {
		result.value = globPattern;
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
 * TODO Share with plugins, esp. coldWater, lightening, ...
 */
class ResourceFilterList {
	constructor(filters) {
		this.matchers = [];
		this.matchByDefault = true;
		this.addFilters(filters);
	}

	addFilters(filters) {
		if ( Array.isArray(filters) ) {
			filters.forEach( (filter) => {
				const matcher = makeMatcher(filter);
				this.matchers.push( matcher );
				this.matchByDefault = this.matchByDefault && !matcher.include;
			});
		} else if ( filters != null ) {
			throw new Error("unsupported filter " + filters);
		}
		return this;
	}

	/* NODE-TODO
	public ResourceFilterList addIncludes(String[] includes){
		if ( includes != null ) {
			for(String include : includes) {
				add(include, false);
			}
		}
		return this;
	}

	public ResourceFilterList addExcludes(String[] excludes) {
		if ( excludes != null ) {
			for(String exclude : excludes) {
				add(exclude, true);
			}
		}
		return this;
	}

	/**
	 * old style resource pattern (from old Optimizer)
	 * @param excludePattern
	 * @deprecated Use the more flexible add or addFilters instead.
	 *
	public void addExcludePattern(Pattern excludePattern) {
		isExclude.set(patterns.size(), true);
		patterns.add(excludePattern);
	}

	public ResourceFilterList add(String patternList, boolean exclude) {
		for(String pattern : patternList.trim().split("\\s*,\\s*")) {
			if ( !pattern.isEmpty() ) {
				isExclude.set(patterns.size(), exclude);
				patterns.add(ModuleNamePattern.createRegEx(pattern, ignoreCase));
				hasInclude = hasInclude || !exclude;
			}
		}
		return this;
	}

	public ResourceFilterList add(String patternList) {
		for(String pattern : patternList.trim().split("\\s*,\\s*")) {
			if ( !pattern.isEmpty() ) {
				boolean exclude = pattern.startsWith("!") || pattern.startsWith("-");
				isExclude.set(patterns.size(), exclude);
				patterns.add(ModuleNamePattern.createRegEx(exclude || pattern.startsWith("+")
					? pattern.substring(1) : pattern, ignoreCase));
				hasInclude = hasInclude || !exclude;
			}
		}
		return this;
	} */

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
	let result = new ResourceFilterList();
	if ( filterStr != null ) {
		result.addFilters( filterStr.trim().split(/\s*,\s*/) );
	}
	return result;
};

module.exports = ResourceFilterList;


/**
 * Creates a ModuleName from a string in UI5 module name syntax.
 *
 * @private
 * @param {string} name String that represents a UI5 module name (dot separated)
 * @param {string} [suffix='.js'] Suffix to add to the resulting resource name
 * @returns {string} URN representing the same resource
 */
export function fromUI5LegacyName(name, suffix) {
	// UI5 only supports a few names with dots in them, anything else will be converted to slashes
	if ( name.startsWith("sap.ui.thirdparty.jquery.jquery-") ) {
		name = "sap/ui/thirdparty/jquery/jquery-" + name.slice("sap.ui.thirdparty.jquery.jquery-".length);
	} else if ( name.startsWith("jquery.sap.") || name.startsWith("jquery-") ) {
		// do nothing
	} else {
		name = name.replace(/\./g, "/");
	}
	return name + (suffix || ".js");
}

export function toUI5LegacyName(path) {
	if ( !path.endsWith(".js") ) {
		throw new Error("can't convert a non-JS resource name " + path + " to a UI5 module name");
	}
	const moduleName = path.slice(0, -3);
	if ( moduleName.startsWith("sap/ui/thirdparty/jquery/jquery-") ) {
		return "sap.ui.thirdparty.jquery.jquery-" + moduleName.slice("sap/ui/thirdparty/jquery/jquery-".length);
	} else if ( moduleName.startsWith("jquery.sap.") || moduleName.startsWith("jquery-") ) {
		return moduleName;
	} else {
		return moduleName.replace(/\//g, ".");
	}
}

export function fromRequireJSName(name) {
	return name + ".js";
}

export function toRequireJSName(path) {
	if ( !path.endsWith(".js") ) {
		throw new Error("can't convert a non-JS resource name " + path + " to a requireJS module name");
	}
	return path.slice(0, -3); // cut off '.js'
}

const KNOWN_TYPES = /\.(properties|css|(?:(?:view\.|fragment\.)?(?:html|json|xml|js))|(?:(?:controller\.|designtime\.|support\.)?js))$/;

export function getDebugName(name) {
	const m = KNOWN_TYPES.exec(name);
	if ( m && ( m[0].endsWith(".css") || m[0].endsWith(".js") ) && !name.slice(0, m.index).endsWith("-dbg") ) {
		return name.slice(0, m.index) + "-dbg" + m[0];
	}
	return null;
}

export function getNonDebugName(name) {
	const m = KNOWN_TYPES.exec(name);
	if ( m && ( m[0].endsWith(".css") || m[0].endsWith(".js") ) && name.slice(0, m.index).endsWith("-dbg") ) {
		return name.slice(0, m.index - "-dbg".length) + m[0];
	}
	return null;
}

const ANY_SPECIAL_PATH_SEGMENT = /(?:^|\/)\.+\//;
const SPECIAL_PATH_SEGMENT = /^\.+$/;

export function resolveRelativePath(path, relativePath) {
	// while has segment
	//	 if ( segment == . )
	//			ignore segment
	//	 else if segment == ..
	//			remove one segment from stack, throw exception if there is none
	//	 else
	//			add segment to stack
	// combine segments in stack with '/'

	const match = ANY_SPECIAL_PATH_SEGMENT.exec(relativePath);
	if ( match ) {
		// process segments only if there is at least one special segment
		let segments = [];

		const p = path.lastIndexOf("/");
		if ( match.index == 0 && p > 0 ) {
			// if first segment is ./ or ../, start with parent path, otherwise start empty
			segments = path.slice(0, p).split("/");
		}

		const relativePathSegments = relativePath.split("/");
		for ( let i = 0; i < relativePathSegments.length; i++ ) {
			const segment = relativePathSegments[i];
			if ( SPECIAL_PATH_SEGMENT.test(segment) ) {
				switch ( segment.length ) {
				case 1:
					// segment './' -> ignore
					continue;
				case 2:
					// segment '../' -> navigate to parent if possible
					if ( segments.length === 0 ) {
						throw new Error(`Can't navigate to parent of root (${path}, ${relativePath})`);
					}
					segments.pop();
					break;
				default:
					// segment '...' or more dots: not allowed
					throw new Error(`Illegal path segment '${segment}'`);
				}
			} else {
				// normal segment: add
				segments.push(segment);
			}
		}
		// console.log("resolution of (%s,%s): %s%n", getPackagePath(), relativePath, StringUtils.join(segments, "/"));
		relativePath = segments.join("/");
	}
	return relativePath;
}

export function resolveRelativeRequireJSName(path, relativeName) {
	return resolveRelativePath(path, relativeName + ".js");
}


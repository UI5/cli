/**
 * Used by the ResourcePool to read raw module info as stored in the .library files.
 * It does not (yet) analyze dependencies of the library and therefore isn't part of the analyzer package (yet).
 */
import xml2js from "xml2js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:resources:LibraryFileAnalyzer");

const parser = new xml2js.Parser({
	// explicitChildren: true,
	preserveChildrenOrder: true,
	xmlns: true
});

/*
 * Helper to simplify access to node attributes.
 */
function getAttribute(node, attr) {
	return (node.$ && node.$[attr] && node.$[attr].value) || null;
}

/*
 * Analyzes the given XML2JS object `rawModule` and creates a rawInfo object from it.
 * @param {object} rawModule XML2JS object, representing a &lt;raw-module&gt; node from a .library file
 * @returns {{name:string,dependencies?:string[],requiresTopLevelScope?:boolean,ignoredGlobals?:string[]}
 */
function createRawInfo(rawModule) {
	const name = getAttribute(rawModule, "name");
	if ( name ) {
		const rawInfo = {
			name,
			rawModule: true,
			dependencies: []
		};
		const deps = getAttribute(rawModule, "depends");
		if ( deps != null ) {
			rawInfo.dependencies = deps.trim().split(/\s*,\s*/);
		}
		const requiresTopLevelScope = getAttribute(rawModule, "requiresTopLevelScope");
		if ( requiresTopLevelScope ) {
			rawInfo.requiresTopLevelScope = requiresTopLevelScope === "true";
		}
		const ignoredGlobals = getAttribute(rawModule, "ignoredGlobals");
		if ( ignoredGlobals ) {
			rawInfo.ignoredGlobals = ignoredGlobals.trim().split(/\s*,\s*/);
		}
		return rawInfo;
	}
}

export function getDependencyInfos( name, content ) {
	const infos = Object.create(null);
	parser.parseString(content, (err, result) => {
		if ( result &&
				result.library &&
				Array.isArray(result.library.appData) &&
				result.library.appData.length >= 1 &&
				Array.isArray(result.library.appData[0].packaging) ) {
			result.library.appData[0].packaging.forEach( (packaging) => {
				if ( packaging.$ns &&
						packaging.$ns.uri === "http://www.sap.com/ui5/buildext/packaging" &&
						Array.isArray(packaging["module-infos"]) ) {
					packaging["module-infos"].forEach( function(moduleInfos) {
						moduleInfos["raw-module"] && moduleInfos["raw-module"].forEach( (rawModule) => {
							const rawInfo = createRawInfo(rawModule);
							if ( rawInfo ) {
								log.verbose(name + " rawInfo: " + JSON.stringify(rawInfo));
								infos[rawInfo.name] = rawInfo;
							}
						});
					});
				}
			});
		}
	});
	// console.log("done", infos);
	return infos;
}

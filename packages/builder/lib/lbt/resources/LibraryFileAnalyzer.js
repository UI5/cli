/**
 * Used by the ResourcePool to read raw module info as stored in the .liubrary files.
 * It does not (yet) analyze dependencies of the library and therefore isn't part of the analyzer package (yet).
 */
"use strict";

const xml2js = require("xml2js");
const ModuleInfo = require("./ModuleInfo");

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

function makeModuleInfo(rawModule) {
	const name = getAttribute(rawModule, "name");
	const deps = getAttribute(rawModule, "depends");
	if ( name ) {
		const info = new ModuleInfo(name);
		if ( deps != null ) {
			deps.trim().split(/\s*,\s*/).forEach( (dep) => info.addDependency(dep) );
		}
		info.rawModule = true;
		info.requiresTopLevelScope = getAttribute(rawModule, "requiresTopLevelScope") === "true";
		const ignoredGlobals = getAttribute(rawModule, "ignoredGlobals");
		if ( ignoredGlobals ) {
			info.ignoredGlobals = ignoredGlobals.trim().split(/\s*,\s*/);
		}
		// console.log(info);
		return info;
	}
}

function getDependencyInfos( content ) {
	const infos = {};
	parser.parseString(content, (err, result) => {
		// console.log(JSON.stringify(result, null, '\t'));
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
							const info = makeModuleInfo(rawModule);
							if ( info ) {
								infos[info.name] = info;
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

module.exports.getDependencyInfos = getDependencyInfos;

"use strict";
const {parseJS, Syntax} = require("../utils/parseUtils");
const {getPropertyKey, isMethodCall, isIdentifier, getStringArray} = require("../utils/ASTUtils");
const VisitorKeys = require("estraverse").VisitorKeys;

const CALL__SAP_UI_GETCORE = ["sap", "ui", "getCore"];

/*
 * Static Code Analyzer that extracts library information from the sap.ui.getCore().initLibrary()
 * call in a library.js module.
 */
async function analyze(resource) {
	const libInfo = {
		noLibraryCSS: false,
		types: [],
		controls: [],
		elements: [],
		interfaces: []
	};

	function visit(node) {
		if ( node.type == Syntax.CallExpression &&
				node.callee.type === Syntax.MemberExpression &&
				isMethodCall(node.callee.object, CALL__SAP_UI_GETCORE) &&
				isIdentifier(node.callee.property, "initLibrary") &&
				node.arguments.length === 1 &&
				node.arguments[0].type === Syntax.ObjectExpression ) {
			node.arguments[0].properties.forEach( (prop) => {
				const key = getPropertyKey(prop);
				const value = prop.value;
				if ( key === "noLibraryCSS" &&
						(value.type === Syntax.Literal && typeof value.value === "boolean") ) {
					libInfo.noLibraryCSS = value.value;
				} else if ( key === "types" && value.type == Syntax.ArrayExpression ) {
					libInfo.types = getStringArray(value, true);
				} else if ( key === "interfaces" && value.type == Syntax.ArrayExpression ) {
					libInfo.interfaces = getStringArray(value, true);
				} else if ( key === "controls" && value.type == Syntax.ArrayExpression ) {
					libInfo.controls = getStringArray(value, true);
				} else if ( key === "elements" && value.type == Syntax.ArrayExpression ) {
					libInfo.elements = getStringArray(value, true);
				}
			});

			return true; // abort, we're done
		}

		for ( const key of VisitorKeys[node.type] ) {
			const child = node[key];
			if ( Array.isArray(child) ) {
				if ( child.some(visit) ) {
					return true;
				}
			} else if ( child ) {
				if ( visit(child) ) {
					return true;
				}
			}
		}

		return false;
	}

	const code = await resource.getBuffer();
	visit( parseJS(code) );

	return libInfo;
}

/**
 * Creates a new analyzer and executes it on the given resource.
 *
 * If the resources exists and can be parsed as JavaScript and if an sap.ui.getCore().initLibrary()
 * call is found in the code, then the following information will be set:
 * <ul>
 * <li>noLibraryCSS: false when the noLibraryCSS property had been set in the initLibrary info object)</li>
 * <li>types: string array with the names of the types contained in the library</li>
 * <li>controls: string array with the names of the controls defined in the library</li>
 * <li>elements: string array with the names of the elements defined in the library</li>
 * <li>interfaces: string array with the names of the interfaces defined in the library</li>
 * </ul>
 *
 * Note: only the first initLibrary() call that is found with a DFS on the AST, will be evaluated.
 *
 * @param {module:@ui5/fs.Resource} resource library.js resource whose content should be analyzed
 * @returns {Promise<object>} A Promise on the extract info object
 */
module.exports = function(resource) {
	if ( resource == null ) {
		return Promise.resolve({});
	}
	return analyze(resource);
};

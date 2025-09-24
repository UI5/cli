
import {parseJS, Syntax, VisitorKeys} from "../utils/parseUtils.js";
import {getPropertyKey, isMethodCall, isIdentifier, getStringArray} from "../utils/ASTUtils.js";
import SapUiDefineCall from "../calls/SapUiDefine.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:analyzer:LibraryJS");

const CALL__SAP_UI_GETCORE = ["sap", "ui", "getCore"];
const CALL_SAP_UI_DEFINE = ["sap", "ui", "define"];
const CALL_AMD_DEFINE = ["define"];
const AMD__LIB_INIT_RESOURCES = [
	// Dependency definition, init library method name
	["sap/ui/core/Core.js", "initLibrary"],
	["sap/ui/core/Lib.js", "init"]
];

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

	const code = await resource.getBuffer();
	const rootNode = parseJS(code);
	let analyzedDefineCall = null;
	visit( rootNode );

	function visit(node) {
		if ( node.type === Syntax.CallExpression ) {
			// Define call would always be at the top of the tree, so it'd
			// be the first significant thing that's been found.
			analyzedDefineCall = analyzedDefineCall || analyzeSapUiDefineCalls(node);

			if (isInitLibraryCall(node)) {
				node.arguments[0].properties.forEach( (prop) => {
					if (prop.type === Syntax.SpreadElement) {
						// SpreadElements are currently not supported
						return;
					}

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
					} else if ( ["designtime", "dependencies", "extensions", "name", "version"].includes(key) ) {
						// do nothing, for all other supported properties
					} else if ( key === "apiVersion" &&
						(value.type === Syntax.Literal && typeof value.value === "number") ) {
						// just a validation
					} else {
						log.error(
							"Unexpected property '" + key +
							"' or wrong type for '" + key +
							"' for a library initialization call in '" + resource.getPath() + "'"
						);
					}
				});

				return true; // abort, we're done
			}
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

	/**
	 * Finds and extracts dependencies from sap.ui.define call
	 *
	 * @param {Node} node
	 * @returns {SapUiDefineCall}
	 */
	function analyzeSapUiDefineCalls(node) {
		// Analyze sap.ui.define calls
		if ( [CALL_AMD_DEFINE, CALL_SAP_UI_DEFINE].some(
			(defCall) => isMethodCall(node, defCall)) ) {
			const defCall = new SapUiDefineCall(node, resource.getName());

			return AMD__LIB_INIT_RESOURCES
				// Resolve dependency variable names.
				.map((dependency) => [defCall.findImportName(dependency[0]), dependency[1]])
				// Remove potential dependencies that are not actually present.
				.filter((dependency) => dependency[0]);
		}

		return null;
	}

	/**
	 * Determines whether the node is an initLibrary call.
	 *
	 * @param {Node} node
	 * @returns {boolean}
	 */
	function isInitLibraryCall(node) {
		// sap.ui.getCore()
		if (
			node.type == Syntax.CallExpression &&
			node.callee.type === Syntax.MemberExpression &&
			isMethodCall(node.callee.object, CALL__SAP_UI_GETCORE) &&
			isIdentifier(node.callee.property, "initLibrary") &&
			node.arguments.length === 1 &&
			node.arguments[0].type === Syntax.ObjectExpression
		) {
			return true;
		}

		// Find a CallExpression that is initLibrary
		// i.e. node.callee.object === "Core" && node.callee.property === "initLibrary"
		if (
			node.type === Syntax.CallExpression &&
			node.callee.type === Syntax.MemberExpression &&
			analyzedDefineCall &&
			analyzedDefineCall.some((potentialDependency) =>
				isMethodCall(node, potentialDependency)
			) &&
			node.arguments.length === 1 &&
			node.arguments[0].type === Syntax.ObjectExpression
		) {
			return true;
		}

		return false;
	}

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
 * @param {@ui5/fs/Resource} resource library.js resource whose content should be analyzed
 * @returns {Promise<object>} A Promise on the extract info object
 */
export default function(resource) {
	if ( resource == null ) {
		return Promise.resolve({});
	}
	return analyze(resource);
}

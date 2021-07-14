"use strict";

const {Syntax, VisitorKeys} = require("../utils/parseUtils");
const escope = require("escope");
const ModuleName = require("../utils/ModuleName");
const {Format: ModuleFormat} = require("../resources/ModuleInfo");
const UI5ClientConstants = require("../UI5ClientConstants");
const {findOwnProperty, getLocation, getPropertyKey, isMethodCall, isString} = require("../utils/ASTUtils");
const log = require("@ui5/logger").getLogger("lbt:analyzer:JSModuleAnalyzer");

// ------------------------------------------------------------------------------------------------------------------

const EnrichedVisitorKeys = (function() {
	function toBeDone() {
		return null;
	}

	/*
	 * The following object contains for each known estree node type
	 * a list of visitor keys that represent conditionally executed code branches.
	 * E.g. in an IfExpression, the 'test' is always executed, whereas 'consequent'
	 * and 'alternate' are only executed under certain conditions.
	 *
	 * While visiting the AST of a JavaScript file, the JSModuleAnalyzer uses this information
	 * to decide whether a code block is executed conditionally or unconditionally.
	 * Besides this information which is inherent to the language, the analyzer uses
	 * additional knowledge about special APIS / constructs (e.g. the factory function of
	 * an AMD module is known to be executed when the module is executed, an IIFE is known to
	 * be executed etc.)
	 *
	 * To be more robust against the evolution of the language, the object below is checked
	 * against the 'official' list of node types and node keys as defined by 'estraverse'.
	 * This helps to ensure that no new syntax addition is missed and that the configured
	 * keys are valid.
	 */
	const TempKeys = {
		AssignmentExpression: [],
		/*
		 * function( >>>a=3<<<, b) {...}
		 * var [>>>a=3<<<, b] = [...];
		 *
		 * The default value expression (right) is only evaluated when there's no other value in
		 * the context of the pattern (e.g. destructuring or function call don't provide a value),
		 * so it's a conditional branch.
		 */
		AssignmentPattern: ["right"],
		ArrayExpression: [],
		/*
		 * var >>>[a=3, b]<<< = [...];
		 * All elements in an array pattern are unconditional.
		 */
		ArrayPattern: [], // elements
		/*
		 * The body of an arrow function is only executed when the arrow function is executed
		 */
		ArrowFunctionExpression: ["body"],
		/*
		 * The argument of await is always executed
		 * TODO how to handle code after the await expression?
		 */
		AwaitExpression: [], // argument
		BlockStatement: [],
		BinaryExpression: [],
		BreakStatement: [],
		CallExpression: [], // special handling
		CatchClause: ["param", "body"],
		ClassBody: [],
		ClassDeclaration: [],
		ClassExpression: [],
		// ComprehensionBlock: toBeDone(["left", "right"]),	// CAUTION: It's deferred to ES7.
		// ComprehensionExpression: toBeDone(),	// CAUTION: It's deferred to ES7.
		ConditionalExpression: ["consequent", "alternate"],
		ContinueStatement: [],
		DebuggerStatement: [],
		/*
		 * 'condition' is executed on the same conditions as the surrounding block, potentially repeated,
		 * 'block' is always entered and might be repeated
		 */
		DoWhileStatement: [],
		EmptyStatement: [],
		ExportAllDeclaration: [], // no parts of an export are conditional - source
		ExportDefaultDeclaration: [], // no parts of an export are conditional - declaration
		ExportNamedDeclaration: [], // no parts of an export are conditional - declaration, specifiers, source
		ExportSpecifier: [], // no parts of an export are conditional exported, local
		ExpressionStatement: [],
		ForStatement: ["update", "body"],
		ForInStatement: ["body"],
		ForOfStatement: ["body"],
		FunctionDeclaration: ["body"], // a nested function is potentially 'conditional'
		FunctionExpression: ["body"], // a nested function is potentially 'conditional'
		// GeneratorExpression: toBeDone(["blocks", "filter", "body"]),	// CAUTION: It's deferred to ES7.
		Identifier: [],
		IfStatement: ["consequent", "alternate"],
		/*
		 * all parts of an import declaration are executed unconditionally
		 */
		ImportDeclaration: [], // specifiers, source
		/*
		 * import >>>a<<< from 'module';
		 */
		ImportDefaultSpecifier: [], // local
		/*
		 * Dynamic Import expression, the argument is evaluated unconditionally.
		 */
		ImportExpression: [], // source,
		/*
		 * import >>>* as b<<< from 'module';
		 */
		ImportNamespaceSpecifier: [], // local
		/*
		 * import {>>>a as c<<<,b} from 'module';
		 */
		ImportSpecifier: [], // imported, local
		Literal: [],
		LabeledStatement: [],
		LogicalExpression: [],
		MemberExpression: [],
		MetaProperty: toBeDone(["meta", "property"]),
		MethodDefinition: [],
		NewExpression: [],
		ObjectExpression: [],
		/*
		 * >>>{a,b,c}<<< = {...}
		 *
		 * All properties in an object pattern are executed.
		 */
		ObjectPattern: [], // properties
		Program: [],
		Property: [],
		/*
		 * argument of the rest element is always executed under the same condition as the rest element itself
		 */
		RestElement: [], // argument
		ReturnStatement: [],
		SequenceExpression: [],
		SpreadElement: [], // the argument of the spread operator always needs to be evaluated - argument
		Super: [],
		SwitchStatement: [],
		SwitchCase: ["test", "consequent"], // test and consequent are executed only conditionally
		/*
		 * all parts of a tagged template literal are executed under the same condition as the context
		 */
		TaggedTemplateExpression: [], // tag, quasi
		TemplateElement: [],
		/*
		 * all parts of a template literal are executed under the same condition as the context
		 */
		TemplateLiteral: [], // quasis, expressions
		ThisExpression: [],
		ThrowStatement: [],
		TryStatement: ["handler"], // handler is called conditionally
		UnaryExpression: [],
		UpdateExpression: [],
		VariableDeclaration: [],
		VariableDeclarator: [],
		/*
		 * 'condition' is executed on the same conditions as the surrounding block and potentially repeated,
		 * 'block' maybe entered only conditionally but can be repeated
		 */
		WhileStatement: ["body"],
		WithStatement: [],
		YieldExpression: []
	};

	// check for unknown keys in our configuration
	for ( const type in TempKeys ) {
		if ( VisitorKeys[type] === undefined ) {
			throw new Error("configuration contains unknown node type '" + type + "'");
		}
	}

	// merge with 'official' visitor keys
	Object.keys(VisitorKeys).forEach( (type) => {
		// Check if the visitor-key exists in the available Syntax because
		// the list of visitor-keys does not match the available Syntax.
		if (!Syntax[type]) {
			return;
		}
		// Ignore JSX visitor-keys because they aren't used.
		if (type.startsWith("JSX")) {
			return;
		}

		const visitorKeys = VisitorKeys[type];
		const condKeys = TempKeys[type];
		if ( condKeys === undefined ) {
			// configuration missing in ConditionalKeys, maybe a new syntax ?
			throw new Error(`unknown estree node type '${type}', new syntax?`);
		} else if ( Array.isArray(condKeys) ) {
			// check configured keys against visitor keys
			condKeys.forEach( (key) => {
				if ( visitorKeys.indexOf(key) < 0 ) {
					throw new Error(`configuration for type '${type}' contains unknown key '${key}'`);
				}
			});
			TempKeys[type] = visitorKeys.map( (key) => ({
				key: key,
				conditional: condKeys.indexOf(key) >= 0
			}) );
		} else {
			// this is a 'toBeDone' node type, keep null and complain at runtime when such a node occurs
		}
	});

	return TempKeys;
}());


const CALL_AMD_DEFINE = ["define"];
const CALL_AMD_REQUIRE = ["require"];
const CALL_REQUIRE_SYNC = ["require", "sync"];
const CALL_REQUIRE_PREDEFINE = ["require", "predefine"];
const CALL_SAP_UI_DEFINE = ["sap", "ui", "define"];
const CALL_SAP_UI_REQUIRE = ["sap", "ui", "require"];
const CALL_SAP_UI_REQUIRE_SYNC = ["sap", "ui", "requireSync"];
const CALL_SAP_UI_REQUIRE_PRELOAD = ["sap", "ui", "require", "preload"];
const CALL_SAP_UI_PREDEFINE = ["sap", "ui", "predefine"];
const CALL_JQUERY_SAP_DECLARE = [["jQuery", "$"], "sap", "declare"];
const CALL_JQUERY_SAP_IS_DECLARED = [["jQuery", "$"], "sap", "isDeclared"];
const CALL_JQUERY_SAP_REQUIRE = [["jQuery", "$"], "sap", "require"];
const CALL_JQUERY_SAP_REGISTER_PRELOADED_MODULES = [["jQuery", "$"], "sap", "registerPreloadedModules"];
const SPECIAL_AMD_DEPENDENCIES = ["require", "exports", "module"];


function isCallableExpression(node) {
	return node.type == Syntax.FunctionExpression || node.type == Syntax.ArrowFunctionExpression;
}

/*
 * Dummy implementation.
 * Sole purpose is to easier align with the old (Java) implementation of the bundle tooling.
 */
function getDocumentation(node) {
	return undefined;
}

/**
 * Analyzes an already parsed JSDocument to collect information about the contained module(s).
 *
 * Can handle jQuery.sap.require/jQuery.sap.declare/sap.ui.define and jquery.sap.isDeclared calls.
 *
 * @author Frank Weigel
 * @since 1.1.2
 * @private
 */
class JSModuleAnalyzer {
	/**
	 * Analyzes the JS AST
	 *
	 * @param {object} ast js ast
	 * @param {string} defaultName default name
	 * @param {ModuleInfo} info module info
	 */
	analyze(ast, defaultName, info) {
		let mainModuleFound = false;
		/**
		 * Number of (sap.ui.)define calls without a module ID.
		 * Only tracked to be able to complain about multiple module definitions without ID.
		 */
		let nUnnamedDefines = 0;
		/**
		 * ID of the first named (sap.ui.)define call.
		 * Remembered together with the corresponding description in case no other main module
		 * can be found (no unnamed module, no module with the ID that matches the filename).
		 * Will be used as main module ID if only one module definition exists in the file.
		 */
		let candidateName = null;
		let candidateDescription = null;

		/**
		 * Total number of module declarations (declare or define).
		 */
		let nModuleDeclarations = 0;

		/**
		 * Whether or not this is a UI5 module
		 *
		 * When in the non-conditional module execution there is a call to:
		 * <ul>
		 * <li>sap.ui.define call</li>
		 * <li>jQuery.sap.declare call</li>
		 * </ul>
		 * this value is true
		 *
		 * @type {boolean}
		 */
		let bIsUi5Module = false;

		// first analyze the whole AST...
		visit(ast, false);

		// ...then all the comments
		if ( Array.isArray(ast.comments) ) {
			ast.comments.forEach((comment) => {
				if ( comment.type === "Line" && comment.value.startsWith("@ui5-bundle") ) {
					if ( comment.value.startsWith("@ui5-bundle-raw-include ") ) {
						const subModule = comment.value.slice("@ui5-bundle-raw-include ".length);
						info.addSubModule(subModule);
						log.verbose(`bundle include directive ${subModule}`);
					} else if ( comment.value.startsWith("@ui5-bundle ") ) {
						const bundleName = comment.value.slice("@ui5-bundle ".length);
						setMainModuleInfo(bundleName, null);
						log.verbose(`bundle name directive ${bundleName}`);
					} else {
						log.warn(`unrecognized bundle directive ${comment.value}`);
					}
				}
			});
		}

		// ...and finally take conclusions about the file's content
		if ( !mainModuleFound ) {
			// if there's exactly one module definition in this file but it didn't
			// immediately qualify as main module, make it now the main module
			if ( candidateName != null && nModuleDeclarations == 1 ) {
				info.name = candidateName;
				info.description = candidateDescription;
				mainModuleFound = true;
			} else {
				// no main module found, use the default name
				info.name = defaultName;
			}
		}

		// depending on the used module APIs, add an implicit dependency to the loader entry module
		if ( info.format === ModuleFormat.UI5_LEGACY ) {
			info.addImplicitDependency(UI5ClientConstants.MODULE__JQUERY_SAP_GLOBAL);
		} else if ( info.format === ModuleFormat.UI5_DEFINE ) {
			// Note: the implicit dependency for sap.ui.define modules points to the standard UI5
			// loader config module. A more general approach would be to add a dependency to the loader
			// only, but then standard configuration would be missed by dependency resolution
			// (to be clarified)
			info.addImplicitDependency(UI5ClientConstants.MODULE__UI5LOADER_AUTOCONFIG);
		}

		if ( !bIsUi5Module ) {
			// when there are no indicators for module APIs, mark the module as 'raw' module
			info.rawModule = true;
		}

		const scopeManager = escope.analyze(ast);
		const currentScope = scopeManager.acquire(ast); // global scope
		if ( currentScope.set.size > 0 ) {
			info.requiresTopLevelScope = true;
			info.exposedGlobals = Array.from(currentScope.set.keys());
			// console.log(info.name, "exposed globals", info.exposedGlobals, "ignoredGlobals", info.ignoredGlobals);
		}


		// hoisted functions
		function setMainModuleInfo(name, description) {
			if ( mainModuleFound ) {
				throw new Error("conflicting main modules found (unnamed + named)");
			}
			mainModuleFound = true;
			info.name = name;
			if ( description != null ) {
				info.description = description;
			}
		}

		function visit(node, conditional) {
			// console.log("visiting ", node);

			if ( node == null ) {
				return;
			}

			if ( Array.isArray(node) ) {
				node.forEach((child) => visit(child, conditional));
				return;
			}

			const condKeys = EnrichedVisitorKeys[node.type];
			switch (node.type) {
			case Syntax.CallExpression:
				if ( !conditional && isMethodCall(node, CALL_JQUERY_SAP_DECLARE) ) {
					// recognized a call to jQuery.sap.declare()
					nModuleDeclarations++;
					info.setFormat(ModuleFormat.UI5_LEGACY);
					bIsUi5Module = true;
					onDeclare(node);
				} else if ( !conditional &&
								(isMethodCall(node, CALL_SAP_UI_DEFINE) || isMethodCall(node, CALL_AMD_DEFINE)) ) {
					// recognized a call to define() or sap.ui.define()
					// console.log("**** recognized a call to sap.ui.define");
					nModuleDeclarations++;
					if ( isMethodCall(node, CALL_SAP_UI_DEFINE) ) {
						info.setFormat(ModuleFormat.UI5_DEFINE);
					} else {
						info.setFormat(ModuleFormat.AMD);
					}
					bIsUi5Module = true;
					onDefine(node);

					const args = node.arguments;
					let iArg = 0;
					if ( iArg < args.length && isString(args[iArg]) ) {
						iArg++;
					}
					if ( iArg < args.length && args[iArg].type == Syntax.ArrayExpression ) {
						iArg++;
					}
					if ( iArg < args.length && isCallableExpression(args[iArg]) ) {
						// unconditionally execute the factory function
						visit(args[iArg].body, conditional);
					}
				} else if ( isMethodCall(node, CALL_REQUIRE_PREDEFINE) || isMethodCall(node, CALL_SAP_UI_PREDEFINE) ) {
					// recognized a call to require.predefine() or sap.ui.predefine()
					if (!conditional) {
						bIsUi5Module = true;
					}
					info.setFormat(ModuleFormat.UI5_DEFINE);
					onSapUiPredefine(node, conditional);

					const args = node.arguments;
					let iArg = 0;
					if ( iArg < args.length && isString(args[iArg]) ) {
						iArg++;
					}
					if ( iArg < args.length && args[iArg].type == Syntax.ArrayExpression ) {
						iArg++;
					}
					if ( iArg < args.length && isCallableExpression(args[iArg]) ) {
						// unconditionally execute the factory function
						visit(args[iArg].body, conditional);
					}
				} else if ( isMethodCall(node, CALL_SAP_UI_REQUIRE) || isMethodCall(node, CALL_AMD_REQUIRE) ) {
					// recognized a call to require() or sap.ui.require()
					if ( isMethodCall(node, CALL_SAP_UI_REQUIRE) ) {
						info.setFormat(ModuleFormat.UI5_DEFINE);
					} else {
						info.setFormat(ModuleFormat.AMD);
					}
					let iArg = 0;
					const args = node.arguments;
					if ( iArg < args.length && args[iArg].type == Syntax.ArrayExpression ) {
						// TODO onAsyncRequire(node, node.getChild(1));
						// requireJS signature, handle as such
						analyzeDependencyArray(args[iArg].elements, conditional, null);
						iArg++;
					}
					if ( iArg < args.length && isCallableExpression(args[iArg]) ) {
						// analyze the callback function
						visit(args[iArg].body, conditional);
					}
				} else if ( isMethodCall(node, CALL_REQUIRE_SYNC) || isMethodCall(node, CALL_SAP_UI_REQUIRE_SYNC) ) {
					// recognizes a call to sap.ui.requireSync
					info.setFormat(ModuleFormat.UI5_DEFINE);

					onSapUiRequireSync(node, conditional);
				} else if ( isMethodCall(node, CALL_JQUERY_SAP_REQUIRE) ) {
					// recognizes a call to jQuery.sap.require
					info.setFormat(ModuleFormat.UI5_LEGACY);
					onJQuerySapRequire(node, conditional);
				} else if ( isMethodCall(node, CALL_JQUERY_SAP_REGISTER_PRELOADED_MODULES) ) {
					// recognizes a call to jQuery.sap.registerPreloadedModules
					if (!conditional) {
						bIsUi5Module = true;
					}
					info.setFormat(ModuleFormat.UI5_LEGACY);
					onRegisterPreloadedModules(node, /* evoSyntax= */ false);
				} else if ( isMethodCall(node, CALL_SAP_UI_REQUIRE_PRELOAD) ) {
					// recognizes a call to sap.ui.require.preload
					if (!conditional) {
						bIsUi5Module = true;
					}
					info.setFormat(ModuleFormat.UI5_DEFINE);
					onRegisterPreloadedModules(node, /* evoSyntax= */ true);
				} else if ( isCallableExpression(node.callee) ) {
					// recognizes a scope function declaration + argument
					visit(node.arguments, conditional);
					// NODE-TODO defaults of callee?
					visit(node.callee.body, conditional);
				} else {
					// default visit
					for ( const key of condKeys ) {
						visit(node[key.key], key.conditional || conditional);
					}
				}
				break;

			case Syntax.IfStatement:
				// recognizes blocks of the form
				//     if ( !jQuery.sap.isDeclared() ) {
				//         ...
				//     }
				// required for the analysis of files that have been build with the
				// embedding merge writer (e.g. sap-ui-core-all.js)
				if ( node.test.type == Syntax.UnaryExpression &&
						node.test.operator === "!" &&
						isMethodCall(node.test.argument, CALL_JQUERY_SAP_IS_DECLARED ) ) {
					visit(node.consequent, conditional);
					visit(node.alternate, true);
				} else {
					// default visit
					for ( const key of condKeys ) {
						visit(node[key.key], key.conditional || conditional);
					}
				}
				break;

			default:
				if ( condKeys == null ) {
					log.error("Unhandled AST node type " + node.type, node);
					throw new Error(`Unhandled AST node type ${node.type}`);
				}
				// default visit
				for ( const key of condKeys ) {
					visit(node[key.key], key.conditional || conditional);
				}
				break;
			}
		}

		function onDeclare(node) {
			const args = node.arguments;
			if ( args.length > 0 && isString(args[0]) ) {
				const name = ModuleName.fromUI5LegacyName( args[0].value );
				if ( nModuleDeclarations === 1 && !mainModuleFound) {
					// if this is the first declaration, then this is the main module declaration
					// note that this overrides an already given name
					setMainModuleInfo(name, getDocumentation(node));
				} else if ( nModuleDeclarations > 1 && name === info.name ) {
					// ignore duplicate declarations (e.g. in behavior file of design time controls)
					log.warn(`duplicate declaration of module name at ${getLocation(args)} in ${name}`);
				} else {
					// otherwise it is just a submodule declaration
					info.addSubModule(name);
				}
			} else {
				log.error("jQuery.sap.declare: module name could not be determined from first argument:", args[0]);
			}
		}

		function onDefine(defineCall) {
			const args = defineCall.arguments;
			const nArgs = args.length;
			let i = 0;

			// get the documentation from a preceding comment
			const desc = getDocumentation(defineCall);

			// determine the name of the module
			let name = null;
			if ( i < nArgs && isString(args[i]) ) {
				name = ModuleName.fromRequireJSName( args[i++].value );
				if ( name === defaultName ) {
					// hardcoded name equals the file name, so this definition qualifies as main module definition
					setMainModuleInfo(name, desc);
				} else {
					info.addSubModule(name);
					if ( candidateName == null ) {
						// remember the name and description in case no other module qualifies as main module
						candidateName = name;
						candidateDescription = desc;
					}
				}
			} else {
				nUnnamedDefines++;
				if ( nUnnamedDefines > 1 ) {
					throw new Error(
						"if multiple modules are contained in a file, only one of them may omit the module ID " +
						name + " " + nUnnamedDefines);
				}
				if ( defaultName == null ) {
					throw new Error("unnamed module found, but no default name given");
				}
				name = defaultName;
				// the first unnamed module definition qualifies as main module
				setMainModuleInfo(name, desc);
			}

			// process array of required modules, if given
			if ( i < nArgs && args[i].type === Syntax.ArrayExpression ) {
				analyzeDependencyArray(args[i].elements, false, name); // TODO not always false, depends on context?
				i++;
			}
		}

		function onJQuerySapRequire(requireCall, conditional) {
			const args = requireCall.arguments;
			const nArgs = args.length;

			if ( nArgs > 0 && args[0].type == Syntax.OBJECT ) {
				log.verbose("jQuery.sap.require: cannot evaluate complex require (view/controller)");
			} else {
				// UI5 signature with one or many required modules
				for (let i = 0; i < nArgs; i++) {
					const arg = args[i];
					if ( isString(arg) ) {
						const requiredModuleName = ModuleName.fromUI5LegacyName( arg.value );
						info.addDependency(requiredModuleName, conditional);
					} else if ( arg.type == Syntax.ConditionalExpression &&
									isString(arg.consequent) && isString(arg.alternate) ) {
						const requiredModuleName1 = ModuleName.fromUI5LegacyName( arg.consequent.value );
						info.addDependency(requiredModuleName1, true);
						const requiredModuleName2 = ModuleName.fromUI5LegacyName( arg.alternate.value );
						info.addDependency(requiredModuleName2, true);
					} else {
						log.verbose("jQuery.sap.require: cannot evaluate dynamic arguments: ", arg && arg.type);
						info.dynamicDependencies = true;
					}
				}
			}
		}

		function onSapUiRequireSync(node, conditional) {
			const args = node.arguments;
			const nArgs = args.length;
			const i = 0;

			if ( i < nArgs ) {
				if ( isString(args[i]) ) {
					// sap.ui.requireSync does not support relative dependencies
					const moduleName = ModuleName.fromRequireJSName( args[i].value );
					info.addDependency(moduleName, conditional);
				} else {
					log.verbose("sap.ui.requireSync: cannot evaluate dynamic arguments: ", args[i] && args[i].type);
					info.dynamicDependencies = true;
				}
			}
		}

		function onSapUiPredefine(predefineCall, conditional) {
			const args = predefineCall.arguments;
			const nArgs = args.length;
			let i = 0;

			// determine the name of the module
			if ( i < nArgs && isString(args[i]) ) {
				const moduleName = ModuleName.fromRequireJSName( args[i++].value );
				info.addSubModule(moduleName);

				// add dependencies
				// to correctly identify dependencies e.g. of a library-preload
				const elementArg = args[i++];
				if (elementArg && elementArg.type === Syntax.ArrayExpression) {
					elementArg.elements.forEach((element) => {
						const dependencyName = ModuleName.resolveRelativeRequireJSName(moduleName, element.value);
						info.addDependency(dependencyName, conditional);
					});
				}
			} else {
				log.warn("sap.ui.predefine call is missing a module name (ignored)");
			}
		}

		function onRegisterPreloadedModules(node, evoSyntax) {
			const args = node.arguments;

			// trace.debug("**** registerPreloadedModules detected");
			let modules = null;
			let namesUseLegacyNotation = false;

			if ( evoSyntax ) {
				modules = args[0];
			} else {
				const obj = args[0];
				if (obj && obj.type === Syntax.ObjectExpression) {
					const version = findOwnProperty(obj, "version");
					namesUseLegacyNotation = !(version && isString(version) && parseFloat(version.value) >= 2.0);
					modules = findOwnProperty(obj, "modules");
				}
			}
			if ( modules && modules.type == Syntax.ObjectExpression ) {
				modules.properties.forEach( function(property) {
					let	moduleName = getPropertyKey(property);
					if ( namesUseLegacyNotation ) {
						moduleName = ModuleName.fromUI5LegacyName(moduleName);
					}
					info.addSubModule(moduleName);
				});
			} else {
				log.verbose("Cannot evaluate registerPreloadedModules: '%s'", modules && modules.type);
			}
		}

		function analyzeDependencyArray(array, conditional, name) {
			// console.log(array);
			array.forEach( (item) => {
				if ( isString(item) ) {
					// ignore special AMD dependencies (require, exports, module)
					if ( SPECIAL_AMD_DEPENDENCIES.indexOf(item.value) >= 0 ) {
						return;
					}
					let requiredModule;
					if (name == null) {
						requiredModule = ModuleName.fromRequireJSName( item.value );
					} else {
						requiredModule = ModuleName.resolveRelativeRequireJSName(name, item.value);
					}
					info.addDependency( requiredModule, conditional );
				} else {
					log.verbose("sap.ui.require/sap.ui.define: cannot evaluate dynamic argument: ", item && item.type);
					info.dynamicDependencies = true;
				}
			});
		}

		/*
		private static final boolean isRealWhitespace(Token t) {
			return t.type == Syntax.WhiteSpace || t.type == Syntax.EOL;
		}

		private String getDocumentation(Tree node) {
			int afterWS = node.getTokenStartIndex();

			// ignore any real whitespace (WS or EOL)
			while ( afterWS > 0 && isRealWhitespace(doc.getToken(afterWS-1)) )
				afterWS--;

			if (afterWS > 0) {
				if ( doc.getToken(afterWS-1).type == Syntax.MultiLineComment ) {
					Token t = doc.getToken(afterWS-1);
					String s = t.getText();
					s = s.replaceFirst("^/\\*[ \t*]*", "");
					s = s.replaceAll("[ \t*]*\\* /$", "");
					s = s.replaceAll("[\r\n]+[ \t]*\\*+[ \t]*", " ");
					s = s.trim();
					return s;
				} else {
					int firstWS = afterWS;
					while ( firstWS > 0 && doc.getToken(firstWS-1).type == Syntax.SingleLineComment )
						firstWS--;
					if( firstWS < afterWS ) {
						StringBuilder buf = new StringBuilder();
						for (int i=firstWS; i<afterWS; i++) {
							Token t = doc.getToken(i);
							buf.append(t.getText().substring(2).trim());
						}
						return buf.toString();
					}
				}
			}
			return null;
		}
		*/
	}
}


module.exports = JSModuleAnalyzer;

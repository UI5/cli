"use strict";

const esprima = require("esprima");
const {Syntax} = esprima;
const escope = require("escope");
const ModuleName = require("../utils/ModuleName");
const {Format: ModuleFormat} = require("../resources/ModuleInfo");
const UI5ClientConstants = require("../UI5ClientConstants");
const {findOwnProperty, getLocation, getPropertyKey, isMethodCall, isString} = require("../utils/ASTUtils");
const log = require("@ui5/logger").getLogger("lbt:analyzer:JSModuleAnalyzer");

// ------------------------------------------------------------------------------------------------------------------

const EnrichedVisitorKeys = (function() {
	const VisitorKeys = require("estraverse").VisitorKeys;

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
		ComprehensionBlock: toBeDone(["left", "right"]),	// CAUTION: It's deferred to ES7.
		ComprehensionExpression: toBeDone(),	// CAUTION: It's deferred to ES7.
		ConditionalExpression: ["consequent", "alternate"],
		ContinueStatement: [],
		DebuggerStatement: [],
		DirectiveStatement: [],
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
		GeneratorExpression: toBeDone(["blocks", "filter", "body"]),	// CAUTION: It's deferred to ES7.
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
		ModuleSpecifier: [],
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
const CALL_REQUIRE_PRELOAD = ["require", "preload"];
const CALL_SAP_UI_DEFINE = ["sap", "ui", "define"];
const CALL_SAP_UI_REQUIRE = ["sap", "ui", "require"];
const CALL_SAP_UI_REQUIRE_SYNC = ["sap", "ui", "requireSync"];
const CALL_SAP_UI_REQUIRE_PRELOAD = ["sap", "ui", "require", "preload"];
const CALL_SAP_UI_PREDEFINE = ["sap", "ui", "predefine"];
const CALL_JQUERY_SAP_DECLARE = [["jQuery", "$"], "sap", "declare"];
const CALL_JQUERY_SAP_IS_DECLARED = [["jQuery", "$"], "sap", "isDeclared"];
const CALL_JQUERY_SAP_REQUIRE = [["jQuery", "$"], "sap", "require"];
const CALL_JQUERY_SAP_REGISTER_PRELOADED_MODULES = [["jQuery", "$"], "sap", "registerPreloadedModules"];

function isCallableExpression(node) {
	return node.type == Syntax.FunctionExpression || node.type == Syntax.ArrowFunctionExpression;
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
	analyze(ast, defaultName, info) {
		let nModuleDeclarations = 0;

		// console.log(JSON.stringify(ast, null, "  "));

		visit(ast, false);

		if ( info.format === ModuleFormat.UI5_LEGACY ) {
			info.addImplicitDependency(UI5ClientConstants.MODULE__JQUERY_SAP_GLOBAL);
		} else if ( info.format === ModuleFormat.UI5_DEFINE ) {
			info.addImplicitDependency(UI5ClientConstants.MODULE__UI5LOADER_AUTOCONFIG);
		}
		if ( nModuleDeclarations === 0 && info.name == null ) {
			info.name = defaultName;
		}
		if ( info.dependencies.length === 0 && info.subModules.length === 0 ) {
			info.rawModule = true;
		}

		const scopeManager = escope.analyze(ast);
		const currentScope = scopeManager.acquire(ast); // global scope
		if ( currentScope.set.size > 0 ) {
			info.requiresTopLevelScope = true;
			info.exposedGlobals = Array.from(currentScope.set.keys());
			// console.log(info.name, info.exposedGlobals);
		}

		return;

		// hoisted functions

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
					onDeclare(node);
				} else if ( !conditional
								&& (isMethodCall(node, CALL_SAP_UI_DEFINE) || isMethodCall(node, CALL_AMD_DEFINE)) ) {
					// recognized a call to define() or sap.ui.define()
					// console.log("**** recognized a call to sap.ui.define");
					nModuleDeclarations++;
					if ( isMethodCall(node, CALL_SAP_UI_DEFINE) ) {
						info.setFormat(ModuleFormat.UI5_DEFINE);
					} else {
						info.setFormat(ModuleFormat.AMD);
					}
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
					info.setFormat(ModuleFormat.UI5_DEFINE);
					onSapUiPredefine(node);
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
				} else if ( isMethodCall(node, CALL_JQUERY_SAP_REGISTER_PRELOADED_MODULES)
							|| isMethodCall(node, CALL_REQUIRE_PRELOAD)
							|| isMethodCall(node, CALL_SAP_UI_REQUIRE_PRELOAD) ) {
					// recognizes a call to jQuery.sap.registerPreloadedModules
					const legacyCall = isMethodCall(node, CALL_JQUERY_SAP_REGISTER_PRELOADED_MODULES);
					info.setFormat( legacyCall ? ModuleFormat.UI5_LEGACY : ModuleFormat.UI5_DEFINE);
					onRegisterPreloadedModules(node, legacyCall);
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
				if ( node.test.type == Syntax.UnaryExpression
						&& node.test.operator === "!"
						&& isMethodCall(node.test.argument, CALL_JQUERY_SAP_IS_DECLARED ) ) {
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
				if ( nModuleDeclarations === 1 ) {
					// if this is the first declaration, then this is the main module declaration
					// note that this overrides an already given name
					info.name = name;
					/* NODE-TODO
					info.description = getDocumentation(node);
					 */
				} else if ( nModuleDeclarations > 1 && name === info.name ) {
					// ignore duplicate declarations (e.g. in behavior file of design time controls)
					log.warn(`duplicate declaration of module ${getLocation(args)} in ${name}`);
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

			// determine the name of the module
			let name = defaultName;
			if ( i < nArgs && isString(args[i]) ) {
				name = ModuleName.fromRequireJSName( args[i++].value );
			}
			if ( name == null ) {
				throw new TypeError("define/sap.ui.define: module name could not be determined," +
					`neither from environment nor from first argument: ${args[i] && args[i].type}`);
			}

			if ( nModuleDeclarations === 1 ) {
				// if this is the first declaration, then this is the main module declaration
				info.name = name;

				// get the documentation from a preceding comment
				/* NODE-TODO
				info.description = getDocumentation(defineNode);
				*/
			} else {
				if ( name === defaultName ) {
					throw new Error("module name could not be determined");
				}
				info.addSubModule(name);
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
					} else if ( arg.type == Syntax.ConditionalExpression
									&& isString(arg.consequent) && isString(arg.alternate) ) {
						const requiredModuleName1 = ModuleName.fromUI5LegacyName( arg.consequent.value );
						info.addDependency(requiredModuleName1, true);
						const requiredModuleName2 = ModuleName.fromUI5LegacyName( arg.alternate.value );
						info.addDependency(requiredModuleName2, true);
					} else {
						log.verbose("jQuery.sap.require: cannot evaluate dynamic arguments: ", arg);
						info.dynamicDependencies = true;
					}
				}
			}
		}

		function onSapUiRequireSync(node, conditional) {
			const args = node.arguments;
			const nArgs = args.length;
			const i = 0;

			if ( i < nArgs && isString(args[i]) ) {
				const moduleName = ModuleName.fromRequireJSName( args[i].value );
				info.addDependency(moduleName, conditional);
			}
		}


		function onSapUiPredefine(predefineCall) {
			const args = predefineCall.arguments;
			const nArgs = args.length;
			let i = 0;

			// determine the name of the module
			if ( i < nArgs && isString(args[i]) ) {
				const moduleName = ModuleName.fromRequireJSName( args[i++].value );
				info.addSubModule(moduleName);
			} else {
				log.warn("sap.ui.predefine call is missing a module name (ignored)");
			}
		}

		function onRegisterPreloadedModules(node, legacyCall) {
			const args = node.arguments;

			// trace.debug("**** registerPreloadedModules detected");
			if ( args.length > 0 && args[0].type == Syntax.ObjectExpression ) {
				let modules = args[0];
				let isNewSyntax = true;

				if ( legacyCall ) {
					const obj = args[0];
					isNewSyntax = false;
					const version = findOwnProperty(obj, "version");
					if ( version && isString(version) && parseFloat(version.value) >= 2.0 ) {
						isNewSyntax = true;
					}
					modules = findOwnProperty(obj, "modules");
				}

				if ( modules && modules.type == Syntax.ObjectExpression ) {
					modules.properties.forEach( function(property) {
						let	moduleName = getPropertyKey(property);
						if ( !isNewSyntax ) {
							moduleName = ModuleName.fromUI5LegacyName(moduleName);
						}
						info.addSubModule(moduleName);
					});
				} else {
					log.warn("Cannot evaluate registerPreloadedModules: '%s'", modules && modules.type);
				}
			}
		}

		function analyzeDependencyArray(array, conditional, name) {
			// console.log(array);
			array.forEach( (item) => {
				if ( isString(item) ) {
					let requiredModule;
					if (name == null) {
						requiredModule = ModuleName.fromRequireJSName( item.value );
					} else {
						requiredModule = ModuleName.resolveRelativeRequireJSName(name, item.value);
					}
					info.addDependency( requiredModule, conditional );
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

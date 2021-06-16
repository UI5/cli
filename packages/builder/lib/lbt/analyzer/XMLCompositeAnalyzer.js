"use strict";

const {Syntax} = require("../utils/parseUtils");
const SapUiDefine = require("../calls/SapUiDefine");
const {getValue, isMethodCall, isString} = require("../utils/ASTUtils");
const ModuleName = require("../utils/ModuleName");
const log = require("@ui5/logger").getLogger("lbt:analyzer:XMLCompositeAnalyzer");

const CALL_DEFINE = ["define"];
const CALL_SAP_UI_DEFINE = ["sap", "ui", "define"];

class XMLCompositeAnalyzer {
	analyze(ast, moduleName, info) {
		let fragmentName;
		if ( ast.body.length > 0 && ast.body[0].type === Syntax.ExpressionStatement &&
				(isMethodCall(ast.body[0].expression, CALL_SAP_UI_DEFINE) ||
				isMethodCall(ast.body[0].expression, CALL_DEFINE)) ) {
			const defineCall = new SapUiDefine(ast.body[0].expression, moduleName);
			const XMLC = defineCall.findImportName("sap/ui/core/XMLComposite.js");
			// console.log("local name for XMLComposite: %s", XMLC);
			if ( XMLC && defineCall.factory ) {
				defineCall.factory.body.body.forEach( (stmt) => {
					if ( stmt.type === Syntax.VariableDeclaration ) {
						stmt.declarations.forEach( (decl) => {
							fragmentName = this._checkForXMLCClassDefinition( XMLC, decl.init ) || fragmentName;
						});
					} else if ( stmt.type === Syntax.ExpressionStatement &&
								stmt.expression.type === Syntax.AssignmentExpression ) {
						fragmentName = this._checkForXMLCClassDefinition( XMLC, stmt.expression.right ) || fragmentName;
					}
				});
				if ( fragmentName ) {
					const fragmentModule = ModuleName.fromUI5LegacyName( fragmentName, ".control.xml" );
					log.verbose("fragment control: add dependency to template fragment %s", fragmentModule);
					info.addDependency(fragmentModule);
				}
			}
		}
	}

	_checkForXMLCClassDefinition(XMLC, stmt) {
		let fragmentName;
		if ( isMethodCall(stmt, [XMLC, "extend"]) ) {
			// log.verbose(stmt);
			if ( stmt.arguments.length > 0 && isString(stmt.arguments[0]) ) {
				fragmentName = stmt.arguments[0].value;
			}
			if ( stmt.arguments.length > 1 && stmt.arguments[1].type === Syntax.ObjectExpression ) {
				fragmentName = this._analyzeXMLCClassDefinition(stmt.arguments[1]) || fragmentName;
			}
		}
		return fragmentName;
	}

	_analyzeXMLCClassDefinition(clazz) {
		// log.verbose(clazz);
		const fragmentName = getValue(clazz, ["fragment"]);
		if ( isString(fragmentName) ) {
			return fragmentName.value;
		}
	}
}


module.exports = XMLCompositeAnalyzer;

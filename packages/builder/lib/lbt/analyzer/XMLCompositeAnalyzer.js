
import {Syntax} from "../utils/parseUtils.js";
import SapUiDefine from "../calls/SapUiDefine.js";
import {getValue, isMethodCall, getStringValue} from "../utils/ASTUtils.js";
import {fromUI5LegacyName} from "../utils/ModuleName.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:analyzer:XMLCompositeAnalyzer");

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
				if (defineCall.factory.type === Syntax.ArrowFunctionExpression &&
					defineCall.factory.expression === true) {
					fragmentName = this._checkForXMLCClassDefinition(XMLC, defineCall.factory.body);
				} else {
					defineCall.factory.body.body.forEach((stmt) => {
						if (stmt.type === Syntax.VariableDeclaration) {
							stmt.declarations.forEach((decl) => {
								fragmentName = this._checkForXMLCClassDefinition(XMLC, decl.init) || fragmentName;
							});
						} else if (
							stmt.type === Syntax.ReturnStatement &&
							( stmt?.argument?.type === Syntax.CallExpression && stmt.argument.arguments?.length > 1 &&
								stmt.argument.arguments[1].type === Syntax.ObjectExpression)) {
							fragmentName =
								this._checkForXMLCClassDefinition(XMLC, stmt.argument) || fragmentName;
						} else if (stmt.type === Syntax.ExpressionStatement &&
							stmt.expression.type === Syntax.AssignmentExpression) {
							fragmentName =
								this._checkForXMLCClassDefinition(XMLC, stmt.expression.right) || fragmentName;
						}
					});
				}
				if (fragmentName) {
					const fragmentModule = fromUI5LegacyName(fragmentName, ".control.xml");
					log.verbose(`Fragment control: Add dependency to template fragment ${fragmentModule}`);
					info.addDependency(fragmentModule);
				}
			}
		}
	}

	_checkForXMLCClassDefinition(XMLC, stmt) {
		let fragmentName;
		if ( isMethodCall(stmt, [XMLC, "extend"]) ) {
			// log.verbose(stmt);
			const value = getStringValue(stmt.arguments[0]);
			if ( stmt.arguments.length > 0 && value ) {
				fragmentName = value;
			}
			if ( stmt.arguments.length > 1 && stmt.arguments[1].type === Syntax.ObjectExpression ) {
				fragmentName = this._analyzeXMLCClassDefinition(stmt.arguments[1]) || fragmentName;
			}
		}
		return fragmentName;
	}

	_analyzeXMLCClassDefinition(clazz) {
		// log.verbose(clazz);
		return getStringValue(getValue(clazz, ["fragment"]));
	}
}


export default XMLCompositeAnalyzer;

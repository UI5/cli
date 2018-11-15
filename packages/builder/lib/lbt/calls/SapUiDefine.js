"use strict";

const {Syntax} = require("esprima");
const ModuleName = require("../utils/ModuleName");
const {isString} = require("../utils/ASTUtils");

class SapUiDefineCall {
	constructor(node, moduleName) {
		this.node = node;
		this.name = moduleName;
		this.dependencyArray = null;
		this.factory = null;

		const args = node.arguments;
		let i = 0;
		let params;

		if ( args[i].type === Syntax.Literal ) {
			// assert(String)
			this.name = args[i++].value;
		}

		if ( args[i].type === Syntax.ArrayExpression ) {
			this.dependencyArray = args[i++];
			this.dependencies = this.dependencyArray.elements.map( (elem) => {
				if ( !isString(elem) ) {
					throw new TypeError();
				}
				return ModuleName.resolveRelativeRequireJSName(this.name, elem.value);
			});
			this.dependencyInsertionIdx = this.dependencyArray.elements.length;
		}

		if ( args[i].type === Syntax.FunctionExpression ) {
			this.factory = args[i++];
			params = this.factory.params;
			this.paramNames = params.map( (param) => {
				if ( param.type !== Syntax.Identifier ) {
					throw new TypeError();
				}
				return param.name;
			});
			if ( this.factory.params.length < this.dependencyInsertionIdx ) {
				this.dependencyInsertionIdx = this.factory.params.length;
			}
		}

		// console.log("declared dependencies: " + this.dependencies);
	}

	/* NODE-TODO: 'b' is not defined
	addDependency(module, shortcut) {
		if ( !this.dependencyArray ) {
			throw new Error("no dependency array"); // TODO create
			// console.error("no dependency error");
			// return;
		}
		let i = this.dependencyInsertionIdx++;
		this.dependencyArray.elements.splice(i, 0, b.literal(module));
		this.dependencies.splice(i, 0, module);
		// console.log(this.factory.params);
		this.factory.params.splice(i, 0, b.identifier(shortcut));
		this.paramNames.splice(i, 0, shortcut);
	}*/

	findImportName(module) {
		const idx = this.dependencies ? this.dependencies.indexOf(module) : -1;
		if ( idx >= 0 ) {
			return this.paramNames[idx];
		}
		return null;
	}
}

function isSapUiDefineCall(node) {
	return (
		node
		&& node.type === Syntax.CallExpression
		&& node.callee.type === Syntax.MemberExpression
		&& node.callee.object.type === Syntax.MemberExpression
		&& node.callee.object.object.type === Syntax.Identifier
		&& node.callee.object.object.name === "sap"
		&& node.callee.object.property.type === Syntax.Identifier
		&& node.callee.object.property.name === "ui"
		&& node.callee.property.type === Syntax.Identifier
		&& node.callee.property.name === "define"
	);
}

SapUiDefineCall.check = isSapUiDefineCall;

module.exports = SapUiDefineCall;

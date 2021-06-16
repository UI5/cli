"use strict";

const {Syntax} = require("../utils/parseUtils");
const ModuleName = require("../utils/ModuleName");
const {isString, isBoolean} = require("../utils/ASTUtils");

class SapUiDefineCall {
	constructor(node, moduleName) {
		this.node = node;
		this.name = moduleName;
		this.dependencyArray = null;
		this.factory = null;
		this.exportAsGlobal = false;

		const args = node.arguments;
		if ( args == null ) {
			return;
		}

		// Note: the following code assumes that no variables or expressions are used
		// for the arguments of the sap.ui.define call. The analysis could be made more
		// sophisticated and could try to skip unhandled parameter types, based on the
		// AST type of follow-up arguments.
		// But on the other hand, an incomplete analysis of the define call is useless in
		// many cases, so it might not be worth the effort.

		let i = 0;
		let params;

		if ( i < args.length && isString(args[i]) ) {
			// assert(String)
			this.name = args[i++].value;
		}

		if ( i < args.length && args[i].type === Syntax.ArrayExpression ) {
			this.dependencyArray = args[i++];
			this.dependencies = this.dependencyArray.elements.map( (elem) => {
				if ( !isString(elem) ) {
					throw new TypeError();
				}
				return ModuleName.resolveRelativeRequireJSName(this.name, elem.value);
			});
			this.dependencyInsertionIdx = this.dependencyArray.elements.length;
		}

		if ( i < args.length && args[i].type === Syntax.FunctionExpression ) {
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

		if ( i < args.length && isBoolean(args[i]) ) {
			this.exportAsGlobal = args[i].value;
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

module.exports = SapUiDefineCall;


import {Syntax} from "../utils/parseUtils.js";

/**
 * Checks whether the given node is a string literal.
 *
 * If second parameter 'literal' is given, the value of the node is additionally compared with that literal.
 *
 * @private
 * @param {ESTree} node
 * @param {string} [literal]
 * @returns {boolean} Whether the node is a literal and whether its value matches the given string
 */
export function isString(node, literal) {
	const value = getStringValue(node);
	if (value === undefined) {
		return false;
	}
	return literal == null ? true: value === literal;
}

export function getStringValue(node) {
	if (isLiteral(node)) {
		return node.value;
	} else if (isTemplateLiteralWithoutExpression(node)) {
		return node?.quasis?.[0]?.value?.cooked;
	} else {
		return undefined;
	}
}

export function isLiteral(node) {
	return node && node.type === Syntax.Literal && typeof node.value === "string";
}

export function isTemplateLiteralWithoutExpression(node) {
	return node?.type === Syntax.TemplateLiteral &&
		node?.expressions?.length === 0 &&
		node?.quasis?.length === 1;
}

export function isBoolean(node, literal) {
	if ( node == null || node.type !== Syntax.Literal || typeof node.value !== "boolean" ) {
		return false;
	}
	return literal == null ? true : node.value === literal;
}

export function isMethodCall(node, methodPath) {
	if ( node.type !== Syntax.CallExpression ) {
		return false;
	}

	// BYFIELD ( BYFIELD ( BYFIELD ( a, b), c), d)
	return isNamedObject(node.callee, methodPath, methodPath.length);
}

export function isNamedObject(node, objectPath, length) {
	// TODO: Support PrivateIdentifier (foo.#bar)

	// console.log("checking for named object ", node, objectPath, length);
	while ( length > 1 &&
			node.type === Syntax.MemberExpression &&
			isIdentifier(node.property, objectPath[length-1]) ) {
		node = node.object;
		length--;
	}
	return length === 1 && isIdentifier(node, objectPath[0]);
}

export function isIdentifier(node, name) {
	if ( node.type === Syntax.Identifier && typeof name == "string" ) {
		return name === node.name;
	} else if ( node.type === Syntax.Identifier && Array.isArray(name) ) {
		return name.find((name) => name === node.name || name === "*") !== undefined;
	} else if ( node.type === Syntax.ObjectPattern ) {
		return node.properties.filter((childnode) => isIdentifier(childnode.key, name)).length > 0;
	} else if ( node.type === Syntax.ArrayPattern ) {
		return node.elements.filter((childnode) => isIdentifier(childnode, name)).length > 0;
	} else {
		return false;
	}
}

export function getPropertyKey(property) {
	if ( property.type === Syntax.SpreadElement ) {
		// TODO: Support interpreting SpreadElements
		return;
	} else if ( property.key.type === Syntax.Identifier && property.computed !== true ) {
		return property.key.name;
	} else if ( property.key.type === Syntax.Literal ) {
		return String(property.key.value);
	}
}

export function findOwnProperty(obj, name) {
	const property = obj && obj.properties.find((property) => getPropertyKey(property) === name);
	return property && property.value;
}

export function getValue(obj, names) {
	let i = 0;
	while ( i < names.length ) {
		if ( obj == null || obj.type !== Syntax.ObjectExpression ) {
			return null;
		}
		obj = findOwnProperty(obj, names[i++]);
	}
	return obj;
}

/**
 * Converts an AST node of type 'ArrayExpression' into an array of strings,
 * assuming that each item in the array literal is a string literal.
 *
 * Depending on the parameter skipNonStringLiterals, unexpected items
 * in the array are either ignored or cause the method to fail with
 * a TypeError.
 *
 * @param {ESTree} array
 * @param {boolean } skipNonStringLiterals
 * @throws {TypeError}
 * @returns {string[]}
 */
export function getStringArray(array, skipNonStringLiterals) {
	return array.elements.reduce( (result, item) => {
		const value = getStringValue(item);
		if ( value !== undefined ) {
			result.push(value);
		} else if ( !skipNonStringLiterals ) {
			if (item.type === Syntax.TemplateLiteral) {
				throw new TypeError("array element is a template literal with expressions");
			} else {
				throw new TypeError("array element is not a string literal: " + item.type);
			}
		}
		return result;
	}, []);
}

export function	getLocation(args) {
	// NODE-TODO include line information in future
	return args[0].value;
}

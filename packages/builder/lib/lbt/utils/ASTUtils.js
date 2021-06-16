"use strict";

const {Syntax} = require("../utils/parseUtils");

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
function isString(node, literal) {
	if ( node == null || node.type !== Syntax.Literal || typeof node.value !== "string" ) {
		return false;
	}
	return literal == null ? true : node.value === literal;
}

function isBoolean(node, literal) {
	if ( node == null || node.type !== Syntax.Literal || typeof node.value !== "boolean" ) {
		return false;
	}
	return literal == null ? true : node.value === literal;
}

function isMethodCall(node, methodPath) {
	if ( node.type !== Syntax.CallExpression ) {
		return false;
	}

	// BYFIELD ( BYFIELD ( BYFIELD ( a, b), c), d)
	return isNamedObject(node.callee, methodPath, methodPath.length);
}

function isNamedObject(node, objectPath, length) {
	// console.log("checking for named object ", node, objectPath, length);
	while ( length > 1 &&
			node.type === Syntax.MemberExpression &&
			isIdentifier(node.property, objectPath[length-1]) ) {
		node = node.object;
		length--;
	}
	return length === 1 && isIdentifier(node, objectPath[0]);
}

function isIdentifier(node, name) {
	if ( node.type != Syntax.Identifier ) {
		return false;
	}
	if ( typeof name == "string" ) {
		return name === node.name;
	}
	for (let i = 0; i < name.length; i++) {
		if ( name[i] === node.name || name[i] === "*" ) {
			return true;
		}
	}
	return false;
}

function getPropertyKey(property) {
	if ( property.key.type === Syntax.Identifier ) {
		return property.key.name;
	} else if ( property.key.type === Syntax.Literal ) {
		return String(property.key.value);
	} else {
		throw new Error();
	}
}

function findOwnProperty(obj, name) {
	const property = obj && obj.properties.find((property) => getPropertyKey(property) === name);
	return property && property.value;
}

function getValue(obj, names) {
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
function getStringArray(array, skipNonStringLiterals) {
	return array.elements.reduce( (result, item) => {
		if ( isString(item) ) {
			result.push(item.value);
		} else if ( !skipNonStringLiterals ) {
			throw new TypeError("array element is not a string literal:" + item.type);
		}
		return result;
	}, []);
}

module.exports = {
	isString,
	isBoolean,
	isMethodCall,
	isNamedObject,
	isIdentifier,
	getLocation: function(args) {
		// NODE-TODO include line information in future
		return args[0].value;
	},
	getPropertyKey,
	findOwnProperty,
	getValue,
	getStringArray
};

import test from "ava";
import {parseJS} from "../../../../lib/lbt/utils/parseUtils.js";
import * as ASTUtils from "../../../../lib/lbt/utils/ASTUtils.js";

/*
 * remove start/end properties before comparing AST nodes
 */
const cleanse = (node) => {
	delete node.start;
	delete node.end;
	return node;
};

test("isString", (t) => {
	t.false(ASTUtils.isString(null));

	const literal = parseJS("'testValue47'").body[0].expression;

	t.true(ASTUtils.isString(literal), "is a literal");
	t.true(ASTUtils.isString(literal, "testValue47"), "is a literal and its value matches");
	t.false(ASTUtils.isString({}), "empty object is not a literal");
	t.false(ASTUtils.isString(literal, "myOtherValue47"), "is a literal but its value does not match");
});

test("isString (template literal)", (t) => {
	t.false(ASTUtils.isString(null));

	const templateliteral = parseJS("`testValue47`").body[0].expression;

	t.true(ASTUtils.isString(templateliteral), "is a template literal");
	t.true(ASTUtils.isString(templateliteral, "testValue47"), "is a template literal and its value matches");
	t.true(ASTUtils.isString(templateliteral, `testValue47`),
		"is a template literal and its value matches (template literal)");
	t.false(ASTUtils.isString(templateliteral, "myOtherValue47"), "is a template literal but its value does not match");
});

test("isBoolean", (t) => {
	t.false(ASTUtils.isString(null));

	const trueLiteral = parseJS("true").body[0].expression;
	const falseLiteral = parseJS("false").body[0].expression;
	const stringLiteral = parseJS("'some string'").body[0].expression;
	const call = parseJS("setTimeout()").body[0];

	t.true(ASTUtils.isBoolean(trueLiteral), "is a boolean literal");
	t.true(ASTUtils.isBoolean(falseLiteral), "is a boolean literal");
	t.false(ASTUtils.isBoolean(stringLiteral), "is not a boolean literal");
	t.false(ASTUtils.isBoolean(call), "is not a boolean literal");
	t.true(ASTUtils.isBoolean(trueLiteral, true), "is a literal and its value matches");
	t.false(ASTUtils.isBoolean(trueLiteral, false), "is a literal and value does not matches");
	t.true(ASTUtils.isBoolean(falseLiteral, false), "is a literal and its value matches");
	t.false(ASTUtils.isBoolean(falseLiteral, true), "is a literal and value does not matches");
});

test("isIdentifier (identifier)", (t) => {
	const literal = parseJS("'testValue47'").body[0].expression;

	t.false(ASTUtils.isIdentifier(literal), "A literal is not an identifier");


	const identifier = parseJS("testValue47").body[0].expression;

	t.true(ASTUtils.isIdentifier(identifier, ["*"], "asterisk matches any string"));
	t.true(ASTUtils.isIdentifier(identifier, ["testValue47"], "value matches"));
	t.true(ASTUtils.isIdentifier(identifier, "testValue47"), "value matches");

	t.false(ASTUtils.isIdentifier(identifier, ""), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "*"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "myOtherValue47"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, [], "value does not match"));
});

test("isIdentifier (object pattern)", (t) => {
	const identifier = parseJS("const { a, b } = { a: 'x', b: 'y' }").body[0].declarations[0].id;

	t.true(ASTUtils.isIdentifier(identifier, ["*"], "asterisk matches any string"));
	t.true(ASTUtils.isIdentifier(identifier, ["a"], "value matches"));
	t.true(ASTUtils.isIdentifier(identifier, "a"), "value matches");
	t.true(ASTUtils.isIdentifier(identifier, ["b"], "value matches"));
	t.true(ASTUtils.isIdentifier(identifier, "b"), "value matches");

	t.false(ASTUtils.isIdentifier(identifier, ""), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "*"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "c"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, [], "value does not match"));
});

test("isIdentifier (arry pattern)", (t) => {
	const identifier = parseJS("const [ a, b ] = [ 'x', 'y' ]").body[0].declarations[0].id;

	t.true(ASTUtils.isIdentifier(identifier, ["*"], "asterisk matches any string"));
	t.true(ASTUtils.isIdentifier(identifier, ["a"], "value matches"));
	t.true(ASTUtils.isIdentifier(identifier, "a"), "value matches");
	t.true(ASTUtils.isIdentifier(identifier, ["b"], "value matches"));
	t.true(ASTUtils.isIdentifier(identifier, "b"), "value matches");

	t.false(ASTUtils.isIdentifier(identifier, ""), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "*"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "c"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, [], "value does not match"));
});


test("isNamedObject", (t) => {
	const identifier = parseJS("testValue47").body[0].expression;
	t.true(ASTUtils.isNamedObject(identifier, ["testValue47"], 1), "object with depths 1 is named testValue47");

	t.false(ASTUtils.isNamedObject(identifier, ["testValue47"], 2), "object with depths 2 is not named testValue47");
	t.false(ASTUtils.isNamedObject(identifier, ["testValue47"], 0), "object with depths 0 is not named testValue47");


	const member = parseJS("x.testValue47").body[0].expression;
	t.true(ASTUtils.isNamedObject(member, ["x", "testValue47"], 2),
		"object with depths 1 is named x and with depths 2 testValue47");
	t.false(ASTUtils.isNamedObject(member, ["x", "testValue47"], 1), "object with depths 1 is not named testValue47");
	t.false(ASTUtils.isNamedObject(member, ["x", "testValue47"], 0), "object with depths 0 is not named testValue47");
});

test("isMethodCall", (t) => {
	const identifier = parseJS("testValue47").body[0].expression;
	t.false(ASTUtils.isMethodCall(identifier), "identifier testValue47 is not a method call");


	const methodCall = parseJS("testValue47()").body[0].expression;
	t.true(ASTUtils.isMethodCall(methodCall, ["testValue47"]), "testValue47 is a method call");
	t.false(ASTUtils.isMethodCall(methodCall, ["myOtherValue47"]), "myOtherValue47 is not a method call");
	t.false(ASTUtils.isMethodCall(methodCall, ["*"]), "* is not a method call");
});

test("getStringArray", (t) => {
	const array = parseJS("['a', 5]").body[0].expression;
	t.throws(() => {
		ASTUtils.getStringArray(array);
	}, {
		instanceOf: TypeError,
		message: "array element is not a string literal: Literal"
	}, "array contains a number");

	const stringArray = parseJS("['a', 'x']").body[0].expression;
	t.deepEqual(ASTUtils.getStringArray(stringArray), ["a", "x"], "array contains only strings");
});

test("getStringArray (skipNonStringLiterals=true)", (t) => {
	const array = parseJS("['a', `x`, true, 5, `${foo}`, {}]").body[0].expression;
	t.deepEqual(ASTUtils.getStringArray(array, true), ["a", "x"], "result contains only strings");
});

test("getStringArray (template literal)", (t) => {
	const array = parseJS("[`a`, `${a}`]").body[0].expression;
	t.throws(() => {
		ASTUtils.getStringArray(array);
	}, {
		instanceOf: TypeError,
		message: "array element is a template literal with expressions"
	});

	const stringArray = parseJS("[`a`, 'x']").body[0].expression;
	t.deepEqual(ASTUtils.getStringArray(stringArray), ["a", "x"],
		"array contains only strings or template literals without expressions");
});

test("getLocation", (t) => {
	t.is(ASTUtils.getLocation([{value: "module/name"}]), "module/name");
});

test("getPropertyKey", (t) => {
	// quoted key
	const quotedProperties = parseJS("var myVar = {'a':'x'}").body[0].declarations[0].init.properties;
	t.is(ASTUtils.getPropertyKey(quotedProperties[0]), "a", "sole property key is 'a'");

	// unquoted key
	const unQuotedProperties = parseJS("var myVar = {a:'x'}").body[0].declarations[0].init.properties;
	t.is(ASTUtils.getPropertyKey(unQuotedProperties[0]), "a", "sole property key is 'a'");

	// quoted key with dash
	const dashedProperties = parseJS("var myVar = {'my-var': 47}").body[0].declarations[0].init.properties;
	t.is(ASTUtils.getPropertyKey(dashedProperties[0]), "my-var", "sole property key is 'my-var'");

	// SpreadElement (not supported)
	const spreadElement = parseJS("var myVar = { ...foo }").body[0].declarations[0].init.properties;
	t.is(ASTUtils.getPropertyKey(spreadElement[0]), undefined);

	// Computed property key (not supported)
	const computedKey = parseJS(`var myVar = { ["foo" + "bar"]: 42 }`).body[0].declarations[0].init.properties;
	t.is(ASTUtils.getPropertyKey(computedKey[0]), undefined);
});

test("findOwnProperty", (t) => {
	const literal = cleanse(parseJS("'x'").body[0].expression);
	const identifier = cleanse(parseJS("a").body[0].expression);

	// quoted
	const object = parseJS("var myVar = {'a':'x'}").body[0].declarations[0].init;
	t.deepEqual(cleanse(ASTUtils.findOwnProperty(object, "a")), literal, "object property a's value is literal 'x'");

	// unquoted
	const object2 = parseJS("var myVar = {a:'x'}").body[0].declarations[0].init;
	t.deepEqual(cleanse(ASTUtils.findOwnProperty(object2, "a")), literal, "object property a's value is literal 'x'");

	// number
	const object3 = parseJS("var myVar = {3: 'x'}").body[0].declarations[0].init;
	t.deepEqual(cleanse(ASTUtils.findOwnProperty(object3, "3")), literal,
		"object property 3's value is identifier a");

	// shorthand identifier
	const object4 = parseJS("var myVar = {a}").body[0].declarations[0].init;
	t.deepEqual(cleanse(ASTUtils.findOwnProperty(object4, "a")), identifier,
		"object property a's value is identifier a");
});

test("getValue", (t) => {
	t.falsy(ASTUtils.getValue(null, []));
	t.falsy(ASTUtils.getValue(null, ["a"]));

	const literal = cleanse(parseJS("'x'").body[0].expression);

	const object = parseJS("var myVar = {'a':'x'}").body[0].declarations[0].init;
	t.deepEqual(cleanse(ASTUtils.getValue(object, ["a"])), literal, "object property a's value is literal 'x'");

	const object2 = parseJS("var myVar = {a:'x'}").body[0].declarations[0].init;
	t.deepEqual(cleanse(ASTUtils.getValue(object2, ["a"])), literal, "object property a's value is literal 'x'");
});

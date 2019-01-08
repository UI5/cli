const {test} = require("ava");
const esprima = require("esprima");
const ASTUtils = require("../../../../lib/lbt/utils/ASTUtils");


test("isString", (t) => {
	t.false(ASTUtils.isString(null));

	const literal = esprima.parse("'testValue47'").body[0].expression;

	t.true(ASTUtils.isString(literal), "is a literal");
	t.true(ASTUtils.isString(literal, "testValue47"), "is a literal and its value matches");
	t.false(ASTUtils.isString({}), "empty object is not a literal");
	t.false(ASTUtils.isString(literal, "myOtherValue47"), "is a literal but its value does not match");
});

test("isIdentifier", (t) => {
	const literal = esprima.parse("'testValue47'").body[0].expression;

	t.false(ASTUtils.isIdentifier(literal), "A literal is not an identifier");


	const identifier = esprima.parse("testValue47").body[0].expression;

	t.true(ASTUtils.isIdentifier(identifier, ["*"], "asterisk matches any string"));
	t.true(ASTUtils.isIdentifier(identifier, ["testValue47"], "value matches"));
	t.true(ASTUtils.isIdentifier(identifier, "testValue47"), "value matches");

	t.false(ASTUtils.isIdentifier(identifier, ""), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "*"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, "myOtherValue47"), "value does not match");
	t.false(ASTUtils.isIdentifier(identifier, [], "value does not match"));
});


test("isNamedObject", (t) => {
	const identifier = esprima.parse("testValue47").body[0].expression;
	t.true(ASTUtils.isNamedObject(identifier, ["testValue47"], 1), "object with depths 1 is named testValue47");

	t.false(ASTUtils.isNamedObject(identifier, ["testValue47"], 2), "object with depths 2 is not named testValue47");
	t.false(ASTUtils.isNamedObject(identifier, ["testValue47"], 0), "object with depths 0 is not named testValue47");


	const member = esprima.parse("x.testValue47").body[0].expression;
	t.true(ASTUtils.isNamedObject(member, ["x", "testValue47"], 2),
		"object with depths 1 is named x and with depths 2 testValue47");
	t.false(ASTUtils.isNamedObject(member, ["x", "testValue47"], 1), "object with depths 1 is not named testValue47");
	t.false(ASTUtils.isNamedObject(member, ["x", "testValue47"], 0), "object with depths 0 is not named testValue47");
});

test("isMethodCall", (t) => {
	const identifier = esprima.parse("testValue47").body[0].expression;
	t.false(ASTUtils.isMethodCall(identifier), "identifier testValue47 is not a method call");


	const methodCall = esprima.parse("testValue47()").body[0].expression;
	t.true(ASTUtils.isMethodCall(methodCall, ["testValue47"]), "testValue47 is a method call");
	t.false(ASTUtils.isMethodCall(methodCall, ["myOtherValue47"]), "myOtherValue47 is not a method call");
	t.false(ASTUtils.isMethodCall(methodCall, ["*"]), "* is not a method call");
});

test("getStringArray", (t) => {
	const array = esprima.parse("['a', 5]").body[0].expression;
	const error = t.throws(() => {
		ASTUtils.getStringArray(array);
	}, TypeError, "array contains a number");

	t.deepEqual(error.message, "array element is not a string literal:Literal");

	const stringArray = esprima.parse("['a', 'x']").body[0].expression;
	t.deepEqual(ASTUtils.getStringArray(stringArray), ["a", "x"], "array contains only strings");
});

test("getLocation", (t) => {
	t.deepEqual(ASTUtils.getLocation(), "");
});

test("getPropertyKey", (t) => {
	// quoted key
	const quotedProperties = esprima.parse("var myVar = {'a':'x'}").body[0].declarations[0].init.properties;
	t.deepEqual(ASTUtils.getPropertyKey(quotedProperties[0]), "a", "sole property key is 'a'");

	// unquoted key
	const unQuotedProperties = esprima.parse("var myVar = {a:'x'}").body[0].declarations[0].init.properties;
	t.deepEqual(ASTUtils.getPropertyKey(unQuotedProperties[0]), "a", "sole property key is 'a'");

	// quoted key with dash
	const dashedProperties = esprima.parse("var myVar = {'my-var': 47}").body[0].declarations[0].init.properties;
	t.deepEqual(ASTUtils.getPropertyKey(dashedProperties[0]), "my-var", "sole property key is 'my-var'");
});

test("findOwnProperty", (t) => {
	const literal = esprima.parse("'x'").body[0].expression;

	// quoted
	const object = esprima.parse("var myVar = {'a':'x'}").body[0].declarations[0].init;
	t.deepEqual(ASTUtils.findOwnProperty(object, "a"), literal, "object property a's value is literal 'x'");

	// unquoted
	const object2 = esprima.parse("var myVar = {a:'x'}").body[0].declarations[0].init;
	t.deepEqual(ASTUtils.findOwnProperty(object2, "a"), literal, "object property a's value is literal 'x'");
});

test("getValue", (t) => {
	t.falsy(ASTUtils.getValue(null, []));
	t.falsy(ASTUtils.getValue(null, ["a"]));

	const literal = esprima.parse("'x'").body[0].expression;
	const object = esprima.parse("var myVar = {'a':'x'}").body[0].declarations[0].init;

	t.deepEqual(ASTUtils.getValue(object, ["a"]), literal, "object property a's value is literal 'x'");

	const object2 = esprima.parse("var myVar = {a:'x'}").body[0].declarations[0].init;
	t.deepEqual(ASTUtils.getValue(object2, ["a"]), literal, "object property a's value is literal 'x'");
});

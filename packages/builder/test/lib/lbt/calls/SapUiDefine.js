const test = require("ava");
const esprima = require("esprima");
const Syntax = esprima.Syntax;

const SapUiDefineCall = require("../../../../lib/lbt/calls/SapUiDefine");

function parse(code) {
	const ast = esprima.parseScript(code);
	return ast.body[0].expression;
}

test("Named Define", (t) => {
	const ast = parse("sap.ui.define('HardcodedName', [], function() {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.name, "HardcodedName");
});

test("Unnamed Define", (t) => {
	const ast = parse("sap.ui.define([], function() {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.name, "FileSystemName");
});

test("Dependencies", (t) => {
	const ast = parse("sap.ui.define(['a', 'b', 'c'], function(a,b,c) {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.deepEqual(call.dependencies, ["a.js", "b.js", "c.js"]);
	t.is(call.dependencyInsertionIdx, 3);
});

test("Insertion index for Dependencies", (t) => {
	const ast = parse("sap.ui.define(['a', 'b'], function(a) {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.deepEqual(call.dependencies, ["a.js", "b.js"]);
	t.is(call.dependencyInsertionIdx, 1);
});

test("Factory", (t) => {
	const ast = parse("sap.ui.define([], function() { return 42; });");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.true(call.factory != null);
	t.is(call.factory.type, Syntax.FunctionExpression);
});

test("Find Import Name (successful)", (t) => {
	const ast = parse("sap.ui.define(['wanted'], function(johndoe) {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.findImportName("wanted.js"), "johndoe");
});

test("Find Import Name (not successful)", (t) => {
	const ast = parse("sap.ui.define(['bonnie'], function(clyde) {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.findImportName("wanted.js"), null);
});

test("Find Import Name (no dependencies)", (t) => {
	const ast = parse("sap.ui.define(function() {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.findImportName("wanted.js"), null);
});

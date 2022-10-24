import test from "ava";
import {parseJS, Syntax} from "../../../../lib/lbt/utils/parseUtils.js";
import SapUiDefineCall from "../../../../lib/lbt/calls/SapUiDefine.js";
import sinonGlobal from "sinon";
import esmock from "esmock";

function parse(code) {
	const ast = parseJS(code);
	return ast.body[0].expression;
}

async function setupSapUiDefineCallWithStubbedLogger({context}) {
	const {sinon} = context;
	context.warningLogSpy = sinon.spy();
	context.SapUiDefineCallWithStubbedLogger = await esmock("../../../../lib/lbt/calls/SapUiDefine.js", {
		"@ui5/logger": {
			getLogger: {
				warn: context.warningLogSpy
			}
		}
	});
}

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Empty Define", (t) => {
	const ast = parse("sap.ui.define();");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.true(call != null, "call could be parsed");
});

test("Named Define", (t) => {
	const ast = parse("sap.ui.define('HardcodedName', [], function() {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.name, "HardcodedName");
});

test("Named Define (template literal)", (t) => {
	const ast = parse("sap.ui.define(`HardcodedName`, [], function() {});");
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

test("No Factory", (t) => {
	const ast = parse("sap.ui.define(['a', 'b']);");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.deepEqual(call.dependencies, ["a.js", "b.js"]);
	t.is(call.factory, null);
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

test("Find Import Name (template literal)", (t) => {
	const ast = parse("sap.ui.define([`wanted`], function(johndoe) {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.findImportName("wanted.js"), "johndoe");
});

test("Find Import Name (destructuring)", (t) => {
	const ast = parse("sap.ui.define(['invalid', 'wanted', 'invalid1'], function({inv}, johndoe, [inv1]) {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.findImportName("invalid.js"), null);
	t.is(call.findImportName("wanted.js"), "johndoe");
	t.is(call.findImportName("invalid1.js"), null);
});

test.serial("Find Import Name (async function)", async (t) => {
	await setupSapUiDefineCallWithStubbedLogger(t);
	const {SapUiDefineCallWithStubbedLogger, warningLogSpy} = t.context;
	const ast = parse("sap.ui.define(['wanted'], async function(johndoe) {});");
	const call = new SapUiDefineCallWithStubbedLogger(ast, "FileSystemName");
	t.is(call.findImportName("wanted.js"), "johndoe");
	t.is(warningLogSpy.callCount, 0, "Warning log is not called");
});

test.serial("Find Import Name (async arrow function)", async (t) => {
	await setupSapUiDefineCallWithStubbedLogger(t);
	const {SapUiDefineCallWithStubbedLogger, warningLogSpy} = t.context;
	const ast = parse("sap.ui.define(['wanted'], async (johndoe) => {return johndoe});");
	const call = new SapUiDefineCallWithStubbedLogger(ast, "FileSystemName");
	t.is(call.findImportName("wanted.js"), "johndoe");
	t.is(warningLogSpy.callCount, 0, "Warning log is not called");
});

test.serial("Find Import Name (async arrow function with implicit return)", async (t) => {
	await setupSapUiDefineCallWithStubbedLogger(t);
	const {SapUiDefineCallWithStubbedLogger, warningLogSpy} = t.context;
	const ast = parse("sap.ui.define(['wanted'], async (johndoe) => johndoe);");
	const call = new SapUiDefineCallWithStubbedLogger(ast, "FileSystemName");
	t.is(call.findImportName("wanted.js"), "johndoe");
	t.is(warningLogSpy.callCount, 0, "Warning log is not called");
});

test("Export as Global: omitted", (t) => {
	const ast = parse("sap.ui.define(['wanted'], function(johndoe) {});");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.exportAsGlobal, false);
});

test("Export as Global: false", (t) => {
	const ast = parse("sap.ui.define(['wanted'], function(johndoe) {}, false);");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.exportAsGlobal, false);
});

test("Export as Global: true", (t) => {
	const ast = parse("sap.ui.define(['wanted'], function(johndoe) {}, true);");
	const call = new SapUiDefineCall(ast, "FileSystemName");
	t.is(call.exportAsGlobal, true);
});


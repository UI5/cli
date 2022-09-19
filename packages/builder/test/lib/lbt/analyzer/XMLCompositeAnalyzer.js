const test = require("ava");
const {parseJS} = require("../../../../lib/lbt/utils/parseUtils");
const XMLCompositeAnalyzer = require("../../../../lib/lbt/analyzer/XMLCompositeAnalyzer");
const ModuleInfo = require("../../../../lib/lbt/resources/ModuleInfo");
const sinonGlobal = require("sinon");
const logger = require("@ui5/logger");
const loggerInstance = logger.getLogger();
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	mock.stopAll();
});

function setupXMLCompositeAnalyzerWithStubbedLogger({context}) {
	const {sinon} = context;
	context.warningLogSpy = sinon.spy(loggerInstance, "warn");
	sinon.stub(logger, "getLogger").returns(loggerInstance);
	context.XMLCompositeAnalyzerWithStubbedLogger =
		mock.reRequire("../../../../lib/lbt/analyzer/XMLCompositeAnalyzer");
}

test("integration: XMLComposite code with VariableDeclaration", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		function(jQuery, XMLComposite) {
		"use strict";
		var ButtonList = XMLComposite.extend("composites.ButtonList", {});
		return ButtonList;
	});`;

	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name");
});

test("integration: XMLComposite code", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		function(jQuery, XMLComposite) {
		"use strict";
		return XMLComposite.extend("composites.ButtonList", {});
	});`;

	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name");
});

test("integration: XMLComposite code (arrow factory function)", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		(jQuery, XMLComposite) => {
		return XMLComposite.extend("composites.ButtonList", {});
	});`;

	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name");
});

test("integration: XMLComposite code (arrow factory function with implicit return)", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		(jQuery, XMLComposite) => XMLComposite.extend("composites.ButtonList", {}));`;

	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name");
});

test.serial("integration: XMLComposite code (async factory function)", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		async function(jQuery, XMLComposite) {
		"use strict";
		return XMLComposite.extend("composites.ButtonList", {});
	});`;
	setupXMLCompositeAnalyzerWithStubbedLogger(t);
	const {XMLCompositeAnalyzerWithStubbedLogger} = t.context;
	const ast = parseJS(code);
	const analyzer = new XMLCompositeAnalyzerWithStubbedLogger();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name");
});

test.serial("integration: XMLComposite code (async arrow factory function)", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		async (jQuery, XMLComposite) => {
		return XMLComposite.extend("composites.ButtonList", {});
	});`;
	setupXMLCompositeAnalyzerWithStubbedLogger(t);
	const {XMLCompositeAnalyzerWithStubbedLogger} = t.context;
	const ast = parseJS(code);
	const analyzer = new XMLCompositeAnalyzerWithStubbedLogger();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name");
});

test.serial("integration: XMLComposite code (async arrow factory function with implicit return)", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		async (jQuery, XMLComposite) => XMLComposite.extend("composites.ButtonList", {}));`;
	setupXMLCompositeAnalyzerWithStubbedLogger(t);
	const {XMLCompositeAnalyzerWithStubbedLogger} = t.context;
	const ast = parseJS(code);
	const analyzer = new XMLCompositeAnalyzerWithStubbedLogger();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name");
});

test("integration: XMLComposite code with SpreadElement", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		(jQuery, XMLComposite) => {
		const myXMLComposite = {
			fragment: "composites.custom.ButtonList"
		};
		return XMLComposite.extend("composites.ButtonList", {
			...myXMLComposite
		});
	});`;


	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const name = "composites.ButtonList";
	const moduleInfo = new ModuleInfo();
	analyzer.analyze(ast, name, moduleInfo);

	t.deepEqual(moduleInfo.dependencies, ["composites/ButtonList.control.xml"],
		"Dependency should be created from composite name because overridden by the 'fragment' property " +
		" is not possible to lacking SpreadElement support");
});

test("analyze: not an XMLComposite module", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		function(jQuery, XMLComposite) {
		"use strict";
		return {};
	});`;

	const ast = parseJS(code);

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = t.context.sinon.spy(moduleInfo, "addDependency");

	const analyzer = new XMLCompositeAnalyzer();
	const stubCheckForXMLCClassDefinition =
		t.context.sinon.stub(analyzer, "_checkForXMLCClassDefinition").returns("cow");
	const name = "composites.ButtonList";
	analyzer.analyze(ast, name, moduleInfo);
	t.false(stubCheckForXMLCClassDefinition.called, "_checkForXMLCClassDefinition was not called");
	t.false(stubAddDependency.called, "addDependency was not called");
});

test("analyze: XMLComposite VariableDeclaration code", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		function(jQuery, XMLComposite) {
		"use strict";
		var ButtonList = XMLComposite.extend("composites.ButtonList", {});
		return ButtonList;
	});`;

	const ast = parseJS(code);

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = t.context.sinon.spy(moduleInfo, "addDependency");

	const analyzer = new XMLCompositeAnalyzer();
	const stubCheckForXMLCClassDefinition =
		t.context.sinon.stub(analyzer, "_checkForXMLCClassDefinition").returns("cow");
	const name = "composites.ButtonList";
	analyzer.analyze(ast, name, moduleInfo);
	t.true(stubCheckForXMLCClassDefinition.calledOnce, "_checkForXMLCClassDefinition was called once");
	t.is(stubCheckForXMLCClassDefinition.getCall(0).args[0], "XMLComposite",
		"_checkForXMLCClassDefinition should be called with the name");


	t.true(stubAddDependency.calledOnce, "addDependency was called once");
	t.is(stubAddDependency.getCall(0).args[0], "cow.control.xml",
		"addDependency should be called with the dependency name");
});


test("analyze: XMLComposite Expression code", (t) => {
	const code = `sap.ui.define([
		'jquery.sap.global', 'sap/ui/core/XMLComposite'],
		function(jQuery, XMLComposite) {
		"use strict";
		jQuery.sap.test = XMLComposite.extend("composites.ButtonList", {});
	});`;

	const ast = parseJS(code);

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = t.context.sinon.spy(moduleInfo, "addDependency");

	const analyzer = new XMLCompositeAnalyzer();
	const stubCheckForXMLCClassDefinition =
		t.context.sinon.stub(analyzer, "_checkForXMLCClassDefinition").returns("cow");
	const name = "composites.ButtonList";
	analyzer.analyze(ast, name, moduleInfo);
	t.true(stubCheckForXMLCClassDefinition.calledOnce, "_checkForXMLCClassDefinition was called once");
	t.is(stubCheckForXMLCClassDefinition.getCall(0).args[0], "XMLComposite",
		"_checkForXMLCClassDefinition should be called with the name");


	t.true(stubAddDependency.calledOnce, "addDependency was called once");
	t.is(stubAddDependency.getCall(0).args[0], "cow.control.xml",
		"addDependency should be called with the dependency name");
});

test("_checkForXMLCClassDefinition: string argument and object expression", (t) => {
	const code = `XMLComposite.extend("composites.ButtonList", {})`;

	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const stubAnalyzeXMLCClassDefinition = t.context.sinon.stub(analyzer, "_analyzeXMLCClassDefinition").returns("cow");
	const result = analyzer._checkForXMLCClassDefinition("XMLComposite", ast.body[0].expression);
	t.true(stubAnalyzeXMLCClassDefinition.calledOnce, "_checkForXMLCClassDefinition was called once");

	t.is(result, "cow",
		"addDependency should be called with the dependency name");
});

test("_checkForXMLCClassDefinition: string argument (template literal)", (t) => {
	const code = `XMLComposite.extend(\`composites.ButtonList\`, {})`;
	const ast = parseJS(code);
	const analyzer = new XMLCompositeAnalyzer();
	const fragmentName = analyzer._checkForXMLCClassDefinition("XMLComposite", ast.body[0].expression);
	t.is(fragmentName, "composites.ButtonList");
});

test("_analyzeXMLCClassDefinition: name retrieval", (t) => {
	const code = `test({fragment: "cat"})`;

	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const result = analyzer._analyzeXMLCClassDefinition(ast.body[0].expression.arguments[0]);

	t.is(result, "cat",
		"addDependency should be called with the dependency name");
});

test("_analyzeXMLCClassDefinition: name retrieval (template literal)", (t) => {
	const code = `test({fragment: \`cat\`})`;

	const ast = parseJS(code);

	const analyzer = new XMLCompositeAnalyzer();
	const result = analyzer._analyzeXMLCClassDefinition(ast.body[0].expression.arguments[0]);

	t.is(result, "cat",
		"addDependency should be called with the dependency name");
});

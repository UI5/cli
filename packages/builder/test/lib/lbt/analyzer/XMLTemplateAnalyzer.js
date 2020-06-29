const test = require("ava");
const XMLTemplateAnalyzer = require("../../../../lib/lbt/analyzer/XMLTemplateAnalyzer");
const ModuleInfo = require("../../../../lib/lbt/resources/ModuleInfo");
const sinon = require("sinon");

const fakeMockPool = {
	findResource: () => Promise.resolve()
};

test("integration: Analysis of an xml view", async (t) => {
	const xml = `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:m="sap.m" xmlns:l="sap.ui.layout"
		controllerName="myController">
			<l:HorizontalLayout id="layout">
				<m:Button text="Button 1" id="button1" />
				<m:Button text="Button 2" id="button2" />
				<m:Button text="Button 3" id="button3" />
				<m:Button />
			</l:HorizontalLayout>
		</mvc:View>`;

	const moduleInfo = new ModuleInfo();

	const analyzer = new XMLTemplateAnalyzer(fakeMockPool);
	await analyzer.analyzeView(xml, moduleInfo);
	t.deepEqual(moduleInfo.dependencies,
		[
			"sap/ui/core/mvc/XMLView.js",
			"myController.controller.js",
			"sap/ui/layout/HorizontalLayout.js",
			"sap/m/Button.js"
		], "Dependencies should come from the XML template");
	t.true(moduleInfo.isImplicitDependency("sap/ui/core/mvc/XMLView.js"),
		"Implicit dependency should be added since an XMLView is analyzed");
});

test("integration: Analysis of an xml view with data binding in properties", async (t) => {
	const xml = `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:core="sap.ui.core"
		controllerName="myController">
			<core:ComponentContainer async="true" name="{/component}" />
		</mvc:View>`;

	const moduleInfo = new ModuleInfo();

	const analyzer = new XMLTemplateAnalyzer(fakeMockPool);
	await analyzer.analyzeView(xml, moduleInfo);
	t.deepEqual(moduleInfo.dependencies,
		[
			"sap/ui/core/mvc/XMLView.js",
			"myController.controller.js",
			"sap/ui/core/ComponentContainer.js"
		], "Dependencies should come from the XML template");
	t.true(moduleInfo.isImplicitDependency("sap/ui/core/mvc/XMLView.js"),
		"Implicit dependency should be added since an XMLView is analyzed");
});

test("integration: Analysis of an xml view with core:require", async (t) => {
	const xml = `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:core="sap.ui.core" xmlns="sap.m"
		controllerName="myController"
		core:require="{
			Foo:'sap/ui/Foo',
			Bar:'myApp/Bar'
		}">

			<Button core:require="{Toast:'sap/m/MessageToast'}" text="Show Toast" press="Toast.show(\${$source>text})"/>

		</mvc:View>`;

	const moduleInfo = new ModuleInfo();

	const analyzer = new XMLTemplateAnalyzer(fakeMockPool);
	await analyzer.analyzeView(xml, moduleInfo);
	t.deepEqual(moduleInfo.dependencies,
		[
			"sap/ui/core/mvc/XMLView.js",
			"myController.controller.js",
			"sap/ui/Foo.js",
			"myApp/Bar.js",
			"sap/m/MessageToast.js",
			"sap/m/Button.js"
		], "Dependencies should come from the XML template");
	t.true(moduleInfo.isImplicitDependency("sap/ui/core/mvc/XMLView.js"),
		"Implicit dependency should be added since an XMLView is analyzed");
});

test("integration: Analysis of an xml view with core:require (invalid module name)", async (t) => {
	const xml = `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:core="sap.ui.core" xmlns="sap.m"
		controllerName="myController"
		core:require="{
			Foo: { 'bar': true },
			Bar: 123
		}">

			<Button core:require="{ Toast: '' }" text="Show Toast" press="Toast.show(\${$source>text})"/>

		</mvc:View>`;

	const moduleInfo = new ModuleInfo();

	const analyzer = new XMLTemplateAnalyzer(fakeMockPool);
	await analyzer.analyzeView(xml, moduleInfo);
	t.deepEqual(moduleInfo.dependencies,
		[
			"sap/ui/core/mvc/XMLView.js",
			"myController.controller.js",
			"sap/m/Button.js"
		], "Dependencies should come from the XML template");
	t.true(moduleInfo.isImplicitDependency("sap/ui/core/mvc/XMLView.js"),
		"Implicit dependency should be added since an XMLView is analyzed");
});

test("integration: Analysis of an xml view with core:require (parsing error)", async (t) => {
	const xml = `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:core="sap.ui.core" xmlns="sap.m"
		controllerName="myController"
		core:require="{
			Foo:'sap/ui/Foo'
			Bar:'myApp/Bar'
		}">

			<Button core:require="this can't be parsed" text="Show Toast" press="Toast.show(\${$source>text})"/>

		</mvc:View>`;

	const moduleInfo = new ModuleInfo();

	const analyzer = new XMLTemplateAnalyzer(fakeMockPool);
	await analyzer.analyzeView(xml, moduleInfo);
	t.deepEqual(moduleInfo.dependencies,
		[
			"sap/ui/core/mvc/XMLView.js",
			"myController.controller.js",
			"sap/m/Button.js"
		], "Dependencies should come from the XML template");
	t.true(moduleInfo.isImplicitDependency("sap/ui/core/mvc/XMLView.js"),
		"Implicit dependency should be added since an XMLView is analyzed");
});

test("integration: Analysis of an xml fragment", async (t) => {
	const xml = `<HBox xmlns:m="sap.m" xmlns:l="sap.ui.layout" controllerName="myController">
			<items>
				<l:HorizontalLayout id="layout">
					<m:Button text="Button 1" id="button1" />
					<m:Button text="Button 2" id="button2" />
					<m:Button text="Button 3" id="button3" />
				</l:HorizontalLayout>
			</items>
		</HBox>`;

	const moduleInfo = new ModuleInfo();

	const analyzer = new XMLTemplateAnalyzer(fakeMockPool);
	await analyzer.analyzeFragment(xml, moduleInfo);
	t.deepEqual(moduleInfo.dependencies,
		[
			"sap/ui/core/Fragment.js",
			"sap/ui/layout/HorizontalLayout.js",
			"sap/m/Button.js"
		]);
	t.true(moduleInfo.isImplicitDependency("sap/ui/core/Fragment.js"),
		"Implicit dependency should be added since a fragment is analyzed");
});

test("integration: Analysis of an empty xml view", async (t) => {
	const xml = "";

	const moduleInfo = new ModuleInfo("empty.xml");

	const analyzer = new XMLTemplateAnalyzer(fakeMockPool);

	await t.throwsAsync(analyzer.analyzeView(xml, moduleInfo), {
		message: "Invalid empty XML document: empty.xml"
	}, "Should throw an error for empty XML views");
});

test("_addDependency: self reference", (t) => {
	const moduleInfo = {
		addDependency: function() {},
		name: "me"
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const analyzer = new XMLTemplateAnalyzer();
	analyzer.info = moduleInfo;
	analyzer._addDependency("me");
	t.false(stubAddDependency.called, "addDependency was not called");
});

test("_addDependency: add dependency", (t) => {
	const moduleInfo = {
		addDependency: function() {},
		name: "me"
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const analyzer = new XMLTemplateAnalyzer();
	analyzer.info = moduleInfo;
	analyzer._addDependency("new");
	t.true(stubAddDependency.calledOnce, "addDependency was called");
	t.deepEqual(stubAddDependency.getCall(0).args[0], "new",
		"addDependency should be called with the dependency name");
});

test("_analyze: parseString error", async (t) => {
	const analyzer = new XMLTemplateAnalyzer();
	sinon.stub(analyzer._parser, "parseString").callsArgWith(1, new Error("my-error"), "result");

	const error = await t.throwsAsync(analyzer._analyze());
	t.deepEqual(error.message, "my-error");
	t.false(analyzer.busy, "busy state is restored");
});

test("_analyze: call twice to simulate busy", async (t) => {
	const analyzer = new XMLTemplateAnalyzer();
	sinon.stub(analyzer._parser, "parseString").callsArgWith(1, false, "parse-result");
	sinon.stub(analyzer, "_analyzeNode").returns();

	const moduleInfo = {
		addImplicitDependency: function() {}
	};

	// first call sets it to busy
	const resultPromise = analyzer._analyze(null, moduleInfo, true);

	// second call fails since it is still busy
	const error = t.throws(()=> {
		analyzer._analyze(null, moduleInfo, true);
	});
	t.deepEqual(error.message, "analyzer is busy");

	await resultPromise;
	t.false(analyzer.busy, "busy state is reset after promise resolves");
});

test("_analyze: node", async (t) => {
	const analyzer = new XMLTemplateAnalyzer();
	sinon.stub(analyzer._parser, "parseString").callsArgWith(1, false, "parse-result");
	const stubAnalyzeNode = sinon.stub(analyzer, "_analyzeNode").returns();

	const moduleInfo = {
		addImplicitDependency: function() {}
	};
	const stubAddImplicitDependency = sinon.spy(moduleInfo, "addImplicitDependency");

	await analyzer._analyze(null, moduleInfo, true);

	t.true(stubAnalyzeNode.calledOnce, "_analyzeNode was called");
	t.deepEqual(stubAnalyzeNode.getCall(0).args[0], "parse-result",
		"_analyzeNode should be called with the result");

	t.true(stubAddImplicitDependency.calledOnce, "addImplicitDependency was called once");
	t.deepEqual(stubAddImplicitDependency.getCall(0).args[0], "sap/ui/core/Fragment.js",
		"addImplicitDependency should be called with the dependency name");
});

test("_analyze: viewRootNode", async (t) => {
	const analyzer = new XMLTemplateAnalyzer();
	sinon.stub(analyzer._parser, "parseString").callsArgWith(1, false, "parse-result");
	const stubAnalyzeViewRootNode = sinon.stub(analyzer, "_analyzeViewRootNode").returns();


	await analyzer._analyze(null, null, false);

	t.true(stubAnalyzeViewRootNode.calledOnce, "_analyzeViewRootNode was called");
	t.deepEqual(stubAnalyzeViewRootNode.getCall(0).args[0], "parse-result",
		"_analyzeViewRootNode should be called with the result");
});


test("_analyzeViewRootNode: process node", async (t) => {
	const analyzer = new XMLTemplateAnalyzer();
	analyzer.info = {
		addImplicitDependency: function() {},
		addDependency: function() {}
	};
	const stubAddImplicitDependency = sinon.spy(analyzer.info, "addImplicitDependency");
	const stubAddDependency = sinon.spy(analyzer.info, "addDependency");

	const stubAnalyzeChildren = sinon.stub(analyzer, "_analyzeChildren").returns();

	const node = {
		$: {
			controllerName: {
				value: "myController"
			},
			resourceBundleName: {
				value: "myResourceBundleName"
			}
		}
	};
	await analyzer._analyzeViewRootNode(node);

	t.true(stubAnalyzeChildren.calledOnce, "_analyzeChildren was called");
	t.deepEqual(stubAnalyzeChildren.getCall(0).args[0], node,
		"_analyzeChildren should be called with the result");

	t.true(stubAddImplicitDependency.calledOnce, "addImplicitDependency was called");
	t.deepEqual(stubAddImplicitDependency.getCall(0).args[0], "sap/ui/core/mvc/XMLView.js",
		"addImplicitDependency should be called with the dependency name");

	t.deepEqual(stubAddDependency.callCount, 2, "addDependency was called twice");
	t.deepEqual(stubAddDependency.getCall(0).args[0], "myController.controller.js",
		"addDependency should be called with the dependency name");
	t.deepEqual(stubAddDependency.getCall(1).args[0], "myResourceBundleName.properties",
		"addDependency should be called with the dependency name");
});

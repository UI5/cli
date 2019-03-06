const {test} = require("ava");
const SmartTemplateAnalyzer = require("../../../../lib/lbt/analyzer/SmartTemplateAnalyzer");
const ModuleInfo = require("../../../../lib/lbt/resources/ModuleInfo");
const sinon = require("sinon");
const esprima = require("esprima");


test("analyze: with Component.js", async (t) => {
	const emptyPool = {};
	const analyzer = new SmartTemplateAnalyzer(emptyPool);
	const name = "sap/ui/core/Component.js";
	const moduleInfo = {};
	const result = await analyzer.analyze({name}, moduleInfo);
	t.deepEqual(result, {}, "moduleInfo was not modified");
});

test("analyze: without manifest", async (t) => {
	const mockPool = {
		async findResource() {
			return {
				buffer: async () => {
					throw new Error("Some error");
				}
			};
		}
	};

	const moduleInfo = {};

	const analyzer = new SmartTemplateAnalyzer(mockPool);
	const stubAnalyzeManifest = sinon.stub(analyzer, "_analyzeManifest").resolves();

	const name = "MyComponent.js";
	const result = await analyzer.analyze({name}, moduleInfo);

	t.false(stubAnalyzeManifest.called, "_analyzeManifest was not called");
	t.deepEqual(result, {}, "empty module info object expected since resource was not found (rejects)");
});

test("_analyzeManifest: without manifest", async (t) => {
	const moduleInfo = {};

	const analyzer = new SmartTemplateAnalyzer();

	const result = await analyzer._analyzeManifest({}, moduleInfo);

	t.deepEqual(result, [], "resolves with empty array");
});


test("_analyzeManifest: with manifest with recursive pages", async (t) => {
	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const manifest = {
		"sap.ui.generic.app": {
			"pages": [{
				"component": {
					"name": "mycomp.js",
					"settings": {
						"templateName": "myTemplate"
					}
				},
				"pages": [{
					"component": {
						"name": "mycomp2.js",
						"settings": {
							"templateName": "myTemplate"
						}
					},
				}]
			}]
		}
	};

	const analyzer = new SmartTemplateAnalyzer();
	const stubAnalyzeTemplateComponent = sinon.stub(analyzer, "_analyzeTemplateComponent").resolves();

	await analyzer._analyzeManifest(manifest, moduleInfo);

	t.is(stubAnalyzeTemplateComponent.callCount, 2, "_analyzeTemplateComponent was called twice");
	t.deepEqual(stubAnalyzeTemplateComponent.getCall(0).args[0], "mycomp/js/Component.js",
		"_analyzeTemplateComponent should be called with the component");
	t.deepEqual(stubAnalyzeTemplateComponent.getCall(0).args[1], {
		"component": {
			"name": "mycomp.js",
			"settings": {
				"templateName": "myTemplate"
			}
		},
		"pages": [{
			"component": {
				"name": "mycomp2.js",
				"settings": {
					"templateName": "myTemplate"
				}
			},
		}]
	}, "_analyzeTemplateComponent should be called with the page");

	t.deepEqual(stubAnalyzeTemplateComponent.getCall(1).args[0], "mycomp2/js/Component.js",
		"_analyzeTemplateComponent should be called with the component");
	t.deepEqual(stubAnalyzeTemplateComponent.getCall(1).args[1], {
		"component": {
			"name": "mycomp2.js",
			"settings": {
				"templateName": "myTemplate"
			}
		}
	}, "_analyzeTemplateComponent should be called with the page");

	t.is(stubAddDependency.callCount, 2, "addDependency was called twice");
	t.deepEqual(stubAddDependency.getCall(0).args[0], "mycomp/js/Component.js",
		"addDependency should be called with the dependency name");
});


test.serial("_analyzeTemplateComponent: Manifest with TemplateAssembler code", async (t) => {
	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			return {
				buffer: async () => ""
			};
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("mytpl");
	const stubParse = sinon.stub(esprima, "parse").returns("");

	await analyzer._analyzeTemplateComponent("pony",
		{}, moduleInfo);

	t.true(stubAnalyzeAST.calledOnce, "_analyzeManifest was called once");
	t.deepEqual(stubAnalyzeAST.getCall(0).args[0], "pony",
		"_analyzeManifest should be called with the module name");


	t.true(stubAddDependency.calledOnce, "addDependency was called once");
	t.deepEqual(stubAddDependency.getCall(0).args[0], "mytpl.view.xml",
		"addDependency should be called with the dependency name");
	stubAnalyzeAST.restore();
	stubParse.restore();
});

test.serial("_analyzeTemplateComponent: no default template name", async (t) => {
	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			return {
				buffer: async () => ""
			};
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("");
	const stubParse = sinon.stub(esprima, "parse").returns("");

	await analyzer._analyzeTemplateComponent("pony",
		{}, moduleInfo);

	t.true(stubAnalyzeAST.calledOnce, "_analyzeManifest was called once");

	t.true(stubAddDependency.notCalled, "addDependency was not called");
	stubAnalyzeAST.restore();
	stubParse.restore();
});

test.serial("_analyzeTemplateComponent: with template name from pageConfig", async (t) => {
	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			return {
				buffer: async () => ""
			};
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("");
	const stubParse = sinon.stub(esprima, "parse").returns("");

	await analyzer._analyzeTemplateComponent("pony", {
		component: {
			settings: {
				templateName: "donkey"
			}
		}
	}, moduleInfo);

	t.true(stubAnalyzeAST.calledOnce, "_analyzeManifest was called once");

	t.true(stubAddDependency.calledOnce, "addDependency was called once");
	t.deepEqual(stubAddDependency.getCall(0).args[0], "donkey.view.xml",
		"addDependency should be called with the dependency name");
	stubAnalyzeAST.restore();
	stubParse.restore();
});

test("_analyzeAST: get template name from ast", async (t) => {
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"], 
	function(a, TemplateAssembler){   
		return TemplateAssembler.getTemplateComponent(getMethods,
		"sap.fe.templates.Page.Component", {
			metadata: {
				properties: {
					"templateName": {
						"type": "string",
						"defaultValue": "sap.fe.templates.Page.view.Page"
					}
				},
				"manifest": "json"
			}
		});});`;
	const ast = esprima.parse(code);

	const analyzer = new SmartTemplateAnalyzer();

	const stubAnalyzeTemplateClassDefinition = sinon.stub(analyzer,
		"_analyzeTemplateClassDefinition").returns("donkey");

	const result = await analyzer._analyzeAST("pony", ast);


	t.true(stubAnalyzeTemplateClassDefinition.calledOnce, "_analyzeTemplateClassDefinition was called once");

	stubAnalyzeTemplateClassDefinition.restore();
	t.deepEqual(result, "donkey");
});

test("_analyzeAST: no template name from ast", async (t) => {
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"], 
	function(a, TemplateAssembler){   
		return TemplateAssembler.getTemplateComponent(getMethods,
		"sap.fe.templates.Page.Component", {
			metadata: {
				properties: {
					"templateName": {
						"type": "string",
						"defaultValue": "sap.fe.templates.Page.view.Page"
					}
				},
				"manifest": "json"
			}
		});});`;
	const ast = esprima.parse(code);

	const analyzer = new SmartTemplateAnalyzer();

	const stubAnalyzeTemplateClassDefinition = sinon.stub(analyzer,
		"_analyzeTemplateClassDefinition").returns(false);

	const result = await analyzer._analyzeAST("pony", ast);


	t.true(stubAnalyzeTemplateClassDefinition.calledOnce, "_analyzeTemplateClassDefinition was called once");

	stubAnalyzeTemplateClassDefinition.restore();
	t.deepEqual(result, "");
});

test("Analysis of Manifest and TemplateAssembler code", async (t) => {
	const manifest = {
		"sap.ui.generic.app": {
			"pages": [{
				"component": {
					"name": "mycomp.js",
					"settings": {
						"templateName": "myTemplate"
					}
				},
			}]
		}
	};

	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"], 
		function(a, TemplateAssembler){   return TemplateAssembler.getTemplateComponent(getMethods,
		"sap.suite.ui.generic.templates.Page.Component", {
			metadata: {
				properties: {
					"templateName": {
						"type": "string",
						"defaultValue": "sap.suite.ui.generic.templates.Page.view.Page"
					}
				},
				"manifest": "json"
			}
		});
	});`;
	const mockPool = {
		async findResource(name) {
			return {
				buffer: () => name.endsWith(".json") ? JSON.stringify(manifest): code
			};
		}
	};

	const moduleInfo = new ModuleInfo();

	const analyzer = new SmartTemplateAnalyzer(mockPool);
	const name = "MyComponent.js";
	await analyzer.analyze({name}, moduleInfo);
	t.deepEqual(moduleInfo.dependencies, ["mycomp/js/Component.js", "myTemplate.view.xml"],
		"Resulting dependencies should come from manifest and code");
});

test("_analyzeTemplateClassDefinition: get template name from metadata", async (t) => {
	const code = `var x = {
			metadata: {
				properties: {
					"templateName": {
						"type": "string",
						"defaultValue": "sap.fe.templates.Page.view.Page"
					}
				},
				"manifest": "json"
			}
		};`;
	const ast = esprima.parse(code);
	const expression = ast.body[0].declarations[0].init;

	const analyzer = new SmartTemplateAnalyzer();

	const result = await analyzer._analyzeTemplateClassDefinition(expression);

	t.deepEqual(result, "sap.fe.templates.Page.view.Page", "defaultValue is retrieved");
});

test("_analyzeTemplateClassDefinition: no string template name from metadata", async (t) => {
	const code = `var x = {
			metadata: {
				properties: {
					"templateName": {
						"type": "string",
						"defaultValue": false
					}
				},
				"manifest": "json"
			}
		};`;
	const ast = esprima.parse(code);
	const expression = ast.body[0].declarations[0].init;

	const analyzer = new SmartTemplateAnalyzer();

	const result = await analyzer._analyzeTemplateClassDefinition(expression);

	t.falsy(result, "defaultValue is not a string");
});

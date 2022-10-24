import test from "ava";
import ModuleInfo from "../../../../lib/lbt/resources/ModuleInfo.js";
import {parseJS} from "../../../../lib/lbt/utils/parseUtils.js";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.sinon = sinonGlobal.createSandbox();
	t.context.SmartTemplateAnalyzer = await esmock("../../../../lib/lbt/analyzer/SmartTemplateAnalyzer.js");
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("analyze: with Component.js", async (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const emptyPool = {};
	const analyzer = new SmartTemplateAnalyzer(emptyPool);
	const name = "sap/ui/core/Component.js";
	const moduleInfo = {};
	const result = await analyzer.analyze({name}, moduleInfo);
	t.deepEqual(result, {}, "moduleInfo was not modified");
});

test("analyze: without manifest", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;
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
	const {SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {};

	const analyzer = new SmartTemplateAnalyzer();

	const result = await analyzer._analyzeManifest({}, moduleInfo);

	t.deepEqual(result, [], "resolves with empty array");
});


test("_analyzeManifest: with manifest with recursive pages (as array)", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const manifest = {
		"sap.ui.generic.app": {
			"pages": [{
				"component": {
					"name": "test.mycomp",
					"settings": {
						"templateName": "myTemplate"
					}
				},
				"pages": [{
					"component": {
						"name": "test.mycomp2",
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
	t.is(stubAnalyzeTemplateComponent.getCall(0).args[0], "test/mycomp/Component.js",
		"_analyzeTemplateComponent should be called with the component");
	t.deepEqual(stubAnalyzeTemplateComponent.getCall(0).args[1], {
		"component": {
			"name": "test.mycomp",
			"settings": {
				"templateName": "myTemplate"
			}
		},
		"pages": [{
			"component": {
				"name": "test.mycomp2",
				"settings": {
					"templateName": "myTemplate"
				}
			},
		}]
	}, "_analyzeTemplateComponent should be called with the page");

	t.is(stubAnalyzeTemplateComponent.getCall(1).args[0], "test/mycomp2/Component.js",
		"_analyzeTemplateComponent should be called with the component");
	t.deepEqual(stubAnalyzeTemplateComponent.getCall(1).args[1], {
		"component": {
			"name": "test.mycomp2",
			"settings": {
				"templateName": "myTemplate"
			}
		}
	}, "_analyzeTemplateComponent should be called with the page");

	t.is(stubAddDependency.callCount, 2, "addDependency was called twice");
	t.is(stubAddDependency.getCall(0).args[0], "test/mycomp/Component.js",
		"addDependency should be called with the dependency name");
});

test("_analyzeManifest: with manifest with recursive pages (as object)", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const manifest = {
		"sap.ui.generic.app": {
			"pages": {
				"MyPage1": {
					"component": {
						"name": "test.mycomp",
						"settings": {
							"templateName": "myTemplate"
						}
					},
					"pages": {
						"MyPage2": {
							"component": {
								"name": "test.mycomp2",
								"settings": {
									"templateName": "myTemplate"
								}
							}
						}
					}
				}
			}
		}
	};

	const analyzer = new SmartTemplateAnalyzer();
	const stubAnalyzeTemplateComponent = sinon.stub(analyzer, "_analyzeTemplateComponent").resolves();

	await analyzer._analyzeManifest(manifest, moduleInfo);

	t.is(stubAnalyzeTemplateComponent.callCount, 2, "_analyzeTemplateComponent was called twice");
	t.is(stubAnalyzeTemplateComponent.getCall(0).args[0], "test/mycomp/Component.js",
		"_analyzeTemplateComponent should be called with the component");
	t.deepEqual(stubAnalyzeTemplateComponent.getCall(0).args[1], {
		"component": {
			"name": "test.mycomp",
			"settings": {
				"templateName": "myTemplate"
			}
		},
		"pages": {
			"MyPage2": {
				"component": {
					"name": "test.mycomp2",
					"settings": {
						"templateName": "myTemplate"
					}
				}
			}
		}
	}, "_analyzeTemplateComponent should be called with the page");

	t.is(stubAnalyzeTemplateComponent.getCall(1).args[0], "test/mycomp2/Component.js",
		"_analyzeTemplateComponent should be called with the component");
	t.deepEqual(stubAnalyzeTemplateComponent.getCall(1).args[1], {
		"component": {
			"name": "test.mycomp2",
			"settings": {
				"templateName": "myTemplate"
			}
		}
	}, "_analyzeTemplateComponent should be called with the page");

	t.is(stubAddDependency.callCount, 2, "addDependency was called twice");
	t.is(stubAddDependency.getCall(0).args[0], "test/mycomp/Component.js",
		"addDependency should be called with the dependency name");
});

test.serial("_analyzeTemplateComponent: Manifest with TemplateAssembler code", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			return {
				buffer: async () => ""
			};
		},
		getIgnoreMissingModules() {
			return false;
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("mytpl");

	await analyzer._analyzeTemplateComponent("pony",
		{}, moduleInfo);

	t.true(stubAnalyzeAST.calledOnce, "_analyzeManifest was called once");
	t.is(stubAnalyzeAST.getCall(0).args[0], "pony",
		"_analyzeManifest should be called with the module name");


	t.true(stubAddDependency.calledOnce, "addDependency was called once");
	t.is(stubAddDependency.getCall(0).args[0], "mytpl.view.xml",
		"addDependency should be called with the dependency name");
});

test.serial("_analyzeTemplateComponent: no default template name", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			return {
				buffer: async () => ""
			};
		},
		getIgnoreMissingModules() {
			return false;
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("");

	await analyzer._analyzeTemplateComponent("pony",
		{}, moduleInfo);

	t.true(stubAnalyzeAST.calledOnce, "_analyzeManifest was called once");

	t.true(stubAddDependency.notCalled, "addDependency was not called");
});

test.serial("_analyzeTemplateComponent: with template name from pageConfig", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			return {
				buffer: async () => ""
			};
		},
		getIgnoreMissingModules() {
			return false;
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("");

	await analyzer._analyzeTemplateComponent("pony", {
		component: {
			settings: {
				templateName: "donkey"
			}
		}
	}, moduleInfo);

	t.true(stubAnalyzeAST.calledOnce, "_analyzeManifest was called once");

	t.true(stubAddDependency.calledOnce, "addDependency was called once");
	t.is(stubAddDependency.getCall(0).args[0], "donkey.view.xml",
		"addDependency should be called with the dependency name");
});

test.serial("_analyzeTemplateComponent: dependency not found", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			throw new Error(`resource not found in pool: 'pony'`);
		},
		getIgnoreMissingModules() {
			return false;
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("");

	const error = await t.throwsAsync(analyzer._analyzeTemplateComponent("pony", {
		component: {
			settings: {
				templateName: "donkey"
			}
		}
	}, moduleInfo));

	t.is(error.message, `resource not found in pool: 'pony'`);

	t.is(stubAnalyzeAST.callCount, 0, "_analyzeManifest was not called");

	t.is(stubAddDependency.callCount, 0, "addDependency was not called");
});

test.serial("_analyzeTemplateComponent: dependency not found is ignored", async (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const moduleInfo = {
		addDependency: function() {}
	};
	const stubAddDependency = sinon.spy(moduleInfo, "addDependency");

	const mockPool = {
		async findResource() {
			throw new Error(`resource not found in pool: 'pony'`);
		},
		getIgnoreMissingModules() {
			return true; // Missing dependency error can be ignored
		}
	};

	const analyzer = new SmartTemplateAnalyzer(mockPool);

	const stubAnalyzeAST = sinon.stub(analyzer, "_analyzeAST").returns("");

	await analyzer._analyzeTemplateComponent("pony", {
		component: {
			settings: {
				templateName: "donkey"
			}
		}
	}, moduleInfo);

	t.is(stubAnalyzeAST.callCount, 0, "_analyzeManifest was not called");

	t.is(stubAddDependency.callCount, 0, "addDependency was not called");
});

test("_analyzeAST: get template name from ast", (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

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
	const ast = parseJS(code);

	const analyzer = new SmartTemplateAnalyzer();

	const stubAnalyzeTemplateClassDefinition = sinon.stub(analyzer,
		"_analyzeTemplateClassDefinition").returns("donkey");

	const result = analyzer._analyzeAST("pony", ast);


	t.true(stubAnalyzeTemplateClassDefinition.calledOnce, "_analyzeTemplateClassDefinition was called once");

	stubAnalyzeTemplateClassDefinition.restore();
	t.is(result, "donkey");
});

test("_analyzeAST: get template name from ast (AMD define)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;

	const code = `define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"], function(a, TemplateAssembler) {
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
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "sap.fe.templates.Page.view.Page");
});

test("_analyzeAST: unable to get template name from ast (no TemplateAssembler import)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;

	const code = `define(["a"], function(a, TemplateAssembler) { // import missing
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
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "");
});

test("_analyzeAST: unable to get template name from ast (no module definition)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;

	const code = `myDefine(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	function(a, TemplateAssembler) { // unsupported module definition
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
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "");
});

test("_analyzeAST: get template name from ast (ArrowFunction)", (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;

	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	(a, TemplateAssembler) => {
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
	const ast = parseJS(code);

	const analyzer = new SmartTemplateAnalyzer();

	const stubAnalyzeTemplateClassDefinition = sinon.stub(analyzer,
		"_analyzeTemplateClassDefinition").returns("donkey");

	const result = analyzer._analyzeAST("pony", ast);


	t.true(stubAnalyzeTemplateClassDefinition.calledOnce, "_analyzeTemplateClassDefinition was called once");

	stubAnalyzeTemplateClassDefinition.restore();
	t.is(result, "donkey");
});

test("_analyzeAST: get template name from ast (ArrowFunction with implicit return)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;

	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	(a, TemplateAssembler) => TemplateAssembler.getTemplateComponent(getMethods,
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
		}));`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "sap.fe.templates.Page.view.Page");
});

test.serial("_analyzeAST: get template name from ast (async factory function)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	async function (a, TemplateAssembler) {
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
			}
	);});`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "sap.fe.templates.Page.view.Page");
});

test("_analyzeAST: unable to get template name from ast (ArrowFunction with implicit return #1)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	(a, TemplateAssembler) => TemplateAssembler.getTemplateComponent(getMethods,
		"sap.fe.templates.Page.Component", {
			metadata: {
				// No templateName provided
				"manifest": "json"
			}
		}));`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "");
});

test("_analyzeAST: unable to get template name from ast (ArrowFunction with implicit return #2)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	(a, TemplateAssembler) => TemplateAssembler.extend(getMethods, // wrong call. should be 'getTemplateComponent'
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
		}));`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "");
});

test.serial("_analyzeAST: get template name from ast (async arrow factory function)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	async (a, TemplateAssembler) => {
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
			}
	);});`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "sap.fe.templates.Page.view.Page");
});

test.serial("_analyzeAST: get template name from ast (async arrow factory function implicit return)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	async (a, TemplateAssembler) => TemplateAssembler.getTemplateComponent(getMethods,
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
			}
	));`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "sap.fe.templates.Page.view.Page");
});

test("_analyzeAST: get template name from ast (with SpreadElement)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	(a, TemplateAssembler) => {
		const myTemplate = {
			templateName: {
				type: "string",
				defaultValue: "sap.fe.templates.Page.view.Page"
			}
		};
		return TemplateAssembler.getTemplateComponent(getMethods,
		"sap.fe.templates.Page.Component", {
			metadata: {
				properties: {
					...myTemplate
				},
				"manifest": "json"
			}
		});});`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);

	t.is(templateName, "", "The TemplateName is correctly empty as SpreadElements are not supported");
});


test("_analyzeAST: no template name from ast", (t) => {
	const {sinon, SmartTemplateAnalyzer} = t.context;
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
	const ast = parseJS(code);

	const analyzer = new SmartTemplateAnalyzer();

	const stubAnalyzeTemplateClassDefinition = sinon.stub(analyzer,
		"_analyzeTemplateClassDefinition").returns(false);

	const result = analyzer._analyzeAST("pony", ast);


	t.true(stubAnalyzeTemplateClassDefinition.calledOnce, "_analyzeTemplateClassDefinition was called once");

	stubAnalyzeTemplateClassDefinition.restore();
	t.is(result, "");
});

test("_analyzeAST: get template name (template literal)", (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const code = `sap.ui.define(["a", "sap/suite/ui/generic/template/lib/TemplateAssembler"],
	(a, TemplateAssembler) => TemplateAssembler.getTemplateComponent(getMethods,
		"sap.fe.templates.Page.Component", {
			metadata: {
				properties: {
					"templateName": {
						"type": "string",
						"defaultValue": \`sap.fe.templates.Page.view.Page\`
					}
				},
				"manifest": "json"
			}
		}));`;
	const ast = parseJS(code);
	const analyzer = new SmartTemplateAnalyzer();
	const templateName = analyzer._analyzeAST("sap.fe.templates.Page.Component", ast);
	t.is(templateName, "sap.fe.templates.Page.view.Page", "The TemplateName is correct");
});

test("Analysis of Manifest and TemplateAssembler code", async (t) => {
	const {SmartTemplateAnalyzer} = t.context;
	const manifest = {
		"sap.ui.generic.app": {
			"pages": [{
				"component": {
					"name": "test.mycomp",
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
	t.deepEqual(moduleInfo.dependencies, ["test/mycomp/Component.js", "myTemplate.view.xml"],
		"Resulting dependencies should come from manifest and code");
});

test("_analyzeTemplateClassDefinition: get template name from metadata", async (t) => {
	const {SmartTemplateAnalyzer} = t.context;
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
	const ast = parseJS(code);
	const expression = ast.body[0].declarations[0].init;

	const analyzer = new SmartTemplateAnalyzer();

	const result = await analyzer._analyzeTemplateClassDefinition(expression);

	t.is(result, "sap.fe.templates.Page.view.Page", "defaultValue is retrieved");
});

test("_analyzeTemplateClassDefinition: no string template name from metadata", async (t) => {
	const {SmartTemplateAnalyzer} = t.context;
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
	const ast = parseJS(code);
	const expression = ast.body[0].declarations[0].init;

	const analyzer = new SmartTemplateAnalyzer();

	const result = await analyzer._analyzeTemplateClassDefinition(expression);

	t.falsy(result, "defaultValue is not a string");
});

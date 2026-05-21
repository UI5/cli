import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import MiddlewareManager from "../../../../lib/middleware/MiddlewareManager.js";
import middlewareRepository from "../../../../lib/middleware/middlewareRepository.js";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.logger = {
		getLogger: sinon.stub().returns("group logger")
	};

	t.context.MiddlewareManager = await esmock("../../../../lib/middleware/MiddlewareManager.js", {
		"@ui5/logger": t.context.logger
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Missing parameters", (t) => {
	const err = t.throws(() => {
		new MiddlewareManager({
			graph: {},
			rootProject: "root project",
			resources: {}
		});
	});
	t.is(err.message, "[MiddlewareManager]: One or more mandatory parameters not provided",
		"Threw error with correct message");
});

test("Correct parameters", (t) => {
	t.notThrows(() => {
		new MiddlewareManager({
			graph: {},
			rootProject: "root project",
			resources: {
				all: "I",
				rootProject: "like",
				dependencies: "ponies"
			}
		});
	}, "No error thrown");
});

test("applyMiddleware", async (t) => {
	const {sinon} = t.context;
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "love",
			dependencies: "ponies"
		}
	});

	const addStandardMiddlewareStub = sinon.stub(middlewareManager, "addStandardMiddleware").resolves();
	const addCustomMiddlewareStub = sinon.stub(middlewareManager, "addCustomMiddleware").resolves();
	middlewareManager.middlewareExecutionOrder.push(["ponyware"]);
	middlewareManager.middleware["ponyware"] = {
		mountPath: "/myMountPath",
		middleware: "myMiddleware"
	};

	const appUseStub = sinon.stub();
	const app = {
		use: appUseStub
	};

	await middlewareManager.applyMiddleware(app);
	t.is(addStandardMiddlewareStub.callCount, 1, "addStandardMiddleware got called once");
	t.is(addCustomMiddlewareStub.callCount, 1, "addCustomMiddleware got called once");
	t.is(appUseStub.callCount, 1, "app.use got called once");
	t.is(appUseStub.getCall(0).args[0], "/myMountPath", "app.use got called with correct mount path parameter");
	t.is(appUseStub.getCall(0).args[1], "myMiddleware", "app.use got called with correct middleware parameter");
});

test("addMiddleware: Adding already added middleware", async (t) => {
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});

	await middlewareManager.addMiddleware("serveIndex", {
		mountPath: "/pony"
	});
	await t.throwsAsync(middlewareManager.addMiddleware("serveIndex", {
		mountPath: "/seagull"
	}), {
		message: "A middleware with the name serveIndex has already been added"
	});
});

test("addMiddleware: Adding middleware already added to middlewareExecutionOrder", async (t) => {
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});

	middlewareManager.middlewareExecutionOrder.push("serveIndex");

	const err = await t.throwsAsync(() => {
		return middlewareManager.addMiddleware("serveIndex");
	});
	t.is(err.message,
		"Middleware serveIndex already added to execution order. This should not happen.",
		"Rejected with correct error message");
});

test("addMiddleware: Add middleware", async (t) => {
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});

	await middlewareManager.addMiddleware("compression"); // Add some middleware

	await middlewareManager.addMiddleware("serveIndex"); // Add middleware to test for
	t.truthy(middlewareManager.middleware["serveIndex"], "Middleware got added to internal map");
	t.truthy(middlewareManager.middleware["serveIndex"].middleware, "Middleware module is given");
	t.is(middlewareManager.middleware["serveIndex"].mountPath, "/", "Correct default mount path set");

	t.is(middlewareManager.middlewareExecutionOrder.length, 2,
		"Two middleware got added to middleware execution order");
	t.is(middlewareManager.middlewareExecutionOrder[1], "serveIndex",
		"Last added middleware was added to the end of middleware execution order array");
});

test("addMiddleware: Add middleware with beforeMiddleware and mountPath parameter", async (t) => {
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});

	await middlewareManager.addMiddleware("compression"); // Add some middleware

	await middlewareManager.addMiddleware("serveIndex", { // Add middleware to test for
		beforeMiddleware: "compression",
		mountPath: "/pony"
	});
	t.truthy(middlewareManager.middleware["serveIndex"], "Middleware got added to internal map");
	t.truthy(middlewareManager.middleware["serveIndex"].middleware, "Middleware module is given");
	t.is(middlewareManager.middleware["serveIndex"].mountPath, "/pony", "Correct mount path set");

	t.is(middlewareManager.middlewareExecutionOrder.length, 2,
		"Two middleware got added to middleware execution order");
	t.is(middlewareManager.middlewareExecutionOrder[0], "serveIndex",
		"Middleware was inserted at correct position of middleware execution order array");
});

test("addMiddleware: Add middleware with beforeMiddleware=connectUi5Proxy", async (t) => {
	const {sinon} = t.context;
	const warnSpy = sinon.spy();
	const StubbedMiddlewareManager = await esmock("../../../../lib/middleware/MiddlewareManager.js", {
		"@ui5/logger": {getLogger: sinon.stub().returns({warn: warnSpy})}
	});
	const middlewareManager = new StubbedMiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});

	await middlewareManager.addStandardMiddleware(); // Add standard middleware

	const err = await t.throwsAsync(() => {
		return middlewareManager.addMiddleware("customMiddleware", { // Add middleware to test for
			customMiddleware: () => {},
			afterMiddleware: "connectUi5Proxy",
			mountPath: "/pony"
		});
	});

	t.is(err.message,
		"Standard middleware \"connectUi5Proxy\", referenced by middleware \"customMiddleware\" in project root project, has been removed in this version of UI5 CLI and can't be referenced anymore. Please see the migration guide at https://ui5.github.io/cli/updates/migrate-v3/",
		"Trying to bind to a non-existing standard middleware");
});

test("addMiddleware: Add middleware with afterMiddleware parameter", async (t) => {
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});

	await middlewareManager.addMiddleware("compression"); // Add some middleware
	await middlewareManager.addMiddleware("cors"); // Add some middleware

	await middlewareManager.addMiddleware("serveIndex", { // Add middleware to test for
		afterMiddleware: "compression"
	});
	t.truthy(middlewareManager.middleware["serveIndex"], "Middleware got added to internal map");
	t.truthy(middlewareManager.middleware["serveIndex"].middleware, "Middleware module is given");
	t.is(middlewareManager.middleware["serveIndex"].mountPath, "/", "Correct default mount path set");

	t.is(middlewareManager.middlewareExecutionOrder.length, 3,
		"Three middleware got added to middleware execution order");
	t.is(middlewareManager.middlewareExecutionOrder[1], "serveIndex",
		"Middleware was inserted at correct position of middleware execution order array");
});

test("addMiddleware: Add middleware with invalid afterMiddleware parameter", async (t) => {
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});

	await middlewareManager.addMiddleware("compression"); // Add some middleware

	const err = await t.throwsAsync(() => {
		return middlewareManager.addMiddleware("serveIndex", { // Add middleware to test for
			afterMiddleware: "🦆"
		});
	});
	t.is(err.message, "Could not find middleware 🦆, referenced by custom middleware serveIndex");

	t.falsy(middlewareManager.middleware["serveIndex"], "Middleware did not get added to internal map");
	t.is(middlewareManager.middlewareExecutionOrder.length, 1,
		"No new middleware got added to middleware execution order array");
});

test("addMiddleware: Add middleware with wrapperCallback parameter", async (t) => {
	const {sinon} = t.context;
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const serveIndexMiddlewareInfo = await middlewareRepository.getMiddleware("serveIndex");

	const moduleStub = sinon.stub().returns("🍅");
	const wrapperCallbackStub = sinon.stub().returns(moduleStub);
	await middlewareManager.addMiddleware("serveIndex", { // Add middleware to test for
		wrapperCallback: wrapperCallbackStub
	});
	t.is(wrapperCallbackStub.callCount, 1, "Wrapper callback got called once");
	t.deepEqual(wrapperCallbackStub.getCall(0).args[0], serveIndexMiddlewareInfo,
		"Wrapper callback got called with correct module");
	t.is(moduleStub.callCount, 1, "Wrapper callback got called once");
	t.deepEqual(moduleStub.getCall(0).args[0].resources, {
		all: "I",
		rootProject: "like",
		dependencies: "ponies"
	}, "Wrapper callback got called with correct arguments");

	t.truthy(middlewareManager.middleware["serveIndex"], "Middleware got added to internal map");
	t.is(middlewareManager.middleware["serveIndex"].middleware, "🍅",
		"Middleware module is given");
	t.is(middlewareManager.middleware["serveIndex"].mountPath, "/", "Correct default mount path set");

	t.is(middlewareManager.middlewareExecutionOrder.length, 1,
		"One middleware got added to middleware execution order");
	t.is(middlewareManager.middlewareExecutionOrder[0], "serveIndex",
		"Middleware was inserted at correct position of middleware execution order array");
});

test("addMiddleware: Add middleware with async wrapperCallback", async (t) => {
	const {sinon} = t.context;
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const moduleStub = sinon.stub().resolves("🍅");
	const wrapperCallbackStub = sinon.stub().returns(moduleStub);
	await middlewareManager.addMiddleware("serveIndex", { // Add middleware to test for
		wrapperCallback: wrapperCallbackStub
	});

	t.truthy(middlewareManager.middleware["serveIndex"], "Middleware got added to internal map");
	t.is(middlewareManager.middleware["serveIndex"].middleware, "🍅",
		"Middleware module is given");
});

test("addStandardMiddleware: Adds standard middleware in correct order", async (t) => {
	const {sinon} = t.context;
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addStandardMiddleware();

	t.is(addMiddlewareStub.callCount, 10, "Expected count of middleware got added");
	const addedMiddlewareNames = [];
	for (let i = 0; i < addMiddlewareStub.callCount; i++) {
		addedMiddlewareNames.push(addMiddlewareStub.getCall(i).args[0]);
	}
	t.deepEqual(addedMiddlewareNames, [
		"csp",
		"compression",
		"cors",
		"discovery",
		"serveResources",
		"testRunner",
		"serveThemes",
		"versionInfo",
		"nonReadRequests",
		"serveIndex"
	], "Correct order of standard middlewares");
});

test("addCustomMiddleware: No custom middleware defined", async (t) => {
	const {sinon} = t.context;
	const graph = {
		getRoot: () => {
			return {
				getName: () => "my project",
				getCustomMiddleware: () => []
			};
		},
		getExtension: sinon.stub(),
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addCustomMiddleware();

	t.is(addMiddlewareStub.callCount, 0, "addMiddleware was not called");
	t.is(graph.getExtension.callCount, 0, "graph#getExtension was not called");
});

test("addCustomMiddleware: Unknown custom middleware", async (t) => {
	const {sinon} = t.context;
	const graph = {
		getRoot: () => {
			return {
				getName: () => "my project",
				getCustomMiddleware: () => [{
					name: "my custom middleware A",
					afterMiddleware: "serveIndex"
				}]
			};
		},
		getExtension: sinon.stub().returns(undefined),
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await t.throwsAsync(middlewareManager.addCustomMiddleware(), {
		message: "Could not find custom middleware my custom middleware A, referenced by project my project"
	}, "Threw with expected error message");

	t.is(addMiddlewareStub.callCount, 0, "addMiddleware was not called");
	t.is(graph.getExtension.callCount, 1, "graph#getExtension was called once");
	t.is(graph.getExtension.firstCall.firstArg, "my custom middleware A",
		"graph#getExtension was with expected argument");
});

test("addCustomMiddleware: Custom middleware got added", async (t) => {
	const {sinon} = t.context;
	const graph = {
		getRoot: () => {
			return {
				getName: () => "my project",
				getCustomMiddleware: () => [{
					name: "my custom middleware A",
					beforeMiddleware: "cors",
					mountPath: "/pony"
				}, {
					name: "my custom middleware B",
					afterMiddleware: "my custom middleware A"
				}]
			};
		},
		getExtension: sinon.stub().returns("extension"),
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addCustomMiddleware();

	t.is(addMiddlewareStub.callCount, 2, "addMiddleware was called twice");
	t.is(addMiddlewareStub.getCall(0).args[0], "my custom middleware A",
		"addMiddleware was called with correct middleware name");
	const middlewareOptionsA = addMiddlewareStub.getCall(0).args[1];
	t.is(middlewareOptionsA.mountPath, "/pony",
		"addMiddleware was called with correct mountPath option");
	t.is(middlewareOptionsA.beforeMiddleware, "cors",
		"addMiddleware was called with correct beforeMiddleware option");
	t.is(middlewareOptionsA.afterMiddleware, undefined,
		"addMiddleware was called with correct afterMiddleware option");

	t.is(addMiddlewareStub.getCall(1).args[0], "my custom middleware B",
		"addMiddleware was called with correct middleware name");
	const middlewareOptionsB = addMiddlewareStub.getCall(1).args[1];
	t.is(middlewareOptionsB.mountPath, undefined,
		"addMiddleware was called with correct mountPath option");
	t.is(middlewareOptionsB.beforeMiddleware, undefined,
		"addMiddleware was called with correct beforeMiddleware option");
	t.is(middlewareOptionsB.afterMiddleware, "my custom middleware A",
		"addMiddleware was called with correct afterMiddleware option");

	t.is(graph.getExtension.callCount, 2, "graph#getExtension was called twice");
	t.is(graph.getExtension.firstCall.firstArg, "my custom middleware A",
		"graph#getExtension was with expected argument on first call");
	t.is(graph.getExtension.secondCall.firstArg, "my custom middleware B",
		"graph#getExtension was with expected argument on second call");
});

test("addCustomMiddleware: Custom middleware with duplicate name", async (t) => {
	const {sinon} = t.context;
	const graph = {
		getRoot: () => {
			return {
				getName: () => "my project",
				getCustomMiddleware: () => [{
					name: "my custom middleware A",
					afterMiddleware: "serveIndex"
				}]
			};
		},
		getExtension: sinon.stub().returns("extension"),
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	middlewareManager.middleware["my custom middleware A"] = true;
	middlewareManager.middleware["my custom middleware A--1"] = true;
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addCustomMiddleware();

	t.is(addMiddlewareStub.callCount, 1, "addMiddleware was called once");
	t.is(addMiddlewareStub.getCall(0).args[0], "my custom middleware A--2",
		"addMiddleware was called with correct middleware name");

	t.is(graph.getExtension.callCount, 1, "graph#getExtension was called once");
	t.is(graph.getExtension.firstCall.firstArg, "my custom middleware A",
		"graph#getExtension was with expected argument");
});

test("addCustomMiddleware: Missing name configuration", async (t) => {
	const {sinon} = t.context;
	const graph = {
		getRoot: () => {
			return {
				getName: () => "my project",
				getCustomMiddleware: () => [{
					afterMiddleware: "my custom middleware A"
				}]
			};
		},
		getExtension: sinon.stub().returns("extension"),
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const err = await t.throwsAsync(() => {
		return middlewareManager.addCustomMiddleware();
	});

	t.is(err.message, "Missing name for custom middleware definition of project my project at index 0",
		"Rejected with correct error message");
});

test("addCustomMiddleware: Both before- and afterMiddleware configuration", async (t) => {
	const {sinon} = t.context;
	const graph = {
		getRoot: () => {
			return {
				getName: () => "🐧",
				getCustomMiddleware: () => [{
					name: "🦆",
					beforeMiddleware: "🐝",
					afterMiddleware: "🐒"
				}]
			};
		},
		getExtension: sinon.stub().returns("extension"),
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const err = await t.throwsAsync(() => {
		return middlewareManager.addCustomMiddleware();
	});

	t.deepEqual(err.message, `Custom middleware definition 🦆 of project 🐧 ` +
		`defines both "beforeMiddleware" and "afterMiddleware" parameters. Only one must be defined.`,
	"Rejected with correct error message");
});

test("addCustomMiddleware: Missing before- or afterMiddleware configuration", async (t) => {
	const {sinon} = t.context;
	const graph = {
		getRoot: () => {
			return {
				getName: () => "🐧",
				getCustomMiddleware: () => [{
					name: "🦆"
				}]
			};
		},
		getExtension: sinon.stub().returns("extension"),
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const err = await t.throwsAsync(() => {
		return middlewareManager.addCustomMiddleware();
	});

	t.deepEqual(err.message, `Custom middleware definition 🦆 of project 🐧 ` +
		`defines neither a "beforeMiddleware" nor an "afterMiddleware" parameter. One must be defined.`,
	"Rejected with correct error message");
});

test("addCustomMiddleware", async (t) => {
	const {sinon} = t.context;
	const middlewareModuleStub = sinon.stub().returns("ok");
	const specVersionGteStub = sinon.stub().returns(false);
	const mockSpecificationVersion = {
		toString: () => "2.6",
		gte: specVersionGteStub
	};
	const getExtensionStub = sinon.stub().returns({
		getSpecVersion: () => mockSpecificationVersion,
		getMiddleware: () => middlewareModuleStub
	});
	const graph = {
		getRoot: () => {
			return {
				getName: () => "my project",
				getCustomMiddleware: () => [{
					name: "my custom middleware A",
					beforeMiddleware: "cors",
					configuration: {
						"🦊": "🐰"
					}
				}]
			};
		},
		getExtension: getExtensionStub
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addCustomMiddleware();

	t.is(addMiddlewareStub.callCount, 1, "addMiddleware was called once");

	const customMiddleware = addMiddlewareStub.getCall(0).args[1].customMiddleware;
	const middlewareUtil = {
		getInterface: sinon.stub().returns("interfacedMiddlewareUtil")
	};
	const res = await customMiddleware({
		resources: "resources",
		middlewareUtil
	});

	t.is(res, "ok", "Wrapper callback returned expected value");
	t.is(specVersionGteStub.callCount, 1, "SpecificationVersion#gte got called once");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments");
	t.is(middlewareUtil.getInterface.callCount, 1, "middlewareUtil.getInterface got called once");
	t.is(middlewareUtil.getInterface.getCall(0).args[0], mockSpecificationVersion,
		"middlewareUtil.getInterface got called with correct arguments");
	t.is(middlewareModuleStub.callCount, 1, "Middleware module got called once");
	t.deepEqual(middlewareModuleStub.getCall(0).args[0], {
		resources: "resources",
		options: {
			configuration: {
				"🦊": "🐰"
			}
		},
		middlewareUtil: "interfacedMiddlewareUtil"
	}, "Middleware module got called with correct arguments");
});

test("addCustomMiddleware with specVersion 3.0", async (t) => {
	const {sinon, MiddlewareManager} = t.context;
	const middlewareModuleStub = sinon.stub().returns("ok");
	const specVersionGteStub = sinon.stub().returns(true);
	const mockSpecificationVersion = {
		toString: () => "3.0",
		gte: specVersionGteStub
	};
	const getExtensionStub = sinon.stub().returns({
		getSpecVersion: () => mockSpecificationVersion,
		getMiddleware: () => middlewareModuleStub
	});
	const graph = {
		getRoot: () => {
			return {
				getName: () => "my project",
				getCustomMiddleware: () => [{
					name: "my custom middleware",
					beforeMiddleware: "cors",
					configuration: {
						"🦊": "🐰"
					}
				}]
			};
		},
		getExtension: getExtensionStub
	};
	const middlewareManager = new MiddlewareManager({
		graph,
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	// Simulate that a custom middleware with the same name has already been added (twice)
	middlewareManager.middleware["my custom middleware"] = true;
	middlewareManager.middleware["my custom middleware--1"] = true;
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addCustomMiddleware();

	t.is(addMiddlewareStub.callCount, 1, "addMiddleware was called once");

	const customMiddleware = addMiddlewareStub.getCall(0).args[1].customMiddleware;
	const middlewareUtil = {
		getInterface: sinon.stub().returns("interfacedMiddlewareUtil")
	};
	const res = await customMiddleware({
		resources: "resources",
		middlewareUtil
	});

	t.is(res, "ok", "Wrapper callback returned expected value");
	t.is(specVersionGteStub.callCount, 1, "SpecificationVersion#gte got called once");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments");
	t.is(middlewareUtil.getInterface.callCount, 1, "middlewareUtil.getInterface got called once");
	t.is(middlewareUtil.getInterface.getCall(0).args[0], mockSpecificationVersion,
		"middlewareUtil.getInterface got called with correct arguments");
	t.is(middlewareModuleStub.callCount, 1, "Middleware module got called once");
	t.deepEqual(middlewareModuleStub.getCall(0).args[0], {
		resources: "resources",
		options: {
			configuration: {
				"🦊": "🐰"
			},
			middlewareName: "my custom middleware--2"
		},
		middlewareUtil: "interfacedMiddlewareUtil",
		log: "group logger"
	}, "Middleware module got called with correct arguments");
});

test("addStandardMiddleware: CSP middleware configured correctly (default)", async (t) => {
	const {sinon} = t.context;
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addStandardMiddleware();

	const cspCall = addMiddlewareStub.getCalls().find((call) => {
		if (call.args[0] === "csp") {
			return true;
		}
	});
	t.truthy(cspCall, "CSP middleware added");
	const wrapperCallback = cspCall.args[1].wrapperCallback;

	const middlewareModuleStub = sinon.stub().returns("ok");
	const middlewareModuleInfo = {
		middleware: middlewareModuleStub
	};
	const middlewareWrapper = wrapperCallback(middlewareModuleInfo);
	const res = middlewareWrapper();
	t.is(res, "ok", "Wrapper callback returned expected value");
	t.is(middlewareModuleStub.callCount, 1, "Middleware module got called once");
	t.is(middlewareModuleStub.getCall(0).args[0], "sap-ui-xx-csp-policy",
		"CSP middleware module got called with correct first argument");
	t.deepEqual(middlewareModuleStub.getCall(0).args[1], {
		allowDynamicPolicyDefinition: true,
		allowDynamicPolicySelection: true,
		definedPolicies: {
			/* eslint-disable max-len */
			"sap-target-level-1":
				`default-src 'self'; script-src  'self' 'unsafe-eval'; style-src   'self' 'unsafe-inline'; font-src    'self' data:; img-src     'self' https: http: data: blob:; media-src   'self' https: http: data: blob:; object-src  blob:; frame-src   'self' https: gap: data: blob: mailto: tel:; worker-src  'self' blob:; child-src   'self' blob:; connect-src 'self' https: wss:; base-uri    'self';`,
			"sap-target-level-2":
				`default-src 'self'; script-src  'self'; style-src   'self' 'unsafe-inline'; font-src    'self' data:; img-src     'self' https: http: data: blob:; media-src   'self' https: http: data: blob:; object-src  blob:; frame-src   'self' https: gap: data: blob: mailto: tel:; worker-src  'self' blob:; child-src   'self' blob:; connect-src 'self' https: wss:; base-uri    'self';`,
			"sap-target-level-3":
				`default-src 'self'; script-src  'self'; style-src   'self'; font-src    'self'; img-src     'self' https:; media-src   'self' https:; object-src  'self'; frame-src   'self' https: gap: mailto: tel:; worker-src  'self'; child-src   'self'; connect-src 'self' https: wss:; base-uri    'self';`,
			/* eslint-enable max-len */
		}
	}, "CSP middleware module got called with correct second argument");
});

test("addStandardMiddleware: CSP middleware configured correctly (enabled)", async (t) => {
	const {sinon} = t.context;
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		},
		options: {
			sendSAPTargetCSP: true,
			serveCSPReports: true
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addStandardMiddleware();

	const cspCall = addMiddlewareStub.getCalls().find((call) => {
		if (call.args[0] === "csp") {
			return true;
		}
	});
	t.truthy(cspCall, "CSP middleware added");
	const wrapperCallback = cspCall.args[1].wrapperCallback;

	const middlewareModuleStub = sinon.stub().returns("ok");
	const middlewareModuleInfo = {
		middleware: middlewareModuleStub
	};
	const middlewareWrapper = wrapperCallback(middlewareModuleInfo);
	const res = middlewareWrapper();
	t.is(res, "ok", "Wrapper callback returned expected value");
	t.is(middlewareModuleStub.callCount, 1, "Middleware module got called once");
	t.is(middlewareModuleStub.getCall(0).args[0], "sap-ui-xx-csp-policy",
		"CSP middleware module got called with correct first argument");
	t.deepEqual(middlewareModuleStub.getCall(0).args[1], {
		allowDynamicPolicyDefinition: true,
		allowDynamicPolicySelection: true,
		definedPolicies: {
			/* eslint-disable max-len */
			"sap-target-level-1":
				`default-src 'self'; script-src  'self' 'unsafe-eval'; style-src   'self' 'unsafe-inline'; font-src    'self' data:; img-src     'self' https: http: data: blob:; media-src   'self' https: http: data: blob:; object-src  blob:; frame-src   'self' https: gap: data: blob: mailto: tel:; worker-src  'self' blob:; child-src   'self' blob:; connect-src 'self' https: wss:; base-uri    'self';`,
			"sap-target-level-2":
				`default-src 'self'; script-src  'self'; style-src   'self' 'unsafe-inline'; font-src    'self' data:; img-src     'self' https: http: data: blob:; media-src   'self' https: http: data: blob:; object-src  blob:; frame-src   'self' https: gap: data: blob: mailto: tel:; worker-src  'self' blob:; child-src   'self' blob:; connect-src 'self' https: wss:; base-uri    'self';`,
			"sap-target-level-3":
				`default-src 'self'; script-src  'self'; style-src   'self'; font-src    'self'; img-src     'self' https:; media-src   'self' https:; object-src  'self'; frame-src   'self' https: gap: mailto: tel:; worker-src  'self'; child-src   'self'; connect-src 'self' https: wss:; base-uri    'self';`,
			/* eslint-enable max-len */
		},
		defaultPolicy: "sap-target-level-1",
		defaultPolicyIsReportOnly: true,
		defaultPolicy2: "sap-target-level-3",
		defaultPolicy2IsReportOnly: true,
		ignorePaths: [
			"test-resources/sap/ui/qunit/testrunner.html",
		],
		serveCSPReports: true
	}, "CSP middleware module got called with correct second argument");
});

test("addStandardMiddleware: CSP middleware configured correctly (custom)", async (t) => {
	const {sinon} = t.context;
	const middlewareManager = new MiddlewareManager({
		graph: {},
		rootProject: "root project",
		resources: {
			all: "I",
			rootProject: "like",
			dependencies: "ponies"
		},
		options: {
			sendSAPTargetCSP: {
				defaultPolicy: "sap-target-level-1",
				defaultPolicyIsReportOnly: false,
				defaultPolicy2: "sap-target-level-2",
				defaultPolicy2IsReportOnly: true,
				ignorePaths: ["lord/tirek.html"]
			},
			serveCSPReports: false
		}
	});
	const addMiddlewareStub = sinon.stub(middlewareManager, "addMiddleware").resolves();
	await middlewareManager.addStandardMiddleware();

	const cspCall = addMiddlewareStub.getCalls().find((call) => {
		if (call.args[0] === "csp") {
			return true;
		}
	});
	t.truthy(cspCall, "CSP middleware added");
	const wrapperCallback = cspCall.args[1].wrapperCallback;

	const middlewareModuleStub = sinon.stub().returns("ok");
	const middlewareModuleInfo = {
		middleware: middlewareModuleStub
	};
	const middlewareWrapper = wrapperCallback(middlewareModuleInfo);
	const res = middlewareWrapper();
	t.is(res, "ok", "Wrapper callback returned expected value");
	t.is(middlewareModuleStub.callCount, 1, "Middleware module got called once");
	t.is(middlewareModuleStub.getCall(0).args[0], "sap-ui-xx-csp-policy",
		"CSP middleware module got called with correct first argument");
	t.deepEqual(middlewareModuleStub.getCall(0).args[1], {
		allowDynamicPolicyDefinition: true,
		allowDynamicPolicySelection: true,
		definedPolicies: {
			/* eslint-disable max-len */
			"sap-target-level-1":
				`default-src 'self'; script-src  'self' 'unsafe-eval'; style-src   'self' 'unsafe-inline'; font-src    'self' data:; img-src     'self' https: http: data: blob:; media-src   'self' https: http: data: blob:; object-src  blob:; frame-src   'self' https: gap: data: blob: mailto: tel:; worker-src  'self' blob:; child-src   'self' blob:; connect-src 'self' https: wss:; base-uri    'self';`,
			"sap-target-level-2":
				`default-src 'self'; script-src  'self'; style-src   'self' 'unsafe-inline'; font-src    'self' data:; img-src     'self' https: http: data: blob:; media-src   'self' https: http: data: blob:; object-src  blob:; frame-src   'self' https: gap: data: blob: mailto: tel:; worker-src  'self' blob:; child-src   'self' blob:; connect-src 'self' https: wss:; base-uri    'self';`,
			"sap-target-level-3":
				`default-src 'self'; script-src  'self'; style-src   'self'; font-src    'self'; img-src     'self' https:; media-src   'self' https:; object-src  'self'; frame-src   'self' https: gap: mailto: tel:; worker-src  'self'; child-src   'self'; connect-src 'self' https: wss:; base-uri    'self';`,
			/* eslint-enable max-len */
		},
		defaultPolicy: "sap-target-level-1",
		defaultPolicyIsReportOnly: false,
		defaultPolicy2: "sap-target-level-2",
		defaultPolicy2IsReportOnly: true,
		ignorePaths: [
			"lord/tirek.html",
		]
	}, "CSP middleware module got called with correct second argument");
});

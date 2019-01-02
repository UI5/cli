const {test} = require("ava");
const path = require("path");
const ComponentAnalyzer = require("../../../../lib/lbt/analyzer/ComponentAnalyzer");


function createMockPool(relPath, manifest) {
	const expectedPath = path.join(relPath, "manifest.json");
	return {
		async findResource(name) {
			if (name !== expectedPath) {
				throw new Error(`unexpected resource name: ${name}, expected ${expectedPath}`);
			}
			return {
				async buffer() {
					return JSON.stringify(manifest);
				}
			};
		}
	};
}

test("routing with empty config, routes, targets", async (t) => {
	const mockManifest = {
		"sap.ui5": {
			routing: {
				config: {},
				routes: [],
				targets: {}
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	await subject.analyze({name: path.join("test", "Component.js")}, mockInfo);

	t.deepEqual(mockInfo.deps, [
		"sap/ui/core/routing/Router.js"
	], "dependencies should be correct");
});

test("routing with empty config, targets", async (t) => {
	const mockManifest = {
		"sap.ui5": {
			routing: {
				config: {},
				targets: {}
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	await subject.analyze({name: path.join("test", "Component.js")}, mockInfo);

	t.deepEqual(mockInfo.deps, [
		"sap/ui/core/routing/Targets.js",
		"sap/ui/core/routing/Views.js"
	], "dependencies should be correct");
});

test("routing with targets but no routes", async (t) => {
	const mockManifest = {
		"sap.ui5": {
			routing: {
				config: {
					viewPath: "test.view",
					viewType: "XML"
				},
				targets: {
					test: {
						viewName: "App"
					}
				}
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	await subject.analyze({name: path.join("test", "Component.js")}, mockInfo);

	t.deepEqual(mockInfo.deps, [
		"sap/ui/core/routing/Targets.js",
		"sap/ui/core/routing/Views.js",
		"test/view/App.view.xml"
	], "dependencies should be correct");
});

test("routing with routes as array", async (t) => {
	const mockManifest = {
		"sap.ui5": {
			routing: {
				config: {
					viewPath: "test.view",
					viewType: "XML"
				},
				routes: [
					{
						name: "test",
						target: "test"
					}
				],
				targets: {
					test: {viewName: "App"}
				}
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	await subject.analyze({name: path.join("test", "Component.js")}, mockInfo);

	t.deepEqual(mockInfo.deps, [
		"sap/ui/core/routing/Router.js",
		"test/view/App.view.xml"
	], "dependencies should be correct");
});


test("routing with routes as object", async (t) => {
	const mockManifest = {
		"sap.ui5": {
			routing: {
				config: {
					viewPath: "test.view",
					viewType: "XML"
				},
				routes: {
					test: {
						target: "test"
					}
				},
				targets: {
					test: {viewName: "App"}
				}
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	await subject.analyze({name: path.join("test", "Component.js")}, mockInfo);

	t.deepEqual(mockInfo.deps, [
		"sap/ui/core/routing/Router.js",
		"test/view/App.view.xml"
	], "dependencies should be correct");
});

test("routing with route with multiple targets", async (t) => {
	const mockManifest = {
		"sap.ui5": {
			routing: {
				config: {
					viewPath: "test.view",
					viewType: "XML"
				},
				routes: {
					test: {
						target: ["test1", "test2"]
					}
				},
				targets: {
					test1: {viewName: "Master"},
					test2: {viewName: "Detail"}
				}
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	await subject.analyze({name: path.join("test", "Component.js")}, mockInfo);

	t.deepEqual(mockInfo.deps, [
		"sap/ui/core/routing/Router.js",
		"test/view/Master.view.xml",
		"test/view/Detail.view.xml"
	], "dependencies should be correct");
});

test("routing with targets with local config", async (t) => {
	const mockManifest = {
		"sap.ui5": {
			routing: {
				config: {
					viewPath: "test.view",
					viewType: "XML"
				},
				routes: {
					test1: {
						target: "test1"
					},
					test2: {
						target: "test2"
					}
				},
				targets: {
					test1: {
						viewName: "Master",
						viewType: "JS"
					},
					test2: {
						viewName: "Detail",
						viewPath: "test.subview"
					}
				}
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	await subject.analyze({name: path.join("test", "Component.js")}, mockInfo);

	t.deepEqual(mockInfo.deps, [
		"sap/ui/core/routing/Router.js",
		"test/view/Master.view.js",
		"test/subview/Detail.view.xml"
	], "dependencies should be correct");
});

test("rootView with object", (t) => {
	const mockManifest = {
		"sap.ui5": {
			rootView: {
				viewName: "test.view.App",
				type: "JS",
				async: true
			}
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	return subject.analyze({name: path.join("test", "Component.js")}, mockInfo).then( () => {
		t.deepEqual(mockInfo.deps, [
			"test/view/App.view.js",
		], "dependencies should be correct");
	});
});

test("rootView with string", (t) => {
	const mockManifest = {
		"sap.ui5": {
			rootView: "test.view.App"
		}
	};

	const mockPool = createMockPool("test/", mockManifest);

	const mockInfo = {
		deps: [],
		addDependency(name) {
			this.deps.push(name);
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	return subject.analyze({name: path.join("test", "Component.js")}, mockInfo).then( () => {
		t.deepEqual(mockInfo.deps, [
			"test/view/App.view.xml",
		], "dependencies should be correct");
	});
});

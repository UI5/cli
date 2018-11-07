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

test("routing with routes as array", (t) => {
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
		addDependency(name) {
			t.is(name, "test/view/App.view.xml");
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	return subject.analyze({name: "test/Component.js"}, mockInfo);
});


test("routing with routes as object", (t) => {
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
		addDependency(name) {
			t.is(name, "test/view/App.view.xml");
		}
	};

	const subject = new ComponentAnalyzer(mockPool);
	return subject.analyze({name: "test/Component.js"}, mockInfo);
});

test("routing with route with multiple targets", (t) => {
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
	return subject.analyze({name: "test/Component.js"}, mockInfo).then( () => {
		t.deepEqual(mockInfo.deps, [
			"test/view/Master.view.xml",
			"test/view/Detail.view.xml"
		], "dependencies should be correct");
	});
});

test("routing with targets with local config", (t) => {
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
	return subject.analyze({name: "test/Component.js"}, mockInfo).then( () => {
		t.deepEqual(mockInfo.deps, [
			"test/view/Master.view.js",
			"test/subview/Detail.view.xml"
		], "dependencies should be correct");
	});
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
	return subject.analyze({name: "test/Component.js"}, mockInfo).then( () => {
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
	return subject.analyze({name: "test/Component.js"}, mockInfo).then( () => {
		t.deepEqual(mockInfo.deps, [
			"test/view/App.view.xml",
		], "dependencies should be correct");
	});
});

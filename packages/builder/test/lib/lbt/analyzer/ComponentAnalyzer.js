const {test} = require("ava");
const Path = require("path");
const ComponentAnalyzer = require("../../../../lib/lbt/analyzer/ComponentAnalyzer");


function createMockPool(path, manifest) {
	const expectedPath = Path.join(path, "manifest.json");
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

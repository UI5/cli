import test from "ava";
import path from "node:path";
import sinon from "sinon";
import Specification from "../../../../lib/specifications/Specification.js";
import ProjectShim from "../../../../lib/specifications/extensions/ProjectShim.js";

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const __dirname = import.meta.dirname;

const nonExistingPath = path.join(__dirname, "..", "..", "..", "fixtures", "does-not-exist");
const basicProjectShimInput = {
	id: "shim.a",
	version: "1.0.0",
	modulePath: nonExistingPath, // should not matter
	configuration: {
		specVersion: "2.6",
		kind: "extension",
		type: "project-shim",
		metadata: {
			name: "project-shim-a"
		},
		shims: {
			dependencies: {
				"module.a": ["dependencies"]
			},
			configurations: {
				"module.b": {
					configuration: "configuration"
				}
			},
			collections: {
				"module.c": {
					modules: {
						"module.x": "some/path"
					}
				}
			}
		}
	}
};

test.afterEach.always((t) => {
	sinon.restore();
});

test("Correct class", async (t) => {
	const extension = await Specification.create(clone(basicProjectShimInput));
	t.true(extension instanceof ProjectShim, `Is an instance of the ProjectShim class`);
});

test("Defaults", async (t) => {
	const projectShimInput = clone(basicProjectShimInput);
	projectShimInput.configuration.shims = {};

	const extension = await Specification.create(projectShimInput);
	t.deepEqual(extension.getDependencyShims(), {}, "Returned correct default value for dependencies");
	t.deepEqual(extension.getConfigurationShims(), {}, "Returned correct default value for configuration");
	t.deepEqual(extension.getCollectionShims(), {}, "Returned correct default value for collection");
});

test("getDependencyShims", async (t) => {
	const extension = await Specification.create(clone(basicProjectShimInput));
	t.deepEqual(extension.getDependencyShims(), {
		"module.a": ["dependencies"]
	}, "Returned correct value for dependencies shim configuration");
});

test("getConfigurationShims", async (t) => {
	const extension = await Specification.create(clone(basicProjectShimInput));
	t.deepEqual(extension.getConfigurationShims(), {
		"module.b": {
			configuration: "configuration"
		}
	}, "Returned correct value for configuration shim configuration");
});

test("getCollectionShims", async (t) => {
	const extension = await Specification.create(clone(basicProjectShimInput));
	t.deepEqual(extension.getCollectionShims(), {
		"module.c": {
			modules: {
				"module.x": "some/path"
			}
		}
	}, "Returned correct value for collection shim configuration");
});

const test = require("ava");

const topologicalSort = require("../../../../lib/lbt/graph/topologicalSort");

const ModuleInfo = require("../../../../lib/lbt/resources/ModuleInfo");

function createMockPool(dependencyMapping) {
	return {
		async getModuleInfo(name) {
			const info = new ModuleInfo(name);
			let dependencies = dependencyMapping[name];
			if (!dependencies) {
				return info;
			}
			if (!Array.isArray(dependencies)) {
				dependencies = [dependencies];
			}
			dependencies.forEach((dep) => {
				info.addDependency(dep);
			});
			return info;
		}
	};
}

test("topologicalSort", async (t) => {
	const pool = createMockPool({"myroot": "mydep"});
	const roots = ["myroot", "mydep"];
	const topologicalSortResult = await topologicalSort(pool, roots);
	t.deepEqual(topologicalSortResult, ["mydep", "myroot"]);
});

test("cyclic dependencies", async (t) => {
	const pool = createMockPool({"third": "mydep", "mydep": "third"});
	const roots = ["myroot", "mydep", "third"];
	const error = await t.throwsAsync(topologicalSort(pool, roots));
	t.deepEqual(error.message, "failed to resolve cyclic dependencies: mydep,third");
});

test("no dependencies", async (t) => {
	const pool = createMockPool({});
	const roots = ["module4", "module2", "module3", "module1"];
	const topologicalSortResult = await topologicalSort(pool, roots);
	// Modules should not be sorted by any means as no dependencies are defined
	t.deepEqual(topologicalSortResult, ["module4", "module2", "module3", "module1"]);
});

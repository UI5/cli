import test from "ava";
import dependencyGraph from "../../../../lib/lbt/graph/dependencyGraph.js";
import ModuleInfo from "../../../../lib/lbt/resources/ModuleInfo.js";

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

function checkNZero(t, oResult) {
	t.falsy(oResult.n0.dominators);
	t.is(oResult.n0.name, "");
	t.deepEqual(Array.from(oResult.n0.pred), []);
	t.deepEqual(Array.from(oResult.n0.succ), []);
	t.false(oResult.n0.visited);
}

function getPredecessors(node) {
	return Array.from(node.pred).map((node) => node.name);
}

/**
 * Dependencies:
 *           ""
 *            |
 *          myroot
 *            |
 *          mydep
 *            |
 *          superb
 *
 */
test("dependency graph with 1 root", async (t) => {
	const dependencyMapping = {
		"myroot": "mydep",
		"mydep": "superb"
	};
	const pool = createMockPool(dependencyMapping);
	const roots = [{
		name: "myroot"
	}];
	const oResult = await dependencyGraph(pool, roots);
	checkNZero(t, oResult);
	t.deepEqual(Array.from(oResult.nodes.keys()), ["", "myroot", "mydep", "superb"]);

	const empty = oResult.nodes.get("");
	t.deepEqual(getPredecessors(empty), []);
	t.false(empty.visited, "just a temp node");

	const myroot = oResult.nodes.get("myroot");
	t.deepEqual(getPredecessors(myroot), [""], "myroot holds a dependency to the temp node");

	const mydep = oResult.nodes.get("mydep");
	t.deepEqual(getPredecessors(mydep), ["myroot"], "mydep holds a dependency to myroot");


	const superb = oResult.nodes.get("superb");
	t.deepEqual(getPredecessors(superb), ["mydep"], "superb holds a dependency to mydep");
});

/**
 * Dependencies:
 *           ""
 *            |    \
 *          myroot  >
 *            |   /
 *          mydep
 *            |
 *          superb
 *
 */
test("dependency with 2 roots", async (t) => {
	const dependencies = {
		"myroot": "mydep",
		"mydep": "superb"
	};
	const pool = createMockPool(dependencies);
	const roots = [{
		name: "myroot"
	}, {
		name: "mydep"
	}];
	const oResult = await dependencyGraph(pool, roots);
	checkNZero(t, oResult);
	t.deepEqual(Array.from(oResult.nodes.keys()), ["", "myroot", "mydep", "superb"]);

	const empty = oResult.nodes.get("");
	t.deepEqual(getPredecessors(empty), []);
	t.false(empty.visited, "just a temp node");

	const myroot = oResult.nodes.get("myroot");
	t.deepEqual(getPredecessors(myroot), [""], "myroot holds a dependency to the temp node");

	const mydep = oResult.nodes.get("mydep");
	t.deepEqual(getPredecessors(mydep), ["myroot", ""], "mydep holds a dependency to myroot and temp node");

	const superb = oResult.nodes.get("superb");
	t.deepEqual(getPredecessors(superb), ["mydep"], "superb holds a dependency to mydep");
});

/**
 * Dependencies:
 *           ""
 *            |
 *          myroot
 *
 */
test("dependency graph with rejecting pool", async (t) => {
	const pool = {
		async getModuleInfo() {
			throw new Error("myerror");
		}
	};
	const roots = [{
		name: "myroot"
	}];

	const oResult = await dependencyGraph(pool, roots);
	checkNZero(t, oResult);
	t.deepEqual(Array.from(oResult.nodes.keys()), ["", "myroot"]);

	const empty = oResult.nodes.get("");
	t.deepEqual(getPredecessors(empty), []);
	t.false(empty.visited, "just a temp node");

	const myroot = oResult.nodes.get("myroot");
	t.deepEqual(getPredecessors(myroot), [""], "the only dependency should be to the temp node");
});

/**
 * Dependencies:
 *           ""
 *            |
 *          myroot
 *            |
 *          mydep
 *            |   \
 *          superb \
 *         /  |   \ \
 *       one  two  three
 */
test("Advanced dependency graph with 1 root", async (t) => {
	const dependencies = {
		"myroot": "mydep",
		"mydep": ["superb", "three"],
		"superb": ["one", "two", "three"]
	};
	const pool = createMockPool(dependencies);
	const roots = [{
		name: "myroot"
	}];
	const oResult = await dependencyGraph(pool, roots);
	checkNZero(t, oResult);
	t.deepEqual(Array.from(oResult.nodes.keys()), [
		"",
		"myroot",
		"mydep",
		"superb",
		"three",
		"one",
		"two"
	]);

	const empty = oResult.nodes.get("");
	t.deepEqual(getPredecessors(empty), []);
	t.false(empty.visited, "just a temp node");

	const myroot = oResult.nodes.get("myroot");
	t.deepEqual(getPredecessors(myroot), [""], "myroot holds a dependency to the temp node");

	const mydep = oResult.nodes.get("mydep");
	t.deepEqual(getPredecessors(mydep), ["myroot"], "mydep holds a dependency to myroot");


	const superb = oResult.nodes.get("superb");
	t.deepEqual(getPredecessors(superb), ["mydep"], "superb holds a dependency to mydep");

	const one = oResult.nodes.get("one");
	t.deepEqual(getPredecessors(one), ["superb"], "one holds a dependency to superb");

	const two = oResult.nodes.get("two");
	t.deepEqual(getPredecessors(two), ["superb"], "two holds a dependency to superb");

	const three = oResult.nodes.get("three");
	t.deepEqual(getPredecessors(three), ["superb", "mydep"], "three holds a dependency to mydep and superb");
});

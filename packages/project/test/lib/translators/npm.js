const test = require("ava");
const sinon = require("sinon");
const path = require("path");

const NpmTranslator = require("../../../lib/translators/npm")._NpmTranslator;

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("processPkg - single package", async (t) => {
	const npmTranslator = new NpmTranslator({
		includeDeduped: false
	});
	const result = await npmTranslator.processPkg({
		path: path.join("/", "sample-package"),
		name: "sample-package",
		pkg: {
			version: "1.2.3"
		}
	}, ":parent:");
	t.deepEqual(result, [{
		dependencies: [],
		id: "sample-package",
		path: path.join("/", "sample-package"),
		version: "1.2.3"
	}]);
});

test.serial("processPkg - collection", async (t) => {
	const npmTranslator = new NpmTranslator({
		includeDeduped: false
	});

	const readProjectStub = sinon.stub(npmTranslator, "readProject").resolves({
		dependencies: [],
		id: "other-package",
		path: path.join("/", "sample-package", "packages", "other-package"),
		version: "4.5.6"
	});

	const result = await npmTranslator.processPkg({
		path: path.join("/", "sample-package"),
		name: "sample-package",
		pkg: {
			version: "1.2.3",
			collection: {
				modules: {
					"other-package": "./packages/other-package"
				}
			}
		}
	}, ":parent:");

	t.deepEqual(result, [{
		dependencies: [],
		id: "other-package",
		path: path.join("/", "sample-package", "packages", "other-package"),
		version: "4.5.6"
	}]);

	t.is(readProjectStub.callCount, 1, "readProject should be called once");
	t.deepEqual(readProjectStub.getCall(0).args, [
		{
			moduleName: "other-package",
			modulePath: path.join("/", "sample-package", "packages", "other-package"),
			parentPath: ":parent:sample-package:",
		},
	], "readProject should be called with the expected args");
});

test.serial("processPkg - pkg.collection (type string)", async (t) => {
	const npmTranslator = new NpmTranslator({
		includeDeduped: false
	});

	const readProjectStub = sinon.stub(npmTranslator, "readProject").resolves(null);

	const result = await npmTranslator.processPkg({
		path: path.join("/", "sample-package"),
		name: "sample-package",
		pkg: {
			version: "1.2.3",

			// collection of type string should not be detected as UI5 collection
			collection: "foo"
		}
	}, ":parent:");

	t.deepEqual(result, [{
		dependencies: [],
		id: "sample-package",
		path: path.join("/", "sample-package"),
		version: "1.2.3"
	}]);

	t.is(readProjectStub.callCount, 0, "readProject should not be called once");
});

test.serial("processPkg - pkg.collection (without modules)", async (t) => {
	const npmTranslator = new NpmTranslator({
		includeDeduped: false
	});

	const readProjectStub = sinon.stub(npmTranslator, "readProject").resolves(null);

	const result = await npmTranslator.processPkg({
		path: path.join("/", "sample-package"),
		name: "sample-package",
		pkg: {
			version: "1.2.3",

			// collection without modules object should not be detected as UI5 collection
			collection: {
				modules: true
			}
		}
	}, ":parent:");

	t.deepEqual(result, [{
		dependencies: [],
		id: "sample-package",
		path: path.join("/", "sample-package"),
		version: "1.2.3"
	}]);

	t.is(readProjectStub.callCount, 0, "readProject should not be called once");
});

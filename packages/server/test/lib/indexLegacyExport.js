const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.serial("Correct legacy mapping", async (t) => {
	const serveIndexStub = sinon.stub();
	mock("../../lib/middleware/serveIndex", serveIndexStub);

	mock.reRequire("../../index");
	const index = require("../../index");
	const resourceCollections = {
		combo: "combo",
		source: "source",
		dependencies: "dependencies"
	};
	index.middleware.serveIndex({
		resourceCollections,
		tree: "tree"
	});

	t.deepEqual(serveIndexStub.getCall(0).args[0], {
		resources: {
			all: "combo",
			rootProject: "source",
			dependencies: "dependencies"
		},
		tree: "tree"
	});
	mock.stop("../../lib/middleware/serveIndex");
	mock.reRequire("../../index");
});

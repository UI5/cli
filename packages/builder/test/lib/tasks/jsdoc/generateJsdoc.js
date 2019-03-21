const {test} = require("ava");
const sinon = require("sinon");
const tmp = require("tmp");
const path = require("path");

const mock = require("mock-require");

const generateJsdoc = require("../../../../lib/tasks/jsdoc/generateJsdoc");

test.beforeEach((t) => {
	t.context.tmpStub = sinon.stub(tmp, "dir");
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("createTmpDir successful", async (t) => {
	t.context.tmpStub.callsArgWithAsync(1, undefined, "some/path");

	const res = await generateJsdoc._createTmpDir("som$e.nam3/space"); // non alphanum characters get removed

	t.deepEqual(t.context.tmpStub.callCount, 1, "Tmp dir is called once");
	t.deepEqual(t.context.tmpStub.getCall(0).args[0].prefix, "ui5-tooling-tmp-jsdoc-somenam3space-");
	t.deepEqual(res, {path: "some/path"}, "Correct path returned");
});

test.serial("createTmpDir error", async (t) => {
	t.context.tmpStub.callsArgWithAsync(1, {message: "Dir creation failed"}, "some/path");

	const res = await t.throws(generateJsdoc._createTmpDir("some.namespace"));

	t.deepEqual(t.context.tmpStub.callCount, 1, "Tmp dir is called once");
	t.deepEqual(t.context.tmpStub.getCall(0).args[0].prefix, "ui5-tooling-tmp-jsdoc-somenamespace-");
	t.deepEqual(res, {message: "Dir creation failed"}, "Dir creation failed");
});

test.serial("createTmpDirs", async (t) => {
	const makeDirStub = sinon.stub().resolves();
	mock("make-dir", makeDirStub);
	const generateJsdoc = mock.reRequire("../../../../lib/tasks/jsdoc/generateJsdoc");

	t.context.tmpStub.callsArgWithAsync(1, undefined, "/some/path");

	const res = await generateJsdoc._createTmpDirs("some.namespace");

	t.deepEqual(res, {
		sourcePath: path.join("/", "some", "path", "src"),
		targetPath: path.join("/", "some", "path", "target"),
		tmpPath: path.join("/", "some", "path", "tmp")
	}, "Correct temporary directories returned");
	t.deepEqual(makeDirStub.callCount, 3, "One directory got created");
	t.deepEqual(makeDirStub.getCall(0).args[0], path.join("/", "some", "path", "src"),
		"Correct srcdir path got created");
	t.deepEqual(makeDirStub.getCall(1).args[0], path.join("/", "some", "path", "target"),
		"Correct target dir path got created");
	t.deepEqual(makeDirStub.getCall(2).args[0], path.join("/", "some", "path", "tmp"),
		"Correct tmp dir path got created");

	mock.stop("make-dir");
});

test.serial("writeResourcesToDir with byGlobSource", async (t) => {
	const writeStub = sinon.stub().resolves();
	const createAdapterStub = sinon.stub(require("@ui5/fs").resourceFactory, "createAdapter").returns({
		write: writeStub
	});

	await generateJsdoc._writeResourcesToDir({
		workspace: {
			// stub byGlobSource
			byGlobSource: (pattern) => {
				t.deepEqual(pattern, "some pattern", "Glob with correct pattern");
				return Promise.resolve(["resource A", "resource B"]);
			}
		},
		pattern: "some pattern",
		targetPath: "/some/target/path"
	});

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: "/some/target/path",
		virBasePath: "/resources/"
	}, "createAdapter called with correct arguments");

	t.deepEqual(writeStub.callCount, 2, "Write got called four times");
	t.deepEqual(writeStub.getCall(0).args[0], "resource A", "Write got called for resource A");
	t.deepEqual(writeStub.getCall(1).args[0], "resource B", "Write got called for resource B");
});

test.serial("writeResourcesToDir with byGlob", async (t) => {
	const writeStub = sinon.stub().resolves();
	const createAdapterStub = sinon.stub(require("@ui5/fs").resourceFactory, "createAdapter").returns({
		write: writeStub
	});

	await generateJsdoc._writeResourcesToDir({
		workspace: {
			byGlob: (pattern) => {
				t.deepEqual(pattern, "some pattern", "Glob with correct pattern");
				return Promise.resolve(["resource A", "resource B"]);
			}
		},
		pattern: "some pattern",
		targetPath: "/some/target/path"
	});

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: "/some/target/path",
		virBasePath: "/resources/"
	}, "createAdapter called with correct arguments");

	t.deepEqual(writeStub.callCount, 2, "Write got called four times");
	t.deepEqual(writeStub.getCall(0).args[0], "resource A", "Write got called for resource A");
	t.deepEqual(writeStub.getCall(1).args[0], "resource B", "Write got called for resource B");
});

test.serial("writeDependencyApisToDir with byGlob", async (t) => {
	const writeStub = sinon.stub().resolves();
	const createAdapterStub = sinon.stub(require("@ui5/fs").resourceFactory, "createAdapter").returns({
		write: writeStub
	});

	const setPathStubA = sinon.stub();
	const setPathStubB = sinon.stub();

	const cloneStubA = sinon.stub().resolves({
		// Cloned resource
		id: "resource A",
		setPath: setPathStubA
	});
	const cloneStubB = sinon.stub().resolves({
		// Cloned resource
		id: "resource B",
		setPath: setPathStubB
	});
	const initialResourceA = {
		// Globbed resource
		clone: cloneStubA
	};
	const initialResourceB = {
		// Globbed resource
		clone: cloneStubB
	};

	await generateJsdoc._writeDependencyApisToDir({
		dependencies: {
			byGlob: (pattern) => {
				t.deepEqual(pattern, "/test-resources/**/designtime/api.json",
					"Dependency api.json glob with correct pattern");
				return Promise.resolve([initialResourceA, initialResourceB]);
			}
		},
		targetPath: "/some/target/path"
	});

	t.deepEqual(cloneStubA.callCount, 1, "resource A got cloned once");
	t.deepEqual(cloneStubB.callCount, 1, "resource B got cloned once");

	t.deepEqual(setPathStubA.callCount, 1, "Path of cloned resource A got changed");
	t.deepEqual(setPathStubA.getCall(0).args[0], "/api-0.json", "Path of cloned resource A got changed correctly");

	t.deepEqual(setPathStubB.callCount, 1, "Path of cloned resource B got changed");
	t.deepEqual(setPathStubB.getCall(0).args[0], "/api-1.json", "Path of cloned resource B got changed correctly");

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: "/some/target/path",
		virBasePath: "/"
	}, "createAdapter called with correct arguments");

	t.deepEqual(writeStub.callCount, 2, "Write got called four times");
	t.deepEqual(writeStub.getCall(0).args[0].id, "resource A", "Write got called for resource A");
	t.deepEqual(writeStub.getCall(1).args[0].id, "resource B", "Write got called for resource B");
});

test.serial("generateJsdoc", async (t) => {
	const jsdocGeneratorStub = sinon.stub().resolves(["resource A", "resource B"]);
	mock("../../../../lib/processors/jsdoc/jsdocGenerator", jsdocGeneratorStub);
	const generateJsdoc = mock.reRequire("../../../../lib/tasks/jsdoc/generateJsdoc");

	const createTmpDirsStub = sinon.stub(generateJsdoc, "_createTmpDirs").resolves({
		sourcePath: "/some/source/path",
		targetPath: "/some/target/path",
		tmpPath: "/some/tmp/path",
	});
	const writeResourcesToDirStub = sinon.stub(generateJsdoc, "_writeResourcesToDir").resolves(1);
	const writeDependencyApisToDirStub = sinon.stub(generateJsdoc, "_writeDependencyApisToDir").resolves(0);

	const writeStub = sinon.stub().resolves();
	const workspace = {
		write: writeStub
	};
	await generateJsdoc({
		workspace,
		dependencies: "dependencies",
		options: {
			pattern: "some pattern",
			projectName: "some.project",
			namespace: "some/project",
			version: "some version"
		}
	});

	t.deepEqual(createTmpDirsStub.callCount, 1, "createTmpDirs got called once");
	t.deepEqual(createTmpDirsStub.getCall(0).args[0], "some.project",
		"createTmpDirs got called with correct arguments");

	t.deepEqual(writeResourcesToDirStub.callCount, 1, "writeResourcesToDir got called once");
	t.deepEqual(writeResourcesToDirStub.getCall(0).args[0], {
		workspace,
		pattern: "some pattern",
		targetPath: "/some/source/path" // one's target is another one's source
	}, "writeResourcesToDir got called with correct arguments");

	t.deepEqual(writeDependencyApisToDirStub.callCount, 1, "writeDependencyApisToDir got called once");
	t.deepEqual(writeDependencyApisToDirStub.getCall(0).args[0], {
		dependencies: "dependencies",
		targetPath: "/some/tmp/path/dependency-apis"
	}, "writeDependencyApisToDir got called with correct arguments");

	t.deepEqual(jsdocGeneratorStub.callCount, 1, "jsdocGenerator processor got called once");
	t.deepEqual(jsdocGeneratorStub.getCall(0).args[0], {
		sourcePath: "/some/source/path",
		targetPath: "/some/target/path",
		tmpPath: "/some/tmp/path",
		options: {
			projectName: "some.project",
			namespace: "some/project",
			version: "some version",
			variants: ["apijson"]
		}
	}, "jsdocGenerator got called with correct arguments");

	t.deepEqual(writeStub.callCount, 2, "Write got called twice");
	t.deepEqual(writeStub.getCall(0).args[0], "resource A", "Write got called with correct arguments");
	t.deepEqual(writeStub.getCall(1).args[0], "resource B", "Write got called with correct arguments");

	mock.stop("../../../../lib/processors/jsdoc/jsdocGenerator");
});

test.serial("generateJsdoc with missing resources", async (t) => {
	const jsdocGeneratorStub = sinon.stub().resolves();
	mock("../../../../lib/processors/jsdoc/jsdocGenerator", jsdocGeneratorStub);
	const logger = require("@ui5/logger");
	const infoLogStub = sinon.stub();
	const myLoggerInstance = {
		info: infoLogStub
	};
	sinon.stub(logger, "getLogger").returns(myLoggerInstance);
	const generateJsdoc = mock.reRequire("../../../../lib/tasks/jsdoc/generateJsdoc");

	sinon.stub(generateJsdoc, "_createTmpDirs").resolves({
		sourcePath: "/some/source/path",
		targetPath: "/some/target/path",
		tmpPath: "/some/tmp/path",
	});
	sinon.stub(generateJsdoc, "_writeResourcesToDir").resolves(0);
	sinon.stub(generateJsdoc, "_writeDependencyApisToDir").resolves(0);

	const writeStub = sinon.stub().resolves();
	const workspace = {
		write: writeStub
	};
	await generateJsdoc({
		workspace,
		dependencies: "dependencies",
		options: {
			pattern: "some pattern",
			projectName: "some.project",
			namespace: "some/project",
			version: "some version"
		}
	});

	t.deepEqual(infoLogStub.callCount, 1, "One message has been logged");
	t.deepEqual(infoLogStub.getCall(0).args[0], "Failed to find any input resources for project some.project " +
		"using pattern some pattern. Skipping JSDoc generation...",
	"Correct message has been logged");

	t.deepEqual(jsdocGeneratorStub.callCount, 0, "jsdocGenerator processor has *not* been called");

	mock.stop("../../../../lib/processors/jsdoc/jsdocGenerator");
});

test.serial("generateJsdoc missing parameters", async (t) => {
	const error = await t.throws(generateJsdoc());
	t.deepEqual(error.message, "[generateJsdoc]: One or more mandatory options not provided",
		"Correct error message thrown");
});

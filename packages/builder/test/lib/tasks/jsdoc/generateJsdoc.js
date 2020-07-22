const test = require("ava");
const sinon = require("sinon");
const fs = require("graceful-fs");
const os = require("os");
const path = require("path");

const mock = require("mock-require");

const generateJsdoc = require("../../../../lib/tasks/jsdoc/generateJsdoc");

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("createTmpDir successful", async (t) => {
	const makeDirStub = sinon.stub().resolves();
	mock("make-dir", makeDirStub);

	const mkdtempStub = sinon.stub(fs, "mkdtemp").callsArgWithAsync(1, undefined, "some/path");
	const generateJsdoc = mock.reRequire("../../../../lib/tasks/jsdoc/generateJsdoc");

	const res = await generateJsdoc._createTmpDir("som$e.nam3/space"); // non alphanum characters get removed

	const tmpRootPath = path.join(os.tmpdir(), "ui5-tooling");

	t.deepEqual(makeDirStub.callCount, 1, "One directory got created");
	t.deepEqual(makeDirStub.getCall(0).args[0], tmpRootPath, "Correct tmp root dir got created");

	t.deepEqual(mkdtempStub.callCount, 1, "mkdtemp is called once");
	t.deepEqual(mkdtempStub.getCall(0).args[0], path.join(tmpRootPath, "jsdoc-somenam3space-"));
	t.deepEqual(res, "some/path", "Correct path returned");

	mock.stop("make-dir");
});

test.serial("createTmpDir error", async (t) => {
	const makeDirStub = sinon.stub().resolves();
	mock("make-dir", makeDirStub);

	const mkdtempStub = sinon.stub(fs, "mkdtemp").callsArgWithAsync(1, new Error("Dir creation failed"), "some/path");
	const generateJsdoc = mock.reRequire("../../../../lib/tasks/jsdoc/generateJsdoc");

	const res = await t.throwsAsync(generateJsdoc._createTmpDir("some.namespace"));

	const tmpRootPath = path.join(os.tmpdir(), "ui5-tooling");

	t.deepEqual(makeDirStub.callCount, 1, "One directory got created");
	t.deepEqual(makeDirStub.getCall(0).args[0], tmpRootPath, "Correct tmp root dir got created");

	t.deepEqual(mkdtempStub.callCount, 1, "mkdtemp is called once");
	t.deepEqual(mkdtempStub.getCall(0).args[0], path.join(tmpRootPath, "jsdoc-somenamespace-"));
	t.deepEqual(res.message, "Dir creation failed", "Dir creation failed");

	mock.stop("make-dir");
});

test.serial("createTmpDirs", async (t) => {
	const makeDirStub = sinon.stub().resolves();
	mock("make-dir", makeDirStub);
	const rimrafStub = sinon.stub().resolves();
	mock("rimraf", rimrafStub);
	const generateJsdoc = mock.reRequire("../../../../lib/tasks/jsdoc/generateJsdoc");

	const createTmpDirStub = sinon.stub(generateJsdoc, "_createTmpDir")
		.resolves(path.join("/", "some", "path"));

	const res = await generateJsdoc._createTmpDirs("some.namespace");

	t.deepEqual(createTmpDirStub.callCount, 1, "creteTmpDir called once");
	t.deepEqual(createTmpDirStub.getCall(0).args[0], "some.namespace", "creteTmpDir called with correct argument");

	t.deepEqual(makeDirStub.callCount, 3, "Three directory got created");
	t.deepEqual(makeDirStub.getCall(0).args[0], path.join("/", "some", "path", "src"),
		"Correct srcdir path got created");
	t.deepEqual(makeDirStub.getCall(1).args[0], path.join("/", "some", "path", "target"),
		"Correct target dir path got created");
	t.deepEqual(makeDirStub.getCall(2).args[0], path.join("/", "some", "path", "tmp"),
		"Correct tmp dir path got created");

	t.deepEqual(res.sourcePath, path.join("/", "some", "path", "src"), "Correct temporary src dir path returned");
	t.deepEqual(res.targetPath, path.join("/", "some", "path", "target"), "Correct temporary target dir path returned");
	t.deepEqual(res.tmpPath, path.join("/", "some", "path", "tmp"), "Correct temporary tmp dir path returned");

	res.cleanup();
	t.deepEqual(rimrafStub.callCount, 1, "Cleanup callback: rimraf called once");
	t.deepEqual(rimrafStub.getCall(0).args[0], path.join("/", "some", "path"),
		"Cleanup callback: rimraf called with correct path");

	mock.stop("make-dir");
	mock.stop("rimraf");
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
		targetPath: path.join("/", "some", "target", "path")
	});

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: path.join("/", "some", "target", "path"),
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
		targetPath: path.join("/", "some", "target", "path")
	});

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: path.join("/", "some", "target", "path"),
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
		targetPath: path.join("/", "some", "target", "path")
	});

	t.deepEqual(cloneStubA.callCount, 1, "resource A got cloned once");
	t.deepEqual(cloneStubB.callCount, 1, "resource B got cloned once");

	t.deepEqual(setPathStubA.callCount, 1, "Path of cloned resource A got changed");
	t.deepEqual(setPathStubA.getCall(0).args[0], "/api-0.json", "Path of cloned resource A got changed correctly");

	t.deepEqual(setPathStubB.callCount, 1, "Path of cloned resource B got changed");
	t.deepEqual(setPathStubB.getCall(0).args[0], "/api-1.json", "Path of cloned resource B got changed correctly");

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: path.join("/", "some", "target", "path"),
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

	const cleanupStub = sinon.stub().resolves();
	const createTmpDirsStub = sinon.stub(generateJsdoc, "_createTmpDirs").resolves({
		sourcePath: path.join("/", "some", "source", "path"),
		targetPath: path.join("/", "some", "target", "path"),
		tmpPath: path.join("/", "some", "tmp", "path"),
		cleanup: cleanupStub
	});
	const writeResourcesToDirStub = sinon.stub(generateJsdoc, "_writeResourcesToDir").resolves(1);
	const writeDependencyApisToDirStub = sinon.stub(generateJsdoc, "_writeDependencyApisToDir").resolves(0);

	const writeStub = sinon.stub().resolves();
	const workspace = {
		write: writeStub
	};

	const registerCleanupTaskStub = sinon.stub();
	const taskUtil = {
		registerCleanupTask: registerCleanupTaskStub
	};
	await generateJsdoc({
		taskUtil,
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

	t.deepEqual(registerCleanupTaskStub.callCount, 1, "registerCleanupTask called once");
	t.deepEqual(registerCleanupTaskStub.getCall(0).args[0], cleanupStub,
		"registerCleanupTask called with correct argument");

	t.deepEqual(writeResourcesToDirStub.callCount, 1, "writeResourcesToDir got called once");
	t.deepEqual(writeResourcesToDirStub.getCall(0).args[0], {
		workspace,
		pattern: "some pattern",
		targetPath: path.join("/", "some", "source", "path") // one's target is another one's source
	}, "writeResourcesToDir got called with correct arguments");

	t.deepEqual(writeDependencyApisToDirStub.callCount, 1, "writeDependencyApisToDir got called once");
	t.deepEqual(writeDependencyApisToDirStub.getCall(0).args[0], {
		dependencies: "dependencies",
		targetPath: path.join("/", "some", "tmp", "path", "dependency-apis")
	}, "writeDependencyApisToDir got called with correct arguments");

	t.deepEqual(jsdocGeneratorStub.callCount, 1, "jsdocGenerator processor got called once");
	t.deepEqual(jsdocGeneratorStub.getCall(0).args[0], {
		sourcePath: path.join("/", "some", "source", "path"),
		targetPath: path.join("/", "some", "target", "path"),
		tmpPath: path.join("/", "some", "tmp", "path"),
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

	const cleanupStub = sinon.stub().resolves();
	sinon.stub(generateJsdoc, "_createTmpDirs").resolves({
		sourcePath: path.join("/", "some", "source", "path"),
		targetPath: path.join("/", "some", "target", "path"),
		tmpPath: path.join("/", "some", "tmp", "path"),
		cleanup: cleanupStub
	});
	sinon.stub(generateJsdoc, "_writeResourcesToDir").resolves(0);
	sinon.stub(generateJsdoc, "_writeDependencyApisToDir").resolves(0);

	const writeStub = sinon.stub().resolves();
	const workspace = {
		write: writeStub
	};
	const registerCleanupTaskStub = sinon.stub();
	const taskUtil = {
		registerCleanupTask: registerCleanupTaskStub
	};
	await generateJsdoc({
		taskUtil,
		workspace,
		dependencies: "dependencies",
		options: {
			pattern: "some pattern",
			projectName: "some.project",
			namespace: "some/project",
			version: "some version"
		}
	});

	t.deepEqual(registerCleanupTaskStub.callCount, 1, "registerCleanupTask called once");
	t.deepEqual(registerCleanupTaskStub.getCall(0).args[0], cleanupStub,
		"registerCleanupTask called with correct argument");

	t.deepEqual(infoLogStub.callCount, 1, "One message has been logged");
	t.deepEqual(infoLogStub.getCall(0).args[0], "Failed to find any input resources for project some.project " +
		"using pattern some pattern. Skipping JSDoc generation...",
	"Correct message has been logged");

	t.deepEqual(jsdocGeneratorStub.callCount, 0, "jsdocGenerator processor has *not* been called");

	mock.stop("../../../../lib/processors/jsdoc/jsdocGenerator");
});

test.serial("generateJsdoc no parameters", async (t) => {
	await t.throwsAsync(generateJsdoc(), {
		instanceOf: TypeError
	}, "TypeError thrown");
});

test.serial("generateJsdoc missing parameters", async (t) => {
	const error = await t.throwsAsync(generateJsdoc({}));
	t.deepEqual(error.message, "[generateJsdoc]: One or more mandatory options not provided",
		"Correct error message thrown");
});

import test from "ava";
import sinonGlobal from "sinon";
import os from "node:os";
import path from "node:path";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.mkdtempStub = sinon.stub();
	t.context.makeDirStub = sinon.stub().resolves();
	t.context.rimrafStub = sinon.stub().resolves();
	t.context.jsdocGeneratorStub = sinon.stub();

	t.context.writeStub = sinon.stub().resolves();
	t.context.createAdapterStub = sinon.stub().returns({
		write: t.context.writeStub
	});

	t.context.log = {
		info: sinon.stub()
	};

	t.context.generateJsdoc = await esmock("../../../../lib/tasks/jsdoc/generateJsdoc.js", {
		"graceful-fs": {
			mkdtemp: t.context.mkdtempStub
		},
		"make-dir": t.context.makeDirStub,
		"rimraf": t.context.rimrafStub,
		"@ui5/fs/resourceFactory": {
			createAdapter: t.context.createAdapterStub
		},
		"@ui5/logger": {
			getLogger: sinon.stub().returns(t.context.log)
		},
		"../../../../lib/processors/jsdoc/jsdocGenerator": t.context.jsdocGeneratorStub,
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("createTmpDir successful", async (t) => {
	const {generateJsdoc, makeDirStub, mkdtempStub} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

	mkdtempStub.callsArgWithAsync(1, undefined, "some/path");

	const res = await generateJsdocUtils.createTmpDir("som$e.nam3/space"); // non alphanum characters get removed

	const tmpRootPath = path.join(os.tmpdir(), "ui5-tooling");

	t.is(makeDirStub.callCount, 1, "One directory got created");
	t.deepEqual(makeDirStub.getCall(0).args[0], tmpRootPath, "Correct tmp root dir got created");

	t.is(mkdtempStub.callCount, 1, "mkdtemp is called once");
	t.deepEqual(mkdtempStub.getCall(0).args[0], path.join(tmpRootPath, "jsdoc-somenam3space-"));
	t.is(res, "some/path", "Correct path returned");
});

test.serial("createTmpDir error", async (t) => {
	const {generateJsdoc, makeDirStub, mkdtempStub} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

	mkdtempStub.callsArgWithAsync(1, new Error("Dir creation failed"), "some/path");

	const res = await t.throwsAsync(generateJsdocUtils.createTmpDir("some.namespace"));

	const tmpRootPath = path.join(os.tmpdir(), "ui5-tooling");

	t.is(makeDirStub.callCount, 1, "One directory got created");
	t.deepEqual(makeDirStub.getCall(0).args[0], tmpRootPath, "Correct tmp root dir got created");

	t.is(mkdtempStub.callCount, 1, "mkdtemp is called once");
	t.deepEqual(mkdtempStub.getCall(0).args[0], path.join(tmpRootPath, "jsdoc-somenamespace-"));
	t.is(res.message, "Dir creation failed", "Dir creation failed");
});

test.serial("createTmpDirs", async (t) => {
	const {sinon, generateJsdoc, makeDirStub, rimrafStub} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

	const createTmpDirStub = sinon.stub(generateJsdocUtils, "createTmpDir")
		.resolves(path.join("/", "some", "path"));

	const res = await generateJsdocUtils.createTmpDirs("some.namespace");

	t.is(createTmpDirStub.callCount, 1, "creteTmpDir called once");
	t.is(createTmpDirStub.getCall(0).args[0], "some.namespace", "creteTmpDir called with correct argument");

	t.is(makeDirStub.callCount, 3, "Three directory got created");
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
	t.is(rimrafStub.callCount, 1, "Cleanup callback: rimraf called once");
	t.deepEqual(rimrafStub.getCall(0).args[0], path.join("/", "some", "path"),
		"Cleanup callback: rimraf called with correct path");
});

test.serial("writeResourcesToDir with byGlobSource", async (t) => {
	const {generateJsdoc, createAdapterStub, writeStub} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

	await generateJsdocUtils.writeResourcesToDir({
		workspace: {
			// stub byGlobSource
			byGlobSource: (pattern) => {
				t.is(pattern, "some pattern", "Glob with correct pattern");
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

	t.is(writeStub.callCount, 2, "Write got called four times");
	t.is(writeStub.getCall(0).args[0], "resource A", "Write got called for resource A");
	t.is(writeStub.getCall(1).args[0], "resource B", "Write got called for resource B");
});

test.serial("writeResourcesToDir with byGlob", async (t) => {
	const {generateJsdoc, createAdapterStub, writeStub} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

	await generateJsdocUtils.writeResourcesToDir({
		workspace: {
			byGlob: (pattern) => {
				t.is(pattern, "some pattern", "Glob with correct pattern");
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

	t.is(writeStub.callCount, 2, "Write got called four times");
	t.is(writeStub.getCall(0).args[0], "resource A", "Write got called for resource A");
	t.is(writeStub.getCall(1).args[0], "resource B", "Write got called for resource B");
});

test.serial("writeDependencyApisToDir with byGlob", async (t) => {
	const {sinon, generateJsdoc, createAdapterStub, writeStub} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

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

	await generateJsdocUtils.writeDependencyApisToDir({
		dependencies: {
			byGlob: (pattern) => {
				t.is(pattern, "/test-resources/**/designtime/api.json",
					"Dependency api.json glob with correct pattern");
				return Promise.resolve([initialResourceA, initialResourceB]);
			}
		},
		targetPath: path.join("/", "some", "target", "path")
	});

	t.is(cloneStubA.callCount, 1, "resource A got cloned once");
	t.is(cloneStubB.callCount, 1, "resource B got cloned once");

	t.is(setPathStubA.callCount, 1, "Path of cloned resource A got changed");
	t.is(setPathStubA.getCall(0).args[0], "/api-0.json", "Path of cloned resource A got changed correctly");

	t.is(setPathStubB.callCount, 1, "Path of cloned resource B got changed");
	t.is(setPathStubB.getCall(0).args[0], "/api-1.json", "Path of cloned resource B got changed correctly");

	t.deepEqual(createAdapterStub.getCall(0).args[0], {
		fsBasePath: path.join("/", "some", "target", "path"),
		virBasePath: "/"
	}, "createAdapter called with correct arguments");

	t.is(writeStub.callCount, 2, "Write got called four times");
	t.is(writeStub.getCall(0).args[0].id, "resource A", "Write got called for resource A");
	t.is(writeStub.getCall(1).args[0].id, "resource B", "Write got called for resource B");
});

test.serial("generateJsdoc", async (t) => {
	const {sinon, generateJsdoc, jsdocGeneratorStub} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

	jsdocGeneratorStub.resolves(["resource A", "resource B"]);

	const cleanupStub = sinon.stub().resolves();
	const createTmpDirsStub = sinon.stub(generateJsdocUtils, "createTmpDirs").resolves({
		sourcePath: path.join("/", "some", "source", "path"),
		targetPath: path.join("/", "some", "target", "path"),
		tmpPath: path.join("/", "some", "tmp", "path"),
		cleanup: cleanupStub
	});
	const writeResourcesToDirStub = sinon.stub(generateJsdocUtils, "writeResourcesToDir").resolves(1);
	const writeDependencyApisToDirStub = sinon.stub(generateJsdocUtils, "writeDependencyApisToDir").resolves(0);

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

	t.is(createTmpDirsStub.callCount, 1, "createTmpDirs got called once");
	t.is(createTmpDirsStub.getCall(0).args[0], "some.project",
		"createTmpDirs got called with correct arguments");

	t.is(registerCleanupTaskStub.callCount, 1, "registerCleanupTask called once");
	t.deepEqual(registerCleanupTaskStub.getCall(0).args[0], cleanupStub,
		"registerCleanupTask called with correct argument");

	t.is(writeResourcesToDirStub.callCount, 1, "writeResourcesToDir got called once");
	t.deepEqual(writeResourcesToDirStub.getCall(0).args[0], {
		workspace,
		pattern: "some pattern",
		targetPath: path.join("/", "some", "source", "path") // one's target is another one's source
	}, "writeResourcesToDir got called with correct arguments");

	t.is(writeDependencyApisToDirStub.callCount, 1, "writeDependencyApisToDir got called once");
	t.deepEqual(writeDependencyApisToDirStub.getCall(0).args[0], {
		dependencies: "dependencies",
		targetPath: path.join("/", "some", "tmp", "path", "dependency-apis")
	}, "writeDependencyApisToDir got called with correct arguments");

	t.is(jsdocGeneratorStub.callCount, 1, "jsdocGenerator processor got called once");
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

	t.is(writeStub.callCount, 2, "Write got called twice");
	t.is(writeStub.getCall(0).args[0], "resource A", "Write got called with correct arguments");
	t.is(writeStub.getCall(1).args[0], "resource B", "Write got called with correct arguments");
});

test.serial("generateJsdoc with missing resources", async (t) => {
	const {sinon, jsdocGeneratorStub, generateJsdoc, log} = t.context;
	const generateJsdocUtils = generateJsdoc._utils;

	const cleanupStub = sinon.stub().resolves();
	sinon.stub(generateJsdocUtils, "createTmpDirs").resolves({
		sourcePath: path.join("/", "some", "source", "path"),
		targetPath: path.join("/", "some", "target", "path"),
		tmpPath: path.join("/", "some", "tmp", "path"),
		cleanup: cleanupStub
	});
	sinon.stub(generateJsdocUtils, "writeResourcesToDir").resolves(0);
	sinon.stub(generateJsdocUtils, "writeDependencyApisToDir").resolves(0);

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

	t.is(registerCleanupTaskStub.callCount, 1, "registerCleanupTask called once");
	t.deepEqual(registerCleanupTaskStub.getCall(0).args[0], cleanupStub,
		"registerCleanupTask called with correct argument");

	t.is(log.info.callCount, 1, "One message has been logged");
	t.deepEqual(log.info.getCall(0).args[0], "Failed to find any input resources for project some.project " +
		"using pattern some pattern. Skipping JSDoc generation...",
	"Correct message has been logged");

	t.is(jsdocGeneratorStub.callCount, 0, "jsdocGenerator processor has *not* been called");
});

test.serial("generateJsdoc no parameters", async (t) => {
	const {generateJsdoc} = t.context;
	await t.throwsAsync(generateJsdoc(), {
		instanceOf: TypeError
	}, "TypeError thrown");
});

test.serial("generateJsdoc missing parameters", async (t) => {
	const {generateJsdoc} = t.context;
	const error = await t.throwsAsync(generateJsdoc({}));
	t.is(error.message, "[generateJsdoc]: One or more mandatory options not provided",
		"Correct error message thrown");
});

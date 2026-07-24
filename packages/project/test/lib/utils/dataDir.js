import test from "ava";
import path from "node:path";
import os from "node:os";
import sinon from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.originalUi5DataDirEnv = process.env.UI5_DATA_DIR;
	delete process.env.UI5_DATA_DIR;

	t.context.configGetUi5DataDirStub = sinon.stub().returns(undefined);
	t.context.ConfigurationStub = {
		fromFile: sinon.stub().resolves({
			getUi5DataDir: t.context.configGetUi5DataDirStub
		})
	};

	const {resolveUi5DataDir} = await esmock("../../../lib/utils/dataDir.js", {
		"../../../lib/config/Configuration.js": t.context.ConfigurationStub
	});
	t.context.resolveUi5DataDir = resolveUi5DataDir;
});

test.afterEach.always((t) => {
	if (typeof t.context.originalUi5DataDirEnv === "undefined") {
		delete process.env.UI5_DATA_DIR;
	} else {
		process.env.UI5_DATA_DIR = t.context.originalUi5DataDirEnv;
	}
	sinon.restore();
});

test.serial("resolveUi5DataDir: returns ~/.ui5 when nothing is configured", async (t) => {
	const {resolveUi5DataDir} = t.context;
	const result = await resolveUi5DataDir();
	t.is(result, path.resolve(os.homedir(), ".ui5"));
	t.true(path.isAbsolute(result), "default path must always be absolute");
});

test.serial("resolveUi5DataDir: default is absolute even when HOME is relative", async (t) => {
	const {resolveUi5DataDir: resolveWithRelativeHome} = await esmock("../../../lib/utils/dataDir.js", {
		"../../../lib/config/Configuration.js": t.context.ConfigurationStub,
		"node:os": {...os, homedir: () => "./relative-home"}
	});
	const result = await resolveWithRelativeHome();
	t.true(path.isAbsolute(result), "result must be absolute even when os.homedir() is relative");
	esmock.purge(resolveWithRelativeHome);
});

test.serial("resolveUi5DataDir: returns value from UI5_DATA_DIR env var (absolute)", async (t) => {
	const {resolveUi5DataDir} = t.context;
	process.env.UI5_DATA_DIR = path.resolve("custom", "data", "dir");
	const result = await resolveUi5DataDir();
	t.is(result, path.resolve("custom", "data", "dir"));
	t.is(t.context.ConfigurationStub.fromFile.callCount, 0, "Configuration not read when env var is set");
});

test.serial("resolveUi5DataDir: absolute UI5_DATA_DIR ignores projectRootPath", async (t) => {
	const {resolveUi5DataDir} = t.context;
	process.env.UI5_DATA_DIR = path.resolve("custom", "data", "dir");
	const result = await resolveUi5DataDir({projectRootPath: path.resolve("some", "project")});
	t.is(result, path.resolve("custom", "data", "dir"),
		"absolute path is returned as-is regardless of projectRootPath");
});

test.serial("resolveUi5DataDir: resolves relative UI5_DATA_DIR env var against projectRootPath", async (t) => {
	const {resolveUi5DataDir} = t.context;
	process.env.UI5_DATA_DIR = "relative/data";
	const result = await resolveUi5DataDir({projectRootPath: path.resolve("my", "project")});
	t.is(result, path.join(path.resolve("my", "project"), "relative/data"));
});

test.serial(
	"resolveUi5DataDir: resolves relative UI5_DATA_DIR " +
		"env var against process.cwd() when no projectRootPath",
	async (t) => {
		const {resolveUi5DataDir} = t.context;
		process.env.UI5_DATA_DIR = "relative/data";
		const result = await resolveUi5DataDir();
		t.is(result, path.resolve("relative/data"));
	},
);

test.serial("resolveUi5DataDir: returns value from Configuration (absolute)", async (t) => {
	const {resolveUi5DataDir} = t.context;
	t.context.configGetUi5DataDirStub.returns(path.resolve("config", "data", "dir"));
	const result = await resolveUi5DataDir();
	t.is(result, path.resolve("config", "data", "dir"));
});

test.serial("resolveUi5DataDir: absolute Configuration value ignores projectRootPath", async (t) => {
	const {resolveUi5DataDir} = t.context;
	t.context.configGetUi5DataDirStub.returns(path.resolve("config", "data", "dir"));
	const result = await resolveUi5DataDir({projectRootPath: path.resolve("some", "project")});
	t.is(result, path.resolve("config", "data", "dir"),
		"absolute path is returned as-is regardless of projectRootPath");
});

test.serial("resolveUi5DataDir: resolves relative Configuration value against projectRootPath", async (t) => {
	const {resolveUi5DataDir} = t.context;
	t.context.configGetUi5DataDirStub.returns("my-data");
	const result = await resolveUi5DataDir({projectRootPath: path.resolve("my", "project")});
	t.is(result, path.join(path.resolve("my", "project"), "my-data"));
});

test.serial(
	"resolveUi5DataDir: resolves relative Configuration value against" +
		" process.cwd() when no projectRootPath",
	async (t) => {
		const {resolveUi5DataDir} = t.context;
		t.context.configGetUi5DataDirStub.returns("my-data");
		const result = await resolveUi5DataDir();
		t.is(result, path.resolve("my-data"));
	},
);

test.serial("resolveUi5DataDir: env var takes precedence over Configuration", async (t) => {
	const {resolveUi5DataDir} = t.context;
	process.env.UI5_DATA_DIR = path.resolve("custom", "data", "dir");
	t.context.configGetUi5DataDirStub.returns(path.resolve("config", "data", "dir"));
	const result = await resolveUi5DataDir();
	t.is(result, path.resolve("custom", "data", "dir"));
});

test.serial("resolveUi5DataDir: uses process.cwd() when projectRootPath is not provided", async (t) => {
	const {resolveUi5DataDir} = t.context;
	t.context.configGetUi5DataDirStub.returns("relative/data");
	const result = await resolveUi5DataDir();
	t.is(result, path.resolve(process.cwd(), "relative/data"));
});

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

	const {getDefaultUi5DataDir} = await esmock("../../../lib/utils/dataDir.js", {
		"../../../lib/config/Configuration.js": t.context.ConfigurationStub
	});
	t.context.getDefaultUi5DataDir = getDefaultUi5DataDir;
});

test.afterEach.always((t) => {
	if (typeof t.context.originalUi5DataDirEnv === "undefined") {
		delete process.env.UI5_DATA_DIR;
	} else {
		process.env.UI5_DATA_DIR = t.context.originalUi5DataDirEnv;
	}
	sinon.restore();
});

test.serial("getDefaultUi5DataDir: returns ~/.ui5 when nothing is configured", async (t) => {
	const {getDefaultUi5DataDir} = t.context;
	const result = await getDefaultUi5DataDir({cwd: "/some/project"});
	t.is(result, path.join(os.homedir(), ".ui5"));
});

test.serial("getDefaultUi5DataDir: returns value from UI5_DATA_DIR env var (absolute)", async (t) => {
	const {getDefaultUi5DataDir} = t.context;
	process.env.UI5_DATA_DIR = "/custom/data/dir";
	const result = await getDefaultUi5DataDir({cwd: "/some/project"});
	t.is(result, "/custom/data/dir");
	t.is(t.context.ConfigurationStub.fromFile.callCount, 0, "Configuration not read when env var is set");
});

test.serial("getDefaultUi5DataDir: resolves relative UI5_DATA_DIR env var against cwd", async (t) => {
	const {getDefaultUi5DataDir} = t.context;
	process.env.UI5_DATA_DIR = "relative/data";
	const result = await getDefaultUi5DataDir({cwd: "/some/project"});
	t.is(result, path.resolve("/some/project", "relative/data"));
});

test.serial("getDefaultUi5DataDir: returns value from Configuration (absolute)", async (t) => {
	const {getDefaultUi5DataDir} = t.context;
	t.context.configGetUi5DataDirStub.returns("/config/data/dir");
	const result = await getDefaultUi5DataDir({cwd: "/some/project"});
	t.is(result, "/config/data/dir");
});

test.serial("getDefaultUi5DataDir: resolves relative Configuration value against cwd", async (t) => {
	const {getDefaultUi5DataDir} = t.context;
	t.context.configGetUi5DataDirStub.returns("my-data");
	const result = await getDefaultUi5DataDir({cwd: "/some/project"});
	t.is(result, path.resolve("/some/project", "my-data"));
});

test.serial("getDefaultUi5DataDir: env var takes precedence over Configuration", async (t) => {
	const {getDefaultUi5DataDir} = t.context;
	process.env.UI5_DATA_DIR = "/env/data";
	t.context.configGetUi5DataDirStub.returns("/config/data");
	const result = await getDefaultUi5DataDir({cwd: "/some/project"});
	t.is(result, "/env/data");
});

test.serial("getDefaultUi5DataDir: uses process.cwd() when cwd is not provided", async (t) => {
	const {getDefaultUi5DataDir} = t.context;
	t.context.configGetUi5DataDirStub.returns("relative/data");
	const result = await getDefaultUi5DataDir();
	t.is(result, path.resolve(process.cwd(), "relative/data"));
});

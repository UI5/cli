import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import path from "node:path";
import os from "node:os";

test.beforeEach(async (t) => {
	// Tests either rely on not having UI5_DATA_DIR defined, or explicitly define it
	t.context.originalUi5DataDirEnv = process.env.UI5_DATA_DIR;
	delete process.env.UI5_DATA_DIR;

	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.ConfigurationGetUi5DataDirStub = sinon.stub().returns(undefined);
	t.context.ConfigurationStub = {
		fromFile: sinon.stub().resolves({
			getUi5DataDir: t.context.ConfigurationGetUi5DataDirStub
		})
	};

	t.context.dataDir = await esmock.p("../../lib/dataDir.js", {
		"@ui5/project/config/Configuration": t.context.ConfigurationStub
	});
});

test.afterEach.always((t) => {
	if (typeof t.context.originalUi5DataDirEnv === "undefined") {
		delete process.env.UI5_DATA_DIR;
	} else {
		process.env.UI5_DATA_DIR = t.context.originalUi5DataDirEnv;
	}
	t.context.sinon.restore();
	esmock.purge(t.context.dataDir);
});

test.serial("getUi5DataDir: no value defined", async (t) => {
	const {ConfigurationGetUi5DataDirStub, dataDir} = t.context;

	const result = await dataDir.getUi5DataDir({
		cwd: path.resolve("foo")
	});

	t.is(result, undefined);

	t.is(ConfigurationGetUi5DataDirStub.callCount, 1);
});

test.serial("getUi5DataDir: from environment variable", async (t) => {
	const {ConfigurationGetUi5DataDirStub, dataDir} = t.context;

	// Environment variable must be preferred over configuration value
	ConfigurationGetUi5DataDirStub.returns(".ui5-data-dir-from-configuration");
	process.env.UI5_DATA_DIR = ".ui5-data-dir-from-env-variable";

	const result = await dataDir.getUi5DataDir({
		cwd: path.resolve("foo")
	});

	t.is(result, path.join(path.resolve("foo"), ".ui5-data-dir-from-env-variable"));

	t.is(ConfigurationGetUi5DataDirStub.callCount, 0);
});

test.serial("getUi5DataDir: from Configuration", async (t) => {
	const {ConfigurationGetUi5DataDirStub, dataDir} = t.context;

	ConfigurationGetUi5DataDirStub.returns(".ui5-data-dir-from-configuration");

	const result = await dataDir.getUi5DataDir({
		cwd: path.resolve("foo")
	});

	t.is(result, path.join(path.resolve("foo"), ".ui5-data-dir-from-configuration"));

	t.is(ConfigurationGetUi5DataDirStub.callCount, 1);
});

test.serial("getUi5DataDirOrDefault: returns resolved value when configured", async (t) => {
	const {ConfigurationGetUi5DataDirStub, dataDir} = t.context;

	ConfigurationGetUi5DataDirStub.returns(".ui5-data-dir-from-configuration");

	const result = await dataDir.getUi5DataDirOrDefault({
		cwd: path.resolve("foo")
	});

	t.is(result, path.join(path.resolve("foo"), ".ui5-data-dir-from-configuration"));
});

test.serial("getUi5DataDirOrDefault: falls back to ~/.ui5 when no value defined", async (t) => {
	const {dataDir} = t.context;

	const result = await dataDir.getUi5DataDirOrDefault({
		cwd: path.resolve("foo")
	});

	t.is(result, path.join(os.homedir(), ".ui5"));
});

test.serial("formatPath: replaces home directory with ~", (t) => {
	const {dataDir} = t.context;

	const input = path.join(os.homedir(), ".ui5", "server", "server.key");
	const expected = "~" + path.sep + path.join(".ui5", "server", "server.key");

	t.is(dataDir.formatPath(input), expected);
});

test.serial("formatPath: returns ~ for the home directory itself", (t) => {
	const {dataDir} = t.context;

	t.is(dataDir.formatPath(os.homedir()), "~");
});

test.serial("formatPath: leaves paths outside the home directory unchanged", (t) => {
	const {dataDir} = t.context;

	const input = path.join(path.resolve(path.sep), "custom", "data-dir");

	t.is(dataDir.formatPath(input), input);
});

test.serial("formatPath: does not shorten a sibling directory sharing the home prefix", (t) => {
	const {dataDir} = t.context;

	// A path like "<home>-backup" must not be treated as residing within the home directory.
	const input = os.homedir() + "-backup";

	t.is(dataDir.formatPath(input), input);
});

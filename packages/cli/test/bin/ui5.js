const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const path = require("path");

test.beforeEach((t) => {
	t.context.originalArgv = process.argv;
});

test.afterEach.always((t) => {
	process.argv = t.context.originalArgv;
	sinon.restore();
	mock.stopAll();
});

test.serial.cb("ui5 fails when using unsupported Node.js version", (t) => {
	mock("../../package.json", {
		name: "ui5-cli-engines-test",
		version: "0.0.0",
		engines: {
			node: "^999"
		}
	});

	const consoleLogStub = sinon.stub(console, "log");

	const processExitStub = sinon.stub(process, "exit");
	processExitStub.callsFake((errorCode) => {
		processExitStub.restore();

		t.is(errorCode, 1, "Should exit with error code 1");
		t.is(consoleLogStub.callCount, 6, "console.log should be called 6 times");

		t.deepEqual(consoleLogStub.getCall(0).args,
			["==================== UNSUPPORTED NODE.JS VERSION ===================="]);
		t.deepEqual(consoleLogStub.getCall(1).args,
			["You are using an unsupported version of Node.js"]);
		t.deepEqual(consoleLogStub.getCall(2).args,
			[`Detected version ${process.version} but ui5-cli-engines-test requires ^999`]);
		t.deepEqual(consoleLogStub.getCall(3).args,
			[""]);
		t.deepEqual(consoleLogStub.getCall(4).args,
			["=> Please upgrade to a supported version of Node.js to use this tool"]);
		t.deepEqual(consoleLogStub.getCall(5).args,
			["====================================================================="]);

		t.end();
	});

	mock.reRequire("../../bin/ui5");
});

test.serial.cb("ui5 imports local installation when found", (t) => {
	const consoleLogStub = sinon.stub(console, "log");
	const consoleInfoStub = sinon.stub(console, "info");

	const importLocalStub = sinon.stub().returns(true);
	mock("import-local", importLocalStub);

	mock.reRequire("../../bin/ui5");

	setTimeout(() => {
		t.is(consoleLogStub.callCount, 0, "console.log should not be called");
		t.is(consoleInfoStub.callCount, 2, "console.log should be called 2 times");

		t.deepEqual(consoleInfoStub.getCall(0).args, ["INFO: Using local @ui5/cli installation"]);
		t.deepEqual(consoleInfoStub.getCall(1).args, [""]);

		t.is(importLocalStub.callCount, 1, "import-local should be called once");
		t.deepEqual(importLocalStub.getCall(0).args, [
			path.resolve(__dirname, "..", "..", "bin", "ui5.js")
		], "import-local should be called with bin/ui5.js filename");

		t.end();
	}, 0);
});

test.serial.cb("ui5 imports local installation when found (/w --verbose)", (t) => {
	const consoleLogStub = sinon.stub(console, "log");
	const consoleInfoStub = sinon.stub(console, "info");

	const importLocalStub = sinon.stub().returns(true);
	mock("import-local", importLocalStub);

	process.argv = [...process.argv, "--verbose"];
	mock.reRequire("../../bin/ui5");

	setTimeout(() => {
		t.is(consoleLogStub.callCount, 0, "console.log should not be called");
		t.is(consoleInfoStub.callCount, 3, "console.log should be called 3 times");

		t.deepEqual(consoleInfoStub.getCall(0).args, [
			"INFO: This project contains an individual @ui5/cli installation which will be used over the global one."]);
		t.deepEqual(consoleInfoStub.getCall(1).args, [
			"See https://github.com/SAP/ui5-cli#local-vs-global-installation for details."]);
		t.deepEqual(consoleInfoStub.getCall(2).args, [""]);

		t.is(importLocalStub.callCount, 1, "import-local should be called once");
		t.deepEqual(importLocalStub.getCall(0).args, [
			path.resolve(__dirname, "..", "..", "bin", "ui5.js")
		], "import-local should be called with bin/ui5.js filename");

		t.end();
	}, 0);
});

test.serial.cb("ui5 logs warning when using pre-release Node.js version", (t) => {
	const consoleLogStub = sinon.stub(console, "log");

	const importLocalStub = sinon.stub().returns(true);
	mock("import-local", importLocalStub);

	sinon.stub(process, "version").value("v17.0.0-v8-canary202108258414d1aed8");

	mock.reRequire("../../bin/ui5");

	setTimeout(() => {
		t.is(consoleLogStub.callCount, 9, "console.log should be called 8 times");

		t.is(consoleLogStub.getCall(0).args[0],
			"====================== UNSTABLE NODE.JS VERSION =====================");
		t.is(consoleLogStub.getCall(1).args[0],
			"You are using an unstable version of Node.js");
		t.is(consoleLogStub.getCall(2).args[0],
			"Detected Node.js version v17.0.0-v8-canary202108258414d1aed8");
		t.is(consoleLogStub.getCall(3).args[0],
			"");
		t.is(consoleLogStub.getCall(4).args[0],
			"=> Please note that an unstable version might cause unexpected");
		t.is(consoleLogStub.getCall(5).args[0],
			"   behavior. For productive use please consider using a stable");
		t.is(consoleLogStub.getCall(6).args[0],
			"   version of Node.js! For the release policy of Node.js, see");
		t.is(consoleLogStub.getCall(7).args[0],
			"   https://nodejs.org/en/about/releases");
		t.is(consoleLogStub.getCall(8).args[0],
			"=====================================================================");

		t.is(importLocalStub.callCount, 1, "import-local should be called once");
		t.deepEqual(importLocalStub.getCall(0).args, [
			path.resolve(__dirname, "..", "..", "bin", "ui5.js")
		], "import-local should be called with bin/ui5.js filename");

		t.end();
	}, 0);
});

import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.beforeEach((t) => {
	t.context.consoleLogStub = sinon.stub(console, "log");
	t.context.consoleInfoStub = sinon.stub(console, "info");
	t.context.originalArgv = process.argv;
});

test.afterEach.always((t) => {
	process.argv = t.context.originalArgv;
	sinon.restore();
	if (t.context.ui5) {
		esmock.purge(t.context.ui5);
	}
});

test.serial("ui5 fails when using unsupported Node.js version", async (t) => {
	const {consoleLogStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	await esmock("../../bin/ui5", {
		fs: {
			readFileSync: sinon.stub().returns(JSON.stringify({
				name: "ui5-cli-engines-test",
				version: "0.0.0",
				engines: {
					node: "^999"
				}
			}))
		}
	});
	const errorCode = await processExit;

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
});

test.serial("ui5 imports local installation when found", async (t) => {
	const {consoleLogStub, consoleInfoStub} = t.context;

	const importLocalStub = sinon.stub();

	const setTimeoutPromise = new Promise((resolve) => {
		importLocalStub.callsFake(() => {
			// Use this call to know when to execute assertions
			setTimeout(resolve, 0);
			return true;
		});
	});

	// esmock.p is needed as import-local is loaded via dynamic import
	t.context.ui5 = await esmock.p("../../bin/ui5.js", {
		"import-local": {default: importLocalStub}
	});

	await setTimeoutPromise;

	t.is(consoleLogStub.callCount, 0, "console.log should not be called");
	t.is(consoleInfoStub.callCount, 2, "console.info should be called 2 times");

	t.deepEqual(consoleInfoStub.getCall(0).args, ["INFO: Using local @ui5/cli installation"]);
	t.deepEqual(consoleInfoStub.getCall(1).args, [""]);

	t.is(importLocalStub.callCount, 1, "import-local should be called once");
	t.is(importLocalStub.getCall(0).args.length, 1);
	const importLocalUrl = new URL(importLocalStub.getCall(0).args[0]);
	t.is(importLocalUrl.pathname, new URL("../../bin/ui5.js", import.meta.url).pathname,
		"import-local should be called with bin/ui5.js filename");
});

test.serial("ui5 imports local installation when found (/w --verbose)", async (t) => {
	const {consoleLogStub, consoleInfoStub} = t.context;
	const importLocalStub = sinon.stub();

	process.argv = [...process.argv, "--verbose"];

	const setTimeoutPromise = new Promise((resolve) => {
		importLocalStub.callsFake(() => {
			// Use this call to know when to execute assertions
			setTimeout(resolve, 0);
			return true;
		});
	});

	// esmock.p is needed as import-local is loaded via dynamic import
	t.context.ui5 = await esmock.p("../../bin/ui5.js", {
		"import-local": {default: importLocalStub}
	});

	await setTimeoutPromise;

	t.is(consoleLogStub.callCount, 0, "console.log should not be called");
	t.is(consoleInfoStub.callCount, 3, "console.info should be called 3 times");

	t.deepEqual(consoleInfoStub.getCall(0).args, [
		"INFO: This project contains an individual @ui5/cli installation which will be used " +
			"over the global one."]);
	t.deepEqual(consoleInfoStub.getCall(1).args, [
		"See https://github.com/SAP/ui5-cli#local-vs-global-installation for details."]);
	t.deepEqual(consoleInfoStub.getCall(2).args, [""]);

	t.is(importLocalStub.callCount, 1, "import-local should be called once");
	t.is(importLocalStub.getCall(0).args.length, 1);
	const importLocalUrl = new URL(importLocalStub.getCall(0).args[0]);
	t.is(importLocalUrl.pathname, new URL("../../bin/ui5.js", import.meta.url).pathname,
		"import-local should be called with bin/ui5.js filename");
});

test.serial("ui5 logs warning when using pre-release Node.js version", async (t) => {
	const {consoleLogStub} = t.context;

	const importLocalStub = sinon.stub();

	sinon.stub(process, "version").value("v17.0.0-v8-canary202108258414d1aed8");

	const setTimeoutPromise = new Promise((resolve) => {
		importLocalStub.callsFake(() => {
			// Use this call to know when to execute assertions
			setTimeout(resolve, 0);
			return true;
		});
	});

	// esmock.p is needed as import-local is loaded via dynamic import
	t.context.ui5 = await esmock.p("../../bin/ui5.js", {
		"import-local": {default: importLocalStub}
	});

	await setTimeoutPromise;

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
	t.is(importLocalStub.getCall(0).args.length, 1);
	const importLocalUrl = new URL(importLocalStub.getCall(0).args[0]);
	t.is(importLocalUrl.pathname, new URL("../../bin/ui5.js", import.meta.url).pathname,
		"import-local should be called with bin/ui5.js filename");
});

test.serial("ui5 executes lib/cli/cli.js", async (t) => {
	const cliStub = sinon.stub();

	const cliExecutedPromise = new Promise((resolve) => {
		cliStub.callsFake(async () => {
			resolve();
		});
	});

	const fakePkg = {
		name: "ui5-cli-test",
		version: "0.0.0",
		engines: {
			node: ">= 16"
		}
	};

	t.context.ui5 = await esmock.p("../../bin/ui5.js", {
		"import-local": sinon.stub().returns(false),
		"fs": {
			readFileSync: sinon.stub().returns(JSON.stringify(fakePkg))
		},
		"../../lib/cli/cli.js": cliStub
	});

	await cliExecutedPromise;

	t.is(cliStub.callCount, 1, "cli should be called once");
	t.deepEqual(cliStub.getCall(0).args, [fakePkg], "cliStub should be called with package.json object");
});

test.serial("ui5 handles lib/cli/cli.js exceptions", async (t) => {
	const {consoleLogStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	const fakeError = new Error("Test CLI Error!");
	const cliStub = sinon.stub().callsFake(async () => {
		throw fakeError;
	});

	const fakePkg = {
		name: "ui5-cli-test",
		version: "0.0.0",
		engines: {
			node: ">= 16"
		}
	};

	t.context.ui5 = await esmock.p("../../bin/ui5.js", {
		"import-local": sinon.stub().returns(false),
		"fs": {
			readFileSync: sinon.stub().returns(JSON.stringify(fakePkg))
		},
		"../../lib/cli/cli.js": cliStub
	});

	const errorCode = await processExit;

	t.is(errorCode, 1, "Should exit with error code 1");
	t.is(consoleLogStub.callCount, 2, "console.log should be called 2 times");

	t.deepEqual(consoleLogStub.getCall(0).args,
		["Fatal Error: Unable to initialize UI5 CLI"]);
	t.deepEqual(consoleLogStub.getCall(1).args, [fakeError]);
});

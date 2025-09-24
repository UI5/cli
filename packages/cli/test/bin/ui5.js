import test from "ava";
import sinonGlobal from "sinon";
import {fileURLToPath} from "node:url";
import {createRequire, Module} from "node:module";
import chalk from "chalk";
import * as td from "testdouble";

const require = createRequire(import.meta.url);

// Node's module loading has changed since 20.6.xx. As 'esmock' is unable to properly
// mock dynamic imports within CommonJS modules, we need to use another alternative for this test.
// 'testdouble' seems to work pretty well for that case, but for NodeJS versions below 20.6.xx it needs
// a `--loader` flag and we already use that for 'esmock'.
// The solution would be to use the old mocking for older NodeJs versions and
// 'testdouble' for the ones after 20.6.xx (no flag required here).
const [nodeMajorVer, NodeMinorVer] = process.versions.node.split(".").map(Number);
const useTestdoubleMock = nodeMajorVer > 20 || (nodeMajorVer === 20 && NodeMinorVer >= 6);

const globalSinonSandbox = sinonGlobal.createSandbox();
const importLocalStub = globalSinonSandbox.stub();

test.before(() => {
	if (useTestdoubleMock === false) { // Legacy (manual) mocking
		// Mock dependencies
		// NOTE: esmock is not able to properly mock dynamic imports within a CJS script.
		// Also it seems that the stub is cached somewhere else, so beforeEach/afterEach
		// can't be used to renew it. But #reset takes care of resetting the stub between tests

		const importLocalModule = new Module("import-local");
		importLocalModule.exports = importLocalStub;
		require.cache[require.resolve("import-local")] = importLocalModule;
	}
});

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.processStdoutWriteStub = sinon.stub(process.stdout, "write");
	t.context.processStderrWriteStub = sinon.stub(process.stderr, "write");
	t.context.originalArgv = process.argv;
	process.env.UI5_CLI_TEST_BIN_RUN_MAIN = "false"; // prevent automatic execution of main function

	if (useTestdoubleMock === true) { // NodeJS versions 20.6 and above
		await td.replaceEsm("import-local", {default: importLocalStub});
	}
});

test.afterEach.always((t) => {
	process.argv = t.context.originalArgv;
	t.context.sinon.restore();
	globalSinonSandbox.reset();
	useTestdoubleMock && td.reset();

	// Allow re-requiring the module
	delete require.cache[require.resolve("../../bin/ui5.cjs")];

	// Clear mocked modules
	delete require.cache[require.resolve("../../package.json")];
	delete require.cache[require.resolve("semver")];

	delete process.env.UI5_CLI_NO_LOCAL;
	delete process.env.UI5_CLI_TEST_BIN_RUN_MAIN;
});

test.serial("checkRequirements: Using supported Node.js version", (t) => {
	const {processStderrWriteStub} = t.context;

	const {checkRequirements} = require("../../bin/ui5.cjs");

	const returnValue = checkRequirements({
		pkg: {
			name: "ui5-cli-engines-test",
			engines: {
				node: ">= 18"
			}
		},
		nodeVersion: "v20.0.0"
	});

	t.true(returnValue);
	t.is(processStderrWriteStub.callCount, 0, "stderr info should not be provided");
});

test.serial("checkRequirements: Using unsupported Node.js version", (t) => {
	const {processStderrWriteStub} = t.context;

	const {checkRequirements} = require("../../bin/ui5.cjs");

	const returnValue = checkRequirements({
		pkg: {
			name: "ui5-cli-engines-test",
			engines: {
				node: "^999"
			}
		},
		nodeVersion: "v10.0.0"
	});

	t.false(returnValue);
	t.is(processStderrWriteStub.callCount, 10, "console.log should be called 6 times");

	t.deepEqual(processStderrWriteStub.getCall(0).args,
		["==================== UNSUPPORTED NODE.JS VERSION ===================="]);
	t.deepEqual(processStderrWriteStub.getCall(2).args,
		["You are using an unsupported version of Node.js"]);
	t.deepEqual(processStderrWriteStub.getCall(4).args,
		[`Detected version v10.0.0 but ui5-cli-engines-test requires ^999`]);
	t.deepEqual(processStderrWriteStub.getCall(5).args, ["\n\n"]);
	t.deepEqual(processStderrWriteStub.getCall(6).args,
		["=> Please upgrade to a supported version of Node.js to use this tool"]);
	t.deepEqual(processStderrWriteStub.getCall(8).args,
		["====================================================================="]);
});

test.serial("checkRequirements: logs warning when using pre-release Node.js version", (t) => {
	const {processStderrWriteStub} = t.context;

	const {checkRequirements} = require("../../bin/ui5.cjs");

	const returnValue = checkRequirements({
		pkg: {
			name: "ui5-cli-engines-test",
			engines: {
				node: "^17"
			}
		},
		nodeVersion: "v17.0.0-v8-canary202108258414d1aed8"
	});

	t.true(returnValue);
	t.is(processStderrWriteStub.callCount, 16, "console.log should be called 16 times");

	t.is(processStderrWriteStub.getCall(0).args[0],
		"====================== UNSTABLE NODE.JS VERSION =====================");
	t.is(processStderrWriteStub.getCall(2).args[0],
		"You are using an unstable version of Node.js");
	t.is(processStderrWriteStub.getCall(4).args[0],
		"Detected Node.js version v17.0.0-v8-canary202108258414d1aed8");
	t.is(processStderrWriteStub.getCall(5).args[0], "\n\n");
	t.is(processStderrWriteStub.getCall(6).args[0],
		"=> Please note that an unstable version might cause unexpected");
	t.is(processStderrWriteStub.getCall(8).args[0],
		"   behavior. For productive use please consider using a stable");
	t.is(processStderrWriteStub.getCall(10).args[0],
		"   version of Node.js! For the release policy of Node.js, see");
	t.is(processStderrWriteStub.getCall(12).args[0],
		"   https://nodejs.org/en/about/releases");
	t.is(processStderrWriteStub.getCall(14).args[0],
		"=====================================================================");
});

test.serial("invokeLocalInstallation: Invokes local installation when found", async (t) => {
	const {processStdoutWriteStub} = t.context;

	importLocalStub.returns({});

	const {invokeLocalInstallation} = require("../../bin/ui5.cjs");

	const returnValue = await invokeLocalInstallation({name: "ui5-cli-test"});

	t.true(returnValue);

	t.is(processStdoutWriteStub.callCount, 2, "Information messages should be provided");

	t.deepEqual(processStdoutWriteStub.getCall(0).args, ["INFO: Using local ui5-cli-test installation"]);
	t.deepEqual(processStdoutWriteStub.getCall(1).args, ["\n\n"]);

	t.is(importLocalStub.callCount, 1, "import-local should be called once");
	t.is(importLocalStub.getCall(0).args.length, 1);
	const importLocaPath = importLocalStub.getCall(0).args[0];
	t.is(importLocaPath, fileURLToPath(new URL("../../bin/ui5.cjs", import.meta.url)),
		"import-local should be called with bin/ui5.cjs filename");
});

test.serial("invokeLocalInstallation: Invokes local installation when found (/w --verbose)", async (t) => {
	const {processStderrWriteStub} = t.context;

	importLocalStub.returns({});

	// Enable verbose logging
	process.argv = [...process.argv, "--verbose"];

	const {invokeLocalInstallation} = require("../../bin/ui5.cjs");

	const returnValue = await invokeLocalInstallation({name: "ui5-cli-test"});

	t.true(returnValue);

	t.is(processStderrWriteStub.callCount, 4, "console.info should be called 3 times");

	t.deepEqual(processStderrWriteStub.getCall(0).args, [
		"INFO: This project contains an individual ui5-cli-test installation which " +
		"will be used over the global one."]);
	t.deepEqual(processStderrWriteStub.getCall(2).args, [
		"See https://github.com/SAP/ui5-cli#local-vs-global-installation for details."
	]);
	t.deepEqual(processStderrWriteStub.getCall(3).args, ["\n\n"]);

	t.is(importLocalStub.callCount, 1, "import-local should be called once");
	t.is(importLocalStub.getCall(0).args.length, 1);
	const importLocaPath = importLocalStub.getCall(0).args[0];
	t.is(importLocaPath, fileURLToPath(new URL("../../bin/ui5.cjs", import.meta.url)),
		"import-local should be called with bin/ui5.cjs filename");
});

test.serial("invokeLocalInstallation: Doesn't invoke local installation when UI5_CLI_NO_LOCAL is set", async (t) => {
	const {processStderrWriteStub} = t.context;

	process.env.UI5_CLI_NO_LOCAL = "true";

	const {invokeLocalInstallation} = require("../../bin/ui5.cjs");

	const returnValue = await invokeLocalInstallation({name: "ui5-cli-test"});

	t.false(returnValue);

	t.is(processStderrWriteStub.callCount, 0, "Information messages should be provided");

	t.is(importLocalStub.callCount, 0, "import-local should not be called");
});

test.serial("invokeLocalInstallation: Doesn't invoke local installation when it is not found", async (t) => {
	const {processStderrWriteStub} = t.context;

	importLocalStub.returns(undefined);

	const {invokeLocalInstallation} = require("../../bin/ui5.cjs");

	const returnValue = await invokeLocalInstallation({name: "ui5-cli-test"});

	t.false(returnValue);

	t.is(processStderrWriteStub.callCount, 0, "stderr info should not be provided");

	t.is(importLocalStub.callCount, 2, "import-local should be called twice (ui5.cjs and ui5.js)");
	t.deepEqual(importLocalStub.getCall(0).args, [fileURLToPath(new URL("../../bin/ui5.cjs", import.meta.url))],
		"import-local should be called with bin/ui5.cjs filename");
	t.deepEqual(importLocalStub.getCall(1).args, [fileURLToPath(new URL("../../bin/ui5.js", import.meta.url))],
		"import-local should be called with bin/ui5.js filename");
});

test.serial("main (unsupported Node.js version)", async (t) => {
	const {sinon, processStderrWriteStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	const ui5 = require("../../bin/ui5.cjs");
	const {main} = ui5;

	sinon.stub(ui5, "checkRequirements").returns(false);
	sinon.stub(ui5, "invokeLocalInstallation");
	sinon.stub(ui5, "invokeCLI");

	await main();

	const errorCode = await processExit;
	t.is(errorCode, 1);

	t.is(processStderrWriteStub.callCount, 0);

	t.is(ui5.checkRequirements.callCount, 1);
	t.is(ui5.invokeLocalInstallation.callCount, 0);
	t.is(ui5.invokeCLI.callCount, 0);
});

test.serial("main (invocation of local installation)", async (t) => {
	const {sinon, processStderrWriteStub} = t.context;

	const processExitStub = sinon.stub(process, "exit");

	const ui5 = require("../../bin/ui5.cjs");
	const {main} = ui5;

	sinon.stub(ui5, "invokeLocalInstallation").resolves(true);
	sinon.stub(ui5, "invokeCLI");

	await main();

	t.is(processExitStub.callCount, 0);
	t.is(processStderrWriteStub.callCount, 0);

	t.is(ui5.invokeLocalInstallation.callCount, 1);
	t.is(ui5.invokeCLI.callCount, 0);
});

test.serial("integration: main / invokeCLI", async (t) => {
	// It seems to be impossible to mock/stub dynamic imports of ES modules
	// The require.cache is not taken into account and esmock doesn't work (as of v2.0.7)

	// Therefore this test is an integration test that really invokes the CLI / yargs to
	// fail with an unknown command error

	const {sinon, processStderrWriteStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	process.argv = [...process.argv, "foo", "--no-update-notifier"];

	const {main} = require("../../bin/ui5.cjs");

	await main();

	const errorCode = await processExit;
	t.is(errorCode, 1);

	t.is(processStderrWriteStub.callCount, 6);

	t.deepEqual(processStderrWriteStub.getCall(0).args, [chalk.bold.yellow("Command Failed:")], "Correct error log");
	t.deepEqual(processStderrWriteStub.getCall(2).args, ["Unknown argument: foo"], "Correct error log");
});

test.serial("integration: Executing main when required as main module", async (t) => {
	const {sinon, processStderrWriteStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	process.env.UI5_CLI_TEST_BIN_RUN_MAIN = "true";

	process.argv = [...process.argv, "foo", "--no-update-notifier"];

	require("../../bin/ui5.cjs");

	const errorCode = await processExit;
	t.is(errorCode, 1);

	t.is(processStderrWriteStub.callCount, 6);

	t.deepEqual(processStderrWriteStub.getCall(0).args, [chalk.bold.yellow("Command Failed:")], "Correct error log");
	t.deepEqual(processStderrWriteStub.getCall(2).args, ["Unknown argument: foo"], "Correct error log");
});

test.serial("integration: Executing main when required as main module (catch initialize error)", async (t) => {
	const {sinon, processStderrWriteStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	process.env.UI5_CLI_TEST_BIN_RUN_MAIN = "true";

	process.argv = [...process.argv, "foo"];

	const ui5 = require("../../bin/ui5.cjs");
	// Immediately overwrite invokeCLI function before it is called
	ui5.invokeCLI = async () => {
		throw new Error("TEST: Unable to invoke CLI");
	};

	const errorCode = await processExit;
	t.is(errorCode, 1);

	t.is(processStderrWriteStub.callCount, 3);

	t.deepEqual(processStderrWriteStub.getCall(0).args, ["Fatal Error: Unable to initialize UI5 CLI"]);
	t.is(processStderrWriteStub.getCall(2).args.length, 1);
	t.true(processStderrWriteStub.getCall(2).args[0] instanceof Error);
	t.is(processStderrWriteStub.getCall(2).args[0].message, "TEST: Unable to invoke CLI");
});

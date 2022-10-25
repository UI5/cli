import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

async function assertUseHandler(t, {argv, expectedFrameworkOptions}) {
	const {useCommand, frameworkUseStub} = t.context;

	frameworkUseStub.resolves({
		usedFramework: undefined, // not required for this test
		usedVersion: undefined, // not required for this test
		yamlUpdated: true
	});

	await useCommand.handler(argv);

	t.is(frameworkUseStub.callCount, 1, "Use function should be called once");
	t.deepEqual(frameworkUseStub.getCall(0).args, [
		{
			frameworkOptions: expectedFrameworkOptions,
			projectGraphOptions: {
				dependencyDefinition: undefined,
				config: undefined
			}
		}],
	"Use function should be called with expected args");
}

async function assertFailingUseHandler(t, {argv, expectedMessage}) {
	const {useCommand, frameworkUseStub} = t.context;

	frameworkUseStub.resolves({
		usedFramework: undefined, // not required for this test
		usedVersion: undefined // not required for this test
	});

	const exception = await t.throwsAsync(useCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Use handler should throw expected error");
	t.is(frameworkUseStub.callCount, 0, "Use function should not be called");
}

async function assertFailingYamlUpdateUseHandler(t, {argv, expectedMessage}) {
	const {useCommand, frameworkUseStub} = t.context;

	frameworkUseStub.resolves({
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: false
	});

	const exception = await t.throwsAsync(useCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Use handler should throw expected error");
	t.is(frameworkUseStub.callCount, 1, "Use function should be called once");
}

test.beforeEach(async (t) => {
	t.context.consoleLogStub = sinon.stub(console, "log");

	t.context.frameworkUseStub = sinon.stub();

	t.context.useCommand = await esmock.p("../../../../lib/cli/commands/use.js", {
		"../../../../lib/framework/use": t.context.frameworkUseStub
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.useCommand);
});

test.serial("Accepts framework name and version (SAPUI5@1.76.0)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "SAPUI5@1.76.0"},
		expectedFrameworkOptions: {
			name: "SAPUI5",
			version: "1.76.0"
		}
	});
});

test.serial("Accepts framework name and version (OpenUI5@1.76.0)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "OpenUI5@1.76.0"},
		expectedFrameworkOptions: {
			name: "OpenUI5",
			version: "1.76.0"
		}
	});
});

test.serial("Accepts framework name and version (SAPUI5@1.76)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "SAPUI5@1.76"},
		expectedFrameworkOptions: {
			name: "SAPUI5",
			version: "1.76"
		}
	});
});

test.serial("Accepts framework name and version (OpenUI5@1.76)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "OpenUI5@1.76"},
		expectedFrameworkOptions: {
			name: "OpenUI5",
			version: "1.76"
		}
	});
});

test.serial("Accepts framework name and version (SAPUI5@1.79.0-SNAPSHOT)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "SAPUI5@1.79.0-SNAPSHOT"},
		expectedFrameworkOptions: {
			name: "SAPUI5",
			version: "1.79.0-SNAPSHOT"
		}
	});
});

test.serial("Accepts framework name and version (OpenUI5@1.79.0-SNAPSHOT)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "OpenUI5@1.79.0-SNAPSHOT"},
		expectedFrameworkOptions: {
			name: "OpenUI5",
			version: "1.79.0-SNAPSHOT"
		}
	});
});

test.serial("Accepts framework name and version (SAPUI5@latest)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "SAPUI5@latest"},
		expectedFrameworkOptions: {
			name: "SAPUI5",
			version: "latest"
		}
	});
});

test.serial("Accepts framework name and version (OpenUI5@latest)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "OpenUI5@latest"},
		expectedFrameworkOptions: {
			name: "OpenUI5",
			version: "latest"
		}
	});
});

test.serial("Accepts framework name and uses latest (SAPUI5)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "SAPUI5"},
		expectedFrameworkOptions: {
			name: "SAPUI5",
			version: "latest"
		}
	});
});

test.serial("Accepts framework name and uses latest (sapui5)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "sapui5"},
		expectedFrameworkOptions: {
			name: "sapui5",
			version: "latest"
		}
	});
});

test.serial("Accepts framework name and uses latest (OpenUI5)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "OpenUI5"},
		expectedFrameworkOptions: {
			name: "OpenUI5",
			version: "latest"
		}
	});
});

test.serial("Accepts framework version (1.76.0)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "1.76.0"},
		expectedFrameworkOptions: {
			name: null,
			version: "1.76.0"
		}
	});
});

test.serial("Accepts framework version (1.76)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "1.76"},
		expectedFrameworkOptions: {
			name: null,
			version: "1.76"
		}
	});
});

test.serial("Accepts framework version (latest)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "latest"},
		expectedFrameworkOptions: {
			name: null,
			version: "latest"
		}
	});
});

test.serial("Rejects on empty framework-info", async (t) => {
	await assertFailingUseHandler(t, {
		argv: {"framework-info": ""},
		expectedMessage: "Invalid framework info: "
	});
});

test.serial("Rejects on invalid framework-info (@1.2.3)", async (t) => {
	await assertFailingUseHandler(t, {
		argv: {"framework-info": "@1.2.3"},
		expectedMessage: "Invalid framework info: @1.2.3"
	});
});

test.serial("Rejects on invalid framework-info (SAPUI5@)", async (t) => {
	await assertFailingUseHandler(t, {
		argv: {"framework-info": "SAPUI5@"},
		expectedMessage: "Invalid framework info: SAPUI5@"
	});
});

test.serial("Rejects on invalid framework-info (@SAPUI5@)", async (t) => {
	await assertFailingUseHandler(t, {
		argv: {"framework-info": "@SAPUI5@"},
		expectedMessage: "Invalid framework info: @SAPUI5@"
	});
});

test.serial("Rejects on invalid framework-info (SAPUI5@1.2.3@4.5.6)", async (t) => {
	await assertFailingUseHandler(t, {
		argv: {"framework-info": "SAPUI5@1.2.3@4.5.6"},
		expectedMessage: "Invalid framework info: SAPUI5@1.2.3@4.5.6"
	});
});

test.serial("Rejects when YAML could not be updated", async (t) => {
	await assertFailingYamlUpdateUseHandler(t, {
		argv: {"framework-info": "SAPUI5@1.76.0"},
		expectedMessage: "Internal error while updating ui5.yaml to SAPUI5 version 1.76.0"
	});
});

test.serial("Rejects when YAML could not be updated (with config path)", async (t) => {
	await assertFailingYamlUpdateUseHandler(t, {
		argv: {"framework-info": "SAPUI5@1.76.0", "config": "/path/to/ui5.yaml"},
		expectedMessage: "Internal error while updating config at /path/to/ui5.yaml to SAPUI5 version 1.76.0"
	});
});

test.serial("Logs framework name, version and default config path when updating config", async (t) => {
	const {useCommand, frameworkUseStub} = t.context;

	frameworkUseStub.resolves({
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	});

	await useCommand.handler({"framework-info": "SAPUI5@1.76.0"});

	const expectedConsoleLog = [
		"Updated configuration written to ui5.yaml",
		"This project is now using SAPUI5 version 1.76.0"
	];

	t.is(t.context.consoleLogStub.callCount, expectedConsoleLog.length,
		"console.log should be called " + expectedConsoleLog.length + " times");
	expectedConsoleLog.forEach((expectedLog, i) => {
		t.deepEqual(t.context.consoleLogStub.getCall(i).args, [expectedLog],
			"console.log should be called with expected string on call index " + i);
	});
});

test.serial("Logs framework name, version and custom config path when updating config", async (t) => {
	const {useCommand, frameworkUseStub} = t.context;

	frameworkUseStub.resolves({
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	});

	await useCommand.handler({"framework-info": "SAPUI5@1.76.0", "config": "/path/to/ui5.yaml"});

	const expectedConsoleLog = [
		"Updated configuration written to /path/to/ui5.yaml",
		"This project is now using SAPUI5 version 1.76.0"
	];

	t.is(t.context.consoleLogStub.callCount, expectedConsoleLog.length,
		"console.log should be called " + expectedConsoleLog.length + " times");
	expectedConsoleLog.forEach((expectedLog, i) => {
		t.deepEqual(t.context.consoleLogStub.getCall(i).args, [expectedLog],
			"console.log should be called with expected string on call index " + i);
	});
});

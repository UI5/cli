import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

async function createMock(t, yamlUpdated = true) {
	t.context.frameworkRemoveStub = sinon.stub().resolves({yamlUpdated});
	t.context.removeCommand = await esmock.p("../../../../lib/cli/commands/remove.js", {
		"../../../../lib/framework/remove.js": t.context.frameworkRemoveStub
	});
}

async function assertRemoveHandler(t, {argv, expectedLibraries, expectedConsoleLog}) {
	await createMock(t);
	await t.context.removeCommand.handler(argv);

	t.is(t.context.frameworkRemoveStub.callCount, 1, "Remove function should be called once");
	t.deepEqual(t.context.frameworkRemoveStub.getCall(0).args, [
		{
			libraries: expectedLibraries,
			projectGraphOptions: {
				dependencyDefinition: undefined,
				config: undefined
			}
		}],
	"Remove function should be called with expected args");

	t.is(t.context.consoleLogStub.callCount, expectedConsoleLog.length,
		"console.log should be called " + expectedConsoleLog.length + " times");
	expectedConsoleLog.forEach((expectedLog, i) => {
		t.deepEqual(t.context.consoleLogStub.getCall(i).args, [expectedLog],
			"console.log should be called with expected string on call index " + i);
	});
}

async function assertFailingRemoveHandler(t, {argv, expectedMessage}) {
	await createMock(t);
	const exception = await t.throwsAsync(t.context.removeCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Remove handler should throw expected error");
	t.is(t.context.frameworkRemoveStub.callCount, 0, "Remove function should not be called");
}

async function assertFailingYamlUpdateRemoveHandler(t, {argv, expectedMessage}) {
	await createMock(t, false);

	const exception = await t.throwsAsync(t.context.removeCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Remove handler should throw expected error");
	t.is(t.context.frameworkRemoveStub.callCount, 1, "Remove function should be called once");
}

test.beforeEach((t) => {
	t.context.consoleLogStub = sinon.stub(console, "log");
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.removeCommand);
});

test.serial("Accepts single library", async (t) => {
	await assertRemoveHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1"]},
		expectedLibraries: [{name: "sap.ui.lib1"}],
		expectedConsoleLog: [
			"Updated configuration written to ui5.yaml",
			"Removed framework library sap.ui.lib1 as dependency"
		]
	});
});

test.serial("Accepts multiple libraries", async (t) => {
	await assertRemoveHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1", "sap.ui.lib2"]},
		expectedLibraries: [{name: "sap.ui.lib1"}, {name: "sap.ui.lib2"}],
		expectedConsoleLog: [
			"Updated configuration written to ui5.yaml",
			"Removed framework libraries sap.ui.lib1 sap.ui.lib2 as dependencies"
		]
	});
});

test.serial("Accepts multiple libraries duplicates", async (t) => {
	await assertRemoveHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1", "sap.ui.lib1", "sap.ui.lib2"]},
		expectedLibraries: [{name: "sap.ui.lib1"}, {name: "sap.ui.lib2"}],
		expectedConsoleLog: [
			"Updated configuration written to ui5.yaml",
			"Removed framework libraries sap.ui.lib1 sap.ui.lib2 as dependencies"
		]
	});
});

test.serial("Rejects on empty framework-libraries", async (t) => {
	await assertFailingRemoveHandler(t, {
		argv: {"framework-libraries": ""},
		expectedMessage: "Missing mandatory parameter framework-libraries"
	});
});

test.serial("Rejects when YAML could not be updated (single library)", async (t) => {
	await assertFailingYamlUpdateRemoveHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1"]},
		expectedMessage: "Internal error while removing framework library sap.ui.lib1 to ui5.yaml"
	});
});

test.serial("Rejects when YAML could not be updated (multiple libraries)", async (t) => {
	await assertFailingYamlUpdateRemoveHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1", "sap.ui.lib2"]},
		expectedMessage: "Internal error while removing framework libraries sap.ui.lib1 sap.ui.lib2 to ui5.yaml"
	});
});

test.serial("Rejects when YAML could not be updated (single library; with config path)", async (t) => {
	await assertFailingYamlUpdateRemoveHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1"], "config": "/path/to/ui5.yaml"},
		expectedMessage: "Internal error while removing framework library sap.ui.lib1 to config at /path/to/ui5.yaml"
	});
});

test.serial("Rejects when YAML could not be updated (multiple libraries; with config path)", async (t) => {
	await assertFailingYamlUpdateRemoveHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1", "sap.ui.lib2"], "config": "/path/to/ui5.yaml"},
		expectedMessage:
			"Internal error while removing framework libraries sap.ui.lib1 sap.ui.lib2 to config at /path/to/ui5.yaml"
	});
});

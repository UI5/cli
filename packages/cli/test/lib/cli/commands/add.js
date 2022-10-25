import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

async function createMock(t, yamlUpdated = true) {
	t.context.frameworkAddStub = sinon.stub().resolves({yamlUpdated});
	t.context.addCommand = await esmock.p("../../../../lib/cli/commands/add.js", {
		"../../../../lib/framework/add.js": t.context.frameworkAddStub
	});
}

async function assertAddHandler(t, {argv, expectedLibraries, expectedConsoleLog}) {
	await createMock(t);
	await t.context.addCommand.handler(argv);

	t.is(t.context.frameworkAddStub.callCount, 1, "Add function should be called once");
	t.deepEqual(t.context.frameworkAddStub.getCall(0).args, [
		{
			libraries: expectedLibraries,
			projectGraphOptions: {
				dependencyDefinition: undefined,
				config: undefined
			}
		}],
	"Add function should be called with expected args");

	t.is(t.context.consoleLogStub.callCount, expectedConsoleLog.length,
		"console.log should be called " + expectedConsoleLog.length + " times");
	expectedConsoleLog.forEach((expectedLog, i) => {
		t.deepEqual(t.context.consoleLogStub.getCall(i).args, [expectedLog],
			"console.log should be called with expected string on call index " + i);
	});
}

async function assertFailingAddHandler(t, {argv, expectedMessage}) {
	await createMock(t);
	const exception = await t.throwsAsync(t.context.addCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Add handler should throw expected error");
	t.is(t.context.frameworkAddStub.callCount, 0, "Add function should not be called");
}

async function assertFailingYamlUpdateAddHandler(t, {argv, expectedMessage}) {
	await createMock(t, false);
	const exception = await t.throwsAsync(t.context.addCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Add handler should throw expected error");
	t.is(t.context.frameworkAddStub.callCount, 1, "Add function should be called once");
}

test.beforeEach((t) => {
	t.context.consoleLogStub = sinon.stub(console, "log");
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.addCommand);
});

test.serial("Accepts single library", async (t) => {
	await assertAddHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1"]},
		expectedLibraries: [{name: "sap.ui.lib1"}],
		expectedConsoleLog: [
			"Updated configuration written to ui5.yaml",
			"Added framework library sap.ui.lib1 as dependency"
		]
	});
});

test.serial("Accepts multiple libraries", async (t) => {
	await assertAddHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1", "sap.ui.lib2"]},
		expectedLibraries: [{name: "sap.ui.lib1"}, {name: "sap.ui.lib2"}],
		expectedConsoleLog: [
			"Updated configuration written to ui5.yaml",
			"Added framework libraries sap.ui.lib1 sap.ui.lib2 as dependencies"
		]
	});
});

test.serial("Accepts multiple libraries (--development)", async (t) => {
	await assertAddHandler(t, {
		argv: {
			"framework-libraries": [
				"sap.ui.lib1",
				"sap.ui.lib2"
			],
			"development": true
		},
		expectedLibraries: [
			{
				name: "sap.ui.lib1",
				development: true
			},
			{
				name: "sap.ui.lib2",
				development: true
			}
		],
		expectedConsoleLog: [
			"Updated configuration written to ui5.yaml",
			"Added framework libraries sap.ui.lib1 sap.ui.lib2 as development dependencies"
		]
	});
});

test.serial("Accepts multiple libraries (--optional)", async (t) => {
	await assertAddHandler(t, {
		argv: {
			"framework-libraries": [
				"sap.ui.lib1",
				"sap.ui.lib2"
			],
			"optional": true
		},
		expectedLibraries: [
			{
				name: "sap.ui.lib1",
				optional: true
			},
			{
				name: "sap.ui.lib2",
				optional: true
			}
		],
		expectedConsoleLog: [
			"Updated configuration written to ui5.yaml",
			"Added framework libraries sap.ui.lib1 sap.ui.lib2 as optional dependencies"
		]
	});
});

test.serial("Rejects when development and optional are true", async (t) => {
	await assertFailingAddHandler(t, {
		argv: {
			"framework-libraries": ["sap.ui.lib1"],
			"development": true,
			"optional": true
		},
		expectedMessage: "Options 'development' and 'optional' cannot be combined"
	});
});

test.serial("Rejects on empty framework-libraries", async (t) => {
	await assertFailingAddHandler(t, {
		argv: {"framework-libraries": ""},
		expectedMessage: "Missing mandatory parameter framework-libraries"
	});
});

test.serial("Rejects when YAML could not be updated (single library)", async (t) => {
	await assertFailingYamlUpdateAddHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1"]},
		expectedMessage: "Internal error while adding framework library sap.ui.lib1 to ui5.yaml"
	});
});

test.serial("Rejects when YAML could not be updated (multiple libraries)", async (t) => {
	await assertFailingYamlUpdateAddHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1", "sap.ui.lib2"]},
		expectedMessage: "Internal error while adding framework libraries sap.ui.lib1 sap.ui.lib2 to ui5.yaml"
	});
});

test.serial("Rejects when YAML could not be updated (single library; with config path)", async (t) => {
	await assertFailingYamlUpdateAddHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1"], "config": "/path/to/ui5.yaml"},
		expectedMessage: "Internal error while adding framework library sap.ui.lib1 to config at /path/to/ui5.yaml"
	});
});

test.serial("Rejects when YAML could not be updated (multiple libraries; with config path)", async (t) => {
	await assertFailingYamlUpdateAddHandler(t, {
		argv: {"framework-libraries": ["sap.ui.lib1", "sap.ui.lib2"], "config": "/path/to/ui5.yaml"},
		expectedMessage:
			"Internal error while adding framework libraries sap.ui.lib1 sap.ui.lib2 to config at /path/to/ui5.yaml"
	});
});

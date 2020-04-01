const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const useCommand = require("../../../../lib/cli/commands/use");

async function assertUseHandler(t, {argv, expectedFrameworkOptions}) {
	const frameworkUseStub = sinon.stub().resolves({
		usedFramework: undefined, // not required for this test
		usedVersion: undefined, // not required for this test
		yamlUpdated: true
	});
	mock("../../../../lib/framework/use", frameworkUseStub);

	await useCommand.handler(argv);

	t.is(frameworkUseStub.callCount, 1, "Use function should be called once");
	t.deepEqual(frameworkUseStub.getCall(0).args, [
		{
			frameworkOptions: expectedFrameworkOptions,
			normalizerOptions: {
				configPath: undefined,
				translatorName: undefined
			}
		}],
	"Use function should be called with expected args");
}

async function assertFailingUseHandler(t, {argv, expectedMessage}) {
	const frameworkUseStub = sinon.stub().resolves({
		usedFramework: undefined, // not required for this test
		usedVersion: undefined // not required for this test
	});
	mock("../../../../lib/framework/use", frameworkUseStub);

	const exception = await t.throwsAsync(useCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Use handler should throw expected error");
	t.is(frameworkUseStub.callCount, 0, "Use function should not be called");
}

async function assertFailingYamlUpdateUseHandler(t, {argv, expectedMessage}) {
	const frameworkUseStub = sinon.stub().resolves({
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: false
	});
	mock("../../../../lib/framework/use", frameworkUseStub);

	const exception = await t.throwsAsync(useCommand.handler(argv));

	t.is(exception.message, expectedMessage, "Use handler should throw expected error");
	t.is(frameworkUseStub.callCount, 1, "Use function should be called once");
}

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
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

test.serial("Accepts framework name (SAPUI5)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "SAPUI5"},
		expectedFrameworkOptions: {
			name: "SAPUI5",
			version: null
		}
	});
});

test.serial("Accepts framework name (sapui5)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "sapui5"},
		expectedFrameworkOptions: {
			name: "sapui5",
			version: null
		}
	});
});

test.serial("Accepts framework name (OpenUI5)", async (t) => {
	await assertUseHandler(t, {
		argv: {"framework-info": "OpenUI5"},
		expectedFrameworkOptions: {
			name: "OpenUI5",
			version: null
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

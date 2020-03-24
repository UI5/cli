const test = require("ava");
const AjvCoverage = require("../../../../../../../utils/AjvCoverage");
const {_Validator: Validator} = require("../../../../../../../../lib/validation/validator");
const ValidationError = require("../../../../../../../../lib/validation/ValidationError");

async function assertValidation(t, config, expectedErrors = undefined) {
	const validation = t.context.validator.validate({config, project: {id: "my-project"}});
	if (expectedErrors) {
		const validationError = await t.throwsAsync(validation, {
			instanceOf: ValidationError,
			name: "ValidationError"
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator();
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/2.0/kind/extension/task.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-extension-task"});
	const thresholds = {
		statements: 60,
		branches: 50,
		functions: 100,
		lines: 60
	};
	t.context.ajvCoverage.verify(thresholds);
});

test("kind: extension / type: task", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "extension",
		"type": "task",
		"metadata": {
			"name": "my-task"
		},
		"task": {
			"path": "/foo"
		}
	});
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "extension",
		"type": "task",
		"metadata": {
			"name": "my-task"
		},
		"task": {
			"path": "/foo"
		},
		"resources": {}
	}, [{
		dataPath: "",
		keyword: "additionalProperties",
		message: "should NOT have additional properties",
		params: {
			"additionalProperty": "resources"
		},
		schemaPath: "#/additionalProperties"
	}]);
});

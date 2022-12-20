import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import AjvCoverage from "../../../../../utils/AjvCoverage.js";
import {_Validator as Validator} from "../../../../../../lib/validation/validator.js";
import ValidationError from "../../../../../../lib/validation/ValidationError.js";

async function assertValidation(t, config, expectedErrors = undefined) {
	const validation = t.context.validator.validate({config, project: {id: "my-project"}});
	if (expectedErrors) {
		const validationError = await t.throwsAsync(validation, {
			instanceOf: ValidationError,
			name: "ValidationError"
		});
		validationError.errors.forEach((error) => {
			delete error.schemaPath;
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator({Ajv, ajvErrors});
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/kind/extension.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-extension"});
	const thresholds = {
		statements: 80,
		branches: 70,
		functions: 100,
		lines: 80
	};
	t.context.ajvCoverage.verify(thresholds);
});
["3.0", "2.6", "2.5", "2.4", "2.3", "2.2", "2.1", "2.0"].forEach((specVersion) => {
	test(`Type project-shim (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "project-shim",
			"metadata": {
				"name": "my-project-shim"
			},
			"shims": {}
		});
	});

	test(`Type server-middleware (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "server-middleware",
			"metadata": {
				"name": "my-server-middleware"
			},
			"middleware": {
				"path": "middleware.js"
			}
		});
	});

	test(`Type task (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "task",
			"metadata": {
				"name": "my-task"
			},
			"task": {
				"path": "task.js"
			}
		});
	});

	test(`No type (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"metadata": {
				"name": "my-project"
			}
		}, [{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'type'",
			params: {
				missingProperty: "type",
			}
		}]);
	});

	test(`Invalid type (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "foo",
			"metadata": {
				"name": "my-project"
			}
		}, [{
			dataPath: "/type",
			keyword: "enum",
			message: "should be equal to one of the allowed values",
			params: {
				allowedValues: [
					"task",
					"server-middleware",
					"project-shim"
				],
			}
		}]);
	});

	test(`No specVersion (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"kind": "extension",
			"type": "project-shim",
			"metadata": {
				"name": "my-library"
			},
			"shims": {}
		}, [{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'specVersion'",
			params: {
				missingProperty: "specVersion",
			}
		}]);
	});

	test(`No metadata (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "project-shim",
			"shims": {}
		}, [{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'metadata'",
			params: {
				missingProperty: "metadata",
			}
		}]);
	});
});

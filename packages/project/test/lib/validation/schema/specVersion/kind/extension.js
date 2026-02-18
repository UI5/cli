import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import SpecificationVersion from "../../../../../../lib/specifications/SpecificationVersion.js";
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
			delete error.emUsed;
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator({Ajv, ajvErrors, schemaName: "ui5"});
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/kind/extension.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-extension"});
	const thresholds = {
		statements: 70,
		branches: 60,
		functions: 100,
		lines: 70
	};
	t.context.ajvCoverage.verify(thresholds);
});

SpecificationVersion.getVersionsForRange(">=2.0").forEach((specVersion) => {
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
			instancePath: "",
			keyword: "required",
			message: "must have required property 'type'",
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
			instancePath: "/type",
			keyword: "enum",
			message: "must be equal to one of the allowed values",
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
			instancePath: "",
			keyword: "required",
			message: "must have required property 'specVersion'",
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
			instancePath: "",
			keyword: "required",
			message: "must have required property 'metadata'",
			params: {
				missingProperty: "metadata",
			}
		}]);
	});
});

test("Legacy: Special characters in name (task)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "extension",
		"type": "task",
		"metadata": {
			"name": "ä".repeat(81)
		},
		"task": {
			"path": "task.js"
		}
	});
});

test("Legacy: Special characters in name (server-middleware)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "extension",
		"type": "server-middleware",
		"metadata": {
			"name": "@my(middleware)"
		},
		"middleware": {
			"path": "middleware.js"
		}
	});
});

test("Legacy: Special characters in name (project-shim)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "extension",
		"type": "project-shim",
		"metadata": {
			"name": "my/(project)-shim"
		},
		"shims": {}
	});
});

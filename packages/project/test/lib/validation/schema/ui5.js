import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import AjvCoverage from "../../../utils/AjvCoverage.js";
import {_Validator as Validator} from "../../../../lib/validation/validator.js";
import ValidationError from "../../../../lib/validation/ValidationError.js";

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
			if (error.params && Array.isArray(error.params.errors)) {
				error.params.errors.forEach(($) => {
					delete $.schemaPath;
					delete $.emUsed;
				});
			}
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator({Ajv, ajvErrors, schemaName: "ui5"});
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/ui5.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-ui5"});
	const thresholds = {
		statements: 85,
		branches: 70,
		functions: 100,
		lines: 85
	};
	t.context.ajvCoverage.verify(thresholds);
});

test("Undefined", async (t) => {
	await assertValidation(t, undefined, [{
		instancePath: "",
		keyword: "type",
		message: "must be object",
		params: {
			type: "object",
		}
	}]);
});

test("Missing specVersion, type", async (t) => {
	await assertValidation(t, {}, [
		{
			instancePath: "",
			keyword: "required",
			message: "must have required property 'specVersion'",
			params: {
				missingProperty: "specVersion",
			}
		},
		{
			instancePath: "",
			keyword: "required",
			message: "must have required property 'type'",
			params: {
				missingProperty: "type",
			}
		}

	]);
});

test("Missing type", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0"
	}, [
		{
			instancePath: "",
			keyword: "required",
			message: "must have required property 'type'",
			params: {
				missingProperty: "type",
			}
		}
	]);
});

test("Invalid specVersion", async (t) => {
	await assertValidation(t, {
		"specVersion": "0.0"
	}, [
		{
			instancePath: "/specVersion",
			keyword: "errorMessage",
			message:
"Unsupported \"specVersion\"\n" +
"Your UI5 CLI installation might be outdated.\n" +
"Supported specification versions: \"5.0\", \"4.0\", \"3.2\", \"3.1\", \"3.0\", \"2.6\", " +
"\"2.5\", \"2.4\", \"2.3\", \"2.2\", \"2.1\", \"2.0\", \"1.1\", \"1.0\", \"0.1\"\n" +
"For details, see: https://ui5.github.io/cli/pages/Configuration/#specification-versions",
			params: {
				errors: [
					{
						instancePath: "/specVersion",
						keyword: "enum",
						message: "must be equal to one of the allowed values",
						params: {
							allowedValues: [
								"5.0",
								"4.0",
								"3.2",
								"3.1",
								"3.0",
								"2.6",
								"2.5",
								"2.4",
								"2.3",
								"2.2",
								"2.1",
								"2.0",
								"1.1",
								"1.0",
								"0.1",
							],
						}
					},
				],
			}
		}
	]);
});

test("Invalid type", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "foo"
	}, [
		{
			instancePath: "/type",
			keyword: "enum",
			message: "must be equal to one of the allowed values",
			params: {
				allowedValues: [
					"application",
					"library",
					"component",
					"theme-library",
					"module"
				]
			}
		}
	]);
});

test("Invalid kind", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "foo"
	}, [
		{
			instancePath: "/kind",
			keyword: "enum",
			message: "must be equal to one of the allowed values",
			params: {
				allowedValues: [
					"project",
					"extension",
					null
				],
			}
		}
	]);
});

test("specVersion 0.1", async (t) => {
	await assertValidation(t, {
		"specVersion": "0.1"
	});
});

test("specVersion 1.0", async (t) => {
	await assertValidation(t, {
		"specVersion": "1.0"
	});
});

test("specVersion 1.1", async (t) => {
	await assertValidation(t, {
		"specVersion": "1.1"
	});
});

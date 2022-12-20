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
			if (error.params && Array.isArray(error.params.errors)) {
				error.params.errors.forEach(($) => {
					delete $.schemaPath;
				});
			}
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator({Ajv, ajvErrors});
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/ui5.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-ui5"});
	const thresholds = {
		statements: 95,
		branches: 80,
		functions: 100,
		lines: 95
	};
	t.context.ajvCoverage.verify(thresholds);
});

test("Undefined", async (t) => {
	await assertValidation(t, undefined, [{
		dataPath: "",
		keyword: "type",
		message: "should be object",
		params: {
			type: "object",
		}
	}]);
});

test("Missing specVersion, type", async (t) => {
	await assertValidation(t, {}, [
		{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'specVersion'",
			params: {
				missingProperty: "specVersion",
			}
		},
		{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'type'",
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
			dataPath: "",
			keyword: "required",
			message: "should have required property 'type'",
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
			dataPath: "/specVersion",
			keyword: "errorMessage",
			message:
`Unsupported "specVersion"
Your UI5 CLI installation might be outdated.
Supported specification versions: "3.0", "2.6", "2.5", "2.4", "2.3", "2.2", "2.1", "2.0", "1.1", "1.0", "0.1"
For details see: https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions`,
			params: {
				errors: [
					{
						dataPath: "/specVersion",
						keyword: "enum",
						message: "should be equal to one of the allowed values",
						params: {
							allowedValues: [
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
			dataPath: "/type",
			keyword: "enum",
			message: "should be equal to one of the allowed values",
			params: {
				allowedValues: [
					"application",
					"library",
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
			dataPath: "/kind",
			keyword: "enum",
			message: "should be equal to one of the allowed values",
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

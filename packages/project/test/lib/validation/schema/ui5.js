const test = require("ava");
const AjvCoverage = require("../../../utils/AjvCoverage");
const {_Validator: Validator} = require("../../../../lib/validation/validator");
const ValidationError = require("../../../../lib/validation/ValidationError");

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
		},
		schemaPath: "#/type",
	}]);
});

test("Missing specVersion, type, metadata", async (t) => {
	await assertValidation(t, {}, [
		{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'specVersion'",
			params: {
				missingProperty: "specVersion",
			},
			schemaPath: "#/required",
		},
		{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'metadata'",
			params: {
				missingProperty: "metadata",
			},
			schemaPath: "#/required",
		},
		{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'type'",
			params: {
				missingProperty: "type",
			},
			schemaPath: "#/required",
		}

	]);
});

test("Missing type, metadata", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0"
	}, [
		{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'metadata'",
			params: {
				missingProperty: "metadata",
			},
			schemaPath: "#/required",
		},
		{
			dataPath: "",
			keyword: "required",
			message: "should have required property 'type'",
			params: {
				missingProperty: "type",
			},
			schemaPath: "#/required",
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
Supported specification versions: "2.0", "1.1", "1.0", "0.1"
For details see: https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions`,
			params: {
				errors: [
					{
						dataPath: "/specVersion",
						keyword: "enum",
						message: "should be equal to one of the allowed values",
						params: {
							allowedValues: [
								"2.0",
								"1.1",
								"1.0",
								"0.1",
							],
						},
						schemaPath: "#/properties/specVersion/enum",
					},
				],
			},
			schemaPath: "#/properties/specVersion/errorMessage",
		}
	]);
});

test("Invalid type", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "foo",
		"metadata": {
			"name": "foo"
		}
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
			},
			schemaPath: "#/properties/type/enum",
		}
	]);
});

test("Invalid kind", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "foo",
		"metadata": {
			"name": "foo"
		}
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
			},
			schemaPath: "#/properties/kind/enum",
		}
	]);
});

test("Invalid metadata.name", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": {}
		}
	}, [
		{
			dataPath: "/metadata/name",
			keyword: "type",
			message: "should be string",
			params: {
				type: "string"
			},
			schemaPath: "../ui5.json#/definitions/metadata/properties/name/type",
		}
	]);
});

test("Invalid metadata.copyright", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "foo",
			"copyright": 123
		}
	}, [
		{
			dataPath: "/metadata/copyright",
			keyword: "type",
			message: "should be string",
			params: {
				type: "string"
			},
			schemaPath: "../ui5.json#/definitions/metadata/properties/copyright/type",
		}
	]);
});

test("Additional metadata property", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "foo",
			"copyrihgt": "typo"
		}
	}, [
		{
			dataPath: "/metadata",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "copyrihgt"
			},
			schemaPath: "../ui5.json#/definitions/metadata/additionalProperties",
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

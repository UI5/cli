const test = require("ava");
const AjvCoverage = require("../../../../../../utils/AjvCoverage");
const {_Validator: Validator} = require("../../../../../../../lib/validation/validator");
const ValidationError = require("../../../../../../../lib/validation/ValidationError");

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
		includes: ["schema/specVersion/2.0/kind/project.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project"});
	const thresholds = {
		statements: 90,
		branches: 80,
		functions: 100,
		lines: 90
	};
	t.context.ajvCoverage.verify(thresholds);
});

test("Type application", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "application",
		"metadata": {
			"name": "my-application"
		}
	});
});

test("Type application (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "my-application"
		}
	});
});

test("Type library", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "library",
		"metadata": {
			"name": "my-library"
		}
	});
});

test("Type library (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "library",
		"metadata": {
			"name": "my-library"
		}
	});
});

test("Type theme-library", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "theme-library",
		"metadata": {
			"name": "my-theme-library"
		}
	});
});

test("Type theme-library (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "theme-library",
		"metadata": {
			"name": "my-theme-library"
		}
	});
});

test("Type module", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "module",
		"metadata": {
			"name": "my-module"
		}
	});
});

test("Type module (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module"
		}
	});
});

test("No type", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"metadata": {
			"name": "my-project"
		}
	}, [{
		dataPath: "",
		keyword: "required",
		message: "should have required property 'type'",
		params: {
			missingProperty: "type",
		},
		schemaPath: "#/required",
	}]);
});

test("No type, no kind", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"metadata": {
			"name": "my-project"
		}
	}, [{
		dataPath: "",
		keyword: "required",
		message: "should have required property 'type'",
		params: {
			missingProperty: "type",
		},
		schemaPath: "#/required",
	}]);
});

test("Invalid type", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
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
				"application",
				"library",
				"theme-library",
				"module",
			],
		},
		schemaPath: "#/properties/type/enum",
	}]);
});

test("No specVersion", async (t) => {
	await assertValidation(t, {
		"kind": "project",
		"type": "library",
		"metadata": {
			"name": "my-library"
		}
	}, [{
		dataPath: "",
		keyword: "required",
		message: "should have required property 'specVersion'",
		params: {
			missingProperty: "specVersion",
		},
		schemaPath: "#/required",
	}]);
});

test("No metadata", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application"
	}, [{
		dataPath: "",
		keyword: "required",
		message: "should have required property 'metadata'",
		params: {
			missingProperty: "metadata",
		},
		schemaPath: "#/required",
	}]);
});

test("Metadata not type object", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": "foo"
	}, [{
		dataPath: "/metadata",
		keyword: "type",
		message: "should be object",
		params: {
			type: "object",
		},
		schemaPath: "../ui5.json#/definitions/metadata/type",
	}]);
});

test("No metadata.name", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {}
	}, [{
		dataPath: "/metadata",
		keyword: "required",
		message: "should have required property 'name'",
		params: {
			missingProperty: "name",
		},
		schemaPath: "../ui5.json#/definitions/metadata/required",
	}]);
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

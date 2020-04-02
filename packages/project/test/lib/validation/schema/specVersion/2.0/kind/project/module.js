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
		includes: ["schema/specVersion/2.0/kind/project/module.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-module"});
	const thresholds = {
		statements: 65,
		branches: 55,
		functions: 100,
		lines: 65
	};
	t.context.ajvCoverage.verify(thresholds);
});

test("Valid configuration", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "module",
		"metadata": {
			"name": "my-module"
		},
		"resources": {
			"configuration": {
				"paths": {
					"/resources/my/library/module-xy/": "lib",
					"/resources/my/library/module-xy-min/": "dist"
				}
			}
		}
	});
});

test("No framework configuration", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module"
		},
		"framework": {}
	}, [{
		dataPath: "",
		keyword: "additionalProperties",
		message: "should NOT have additional properties",
		params: {
			"additionalProperty": "framework"
		},
		schemaPath: "#/additionalProperties"
	}]);
});

test("No propertiesFileSourceEncoding configuration", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module"
		},
		"resources": {
			"configuration": {
				"propertiesFileSourceEncoding": "UTF-8"
			}
		}
	}, [{
		dataPath: "/resources/configuration",
		keyword: "additionalProperties",
		message: "should NOT have additional properties",
		params: {
			"additionalProperty": "propertiesFileSourceEncoding"
		},
		schemaPath: "#/properties/resources/properties/configuration/additionalProperties"
	}]);
});

test("No builder, server configuration", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module"
		},
		"builder": {},
		"server": {}
	}, [{
		dataPath: "",
		keyword: "additionalProperties",
		message: "should NOT have additional properties",
		params: {
			"additionalProperty": "builder"
		},
		schemaPath: "#/additionalProperties"
	}, {
		dataPath: "",
		keyword: "additionalProperties",
		message: "should NOT have additional properties",
		params: {
			"additionalProperty": "server"
		},
		schemaPath: "#/additionalProperties"
	}]);
});

test("No metadata", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module"
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
		"type": "module",
		"metadata": "foo"
	}, [{
		dataPath: "/metadata",
		keyword: "type",
		message: "should be object",
		params: {
			type: "object",
		},
		schemaPath: "../project.json#/definitions/metadata/type",
	}]);
});

test("No metadata.name", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {}
	}, [{
		dataPath: "/metadata",
		keyword: "required",
		message: "should have required property 'name'",
		params: {
			missingProperty: "name",
		},
		schemaPath: "../project.json#/definitions/metadata/required",
	}]);
});

test("Invalid metadata.name", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "library",
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
			schemaPath: "../project.json#/definitions/metadata/properties/name/type",
		}
	]);
});

test("Invalid metadata.copyright", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "library",
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
			schemaPath: "../project.json#/definitions/metadata/properties/copyright/type",
		}
	]);
});

test("Additional metadata property", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "library",
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
			schemaPath: "../project.json#/definitions/metadata/additionalProperties",
		}
	]);
});

test("metadata.deprecated: true", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"deprecated": true
		}
	});
});

test("metadata.deprecated: false", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"deprecated": false
		}
	});
});

test("Invalid metadata.deprecated", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"deprecated": "Yes"
		}
	}, [
		{
			dataPath: "/metadata/deprecated",
			keyword: "type",
			message: "should be boolean",
			params: {
				type: "boolean",
			},
			schemaPath: "../project.json#/definitions/metadata/properties/deprecated/type",
		}
	]);
});

test("metadata.sapInternal: true", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"sapInternal": true
		}
	});
});

test("metadata.sapInternal: false", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"sapInternal": false
		}
	});
});

test("Invalid metadata.sapInternal", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"sapInternal": "Yes"
		}
	}, [
		{
			dataPath: "/metadata/sapInternal",
			keyword: "type",
			message: "should be boolean",
			params: {
				type: "boolean",
			},
			schemaPath: "../project.json#/definitions/metadata/properties/sapInternal/type",
		}
	]);
});

test("metadata.allowSapInternal: true", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"allowSapInternal": true
		}
	});
});

test("metadata.allowSapInternal: false", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"allowSapInternal": false
		}
	});
});

test("Invalid metadata.allowSapInternal", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module",
			"allowSapInternal": "Yes"
		}
	}, [
		{
			dataPath: "/metadata/allowSapInternal",
			keyword: "type",
			message: "should be boolean",
			params: {
				type: "boolean",
			},
			schemaPath: "../project.json#/definitions/metadata/properties/allowSapInternal/type",
		}
	]);
});

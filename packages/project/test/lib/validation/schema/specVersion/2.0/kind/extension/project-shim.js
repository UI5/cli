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
		includes: ["schema/specVersion/2.0/kind/extension/project-shim.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-extension-project-shim"});
	const thresholds = {
		statements: 70,
		branches: 55,
		functions: 100,
		lines: 65
	};
	t.context.ajvCoverage.verify(thresholds);
});


test("kind: extension / type: project-shim", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "extension",
		"type": "project-shim",
		"metadata": {
			"name": "my-project-shim"
		},
		"shims": {
			"configurations": {
				"my-dependency": {
					"specVersion": "2.0",
					"type": "application",
					"metadata": {
						"name": "my-application"
					}
				},
				"my-other-dependency": {
					"specVersion": "3.0",
					"type": "does-not-exist",
					"metadata": {
						"name": "my-application"
					}
				}
			},
			"dependencies": {
				"my-dependency": [
					"my-other-dependency"
				],
				"my-other-dependency": [
					"some-lib",
					"some-other-lib"
				]
			},
			"collections": {
				"my-dependency": {
					"modules": {
						"lib-1": "src/lib1",
						"lib-2": "src/lib2"
					}
				}
			}
		}
	});
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "extension",
		"type": "project-shim",
		"metadata": {
			"name": "my-project-shim"
		},
		"shims": {
			"configurations": {
				"invalid": {
					"specVersion": "3.0",
					"type": "does-not-exist",
					"metadata": {
						"name": "my-application"
					}
				}
			},
			"dependencies": {
				"my-dependency": {
					"foo": "bar"
				}
			},
			"collections": {
				"foo": {
					"modules": {
						"lib-1": {
							"path": "src/lib1"
						}
					},
					"notAllowed": true
				}
			},
			"notAllowed": true
		},
		"middleware": {}
	}, [
		{
			dataPath: "",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				"additionalProperty": "middleware"
			},
			schemaPath: "#/additionalProperties",
		},
		{
			dataPath: "/shims",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "notAllowed",
			},
			schemaPath: "#/properties/shims/additionalProperties",
		},
		{
			dataPath: "/shims/dependencies/my-dependency",
			keyword: "type",
			message: "should be array",
			params: {
				type: "array",
			},
			schemaPath: "#/properties/shims/properties/dependencies/patternProperties/.%2B/type",
		},
		{
			dataPath: "/shims/collections/foo",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "notAllowed",
			},
			schemaPath: "#/properties/shims/properties/collections/patternProperties/.%2B/additionalProperties"
		},
		{
			dataPath: "/shims/collections/foo/modules/lib-1",
			keyword: "type",
			message: "should be string",
			params: {
				type: "string",
			},
			schemaPath: "#/properties/shims/properties/collections/patternProperties/.%2B/properties/modules/patternProperties/.%2B/type"
		}
	]);
});

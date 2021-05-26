const test = require("ava");
const AjvCoverage = require("../../../../../../../utils/AjvCoverage");
const {_Validator: Validator} = require("../../../../../../../../lib/validation/validator");
const ValidationError = require("../../../../../../../../lib/validation/ValidationError");
const extension = require("../../../../__helper__/extension");

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
	t.context.validator = new Validator();
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/2.0/kind/extension/project-shim.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-extension-project-shim"});
	const thresholds = {
		statements: 75,
		branches: 60,
		functions: 100,
		lines: 70
	};
	t.context.ajvCoverage.verify(thresholds);
});

["2.4", "2.3", "2.2", "2.1", "2.0"].forEach((specVersion) => {
	test(`kind: extension / type: project-shim (${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
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
				}
			},
			{
				dataPath: "/shims",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/shims/dependencies/my-dependency",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				}
			},
			{
				dataPath: "/shims/collections/foo",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/shims/collections/foo/modules/lib-1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				}
			}
		]);
	});
});


const additionalConfiguration = {
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
};

extension.defineTests(test, assertValidation, "project-shim", additionalConfiguration);

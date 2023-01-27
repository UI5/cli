import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import AjvCoverage from "../../../../../../utils/AjvCoverage.js";
import {_Validator as Validator} from "../../../../../../../lib/validation/validator.js";
import ValidationError from "../../../../../../../lib/validation/ValidationError.js";
import extension from "../../../__helper__/extension.js";

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
	t.context.validator = new Validator({Ajv, ajvErrors, schemaName: "ui5"});
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/kind/extension/project-shim.json"]
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

["3.0", "2.6", "2.5", "2.4", "2.3", "2.2", "2.1", "2.0"].forEach((specVersion) => {
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
						"specVersion": "4.0",
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

["3.0"].forEach(function(specVersion) {
	test(`Invalid extension name (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "project-shim",
			"metadata": {
				"name": "illegal/name"
			},
			"shims": {}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "pattern",
					message: `should match pattern "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$"`,
					params: {
						pattern: "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$",
					}
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "project-shim",
			"metadata": {
				"name": "a"
			},
			"shims": {}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "minLength",
					message: "should NOT be shorter than 3 characters",
					params: {
						limit: 3,
					}
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "project-shim",
			"metadata": {
				"name": "a".repeat(51)
			},
			"shims": {}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "maxLength",
					message: "should NOT be longer than 50 characters",
					params: {
						limit: 50,
					}
				}]
			},
		}]);
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
				"specVersion": "4.0",
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

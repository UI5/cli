import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import SpecificationVersion from "../../../../../../../lib/specifications/SpecificationVersion.js";
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
		includes: ["schema/specVersion/kind/extension/project-shim.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-extension-project-shim"});
	const thresholds = {
		statements: 50,
		branches: 55,
		functions: 100,
		lines: 50
	};
	t.context.ajvCoverage.verify(thresholds);
});

SpecificationVersion.getVersionsForRange(">=2.0").forEach((specVersion) => {
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
				instancePath: "",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					"additionalProperty": "middleware"
				}
			},
			{
				instancePath: "/shims",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				instancePath: "/shims/dependencies/my-dependency",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				}
			},
			{
				instancePath: "/shims/collections/foo",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				instancePath: "/shims/collections/foo/modules/lib-1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				}
			}
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=3.0").forEach(function(specVersion) {
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
			instancePath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					instancePath: "/metadata/name",
					keyword: "pattern",
					message: `must match pattern "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$"`,
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
			instancePath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					instancePath: "/metadata/name",
					keyword: "minLength",
					message: "must NOT have fewer than 3 characters",
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
				"name": "a".repeat(81)
			},
			"shims": {}
		}, [{
			instancePath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					instancePath: "/metadata/name",
					keyword: "maxLength",
					message: "must NOT have more than 80 characters",
					params: {
						limit: 80,
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

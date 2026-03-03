import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import SpecificationVersion from "../../../../../../../lib/specifications/SpecificationVersion.js";
import AjvCoverage from "../../../../../../utils/AjvCoverage.js";
import {_Validator as Validator} from "../../../../../../../lib/validation/validator.js";
import ValidationError from "../../../../../../../lib/validation/ValidationError.js";
import project from "../../../__helper__/project.js";

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
		includes: ["schema/specVersion/kind/project/module.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-module"});
	const thresholds = {
		statements: 55,
		branches: 55,
		functions: 100,
		lines: 55
	};
	t.context.ajvCoverage.verify(thresholds);
});

SpecificationVersion.getVersionsForRange(">=2.0").forEach((specVersion) => {
	test(`Valid configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
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

	test(`No framework configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"framework": {}
		}, [{
			instancePath: "",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				"additionalProperty": "framework"
			}
		}]);
	});

	test(`No propertiesFileSourceEncoding configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
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
			instancePath: "/resources/configuration",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				"additionalProperty": "propertiesFileSourceEncoding"
			}
		}]);
	});
});

SpecificationVersion.getVersionsForRange("2.0 - 2.4").forEach((specVersion) => {
	test(`No server configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"server": {}
		}, [{
			instancePath: "",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				"additionalProperty": "server"
			}
		}]);
	});

	test(`No builder configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"builder": {}
		}, [{
			instancePath: "",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				"additionalProperty": "builder"
			}
		}]);
	});
});

SpecificationVersion.getVersionsForRange(">=2.5").forEach(function(specVersion) {
	test(`Server configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"server": {
				"settings": {
					"httpPort": 1337,
					"httpsPort": 1443
				},
				"customMiddleware": [
					{
						"name": "myCustomMiddleware",
						"mountPath": "/myapp",
						"afterMiddleware": "compression",
						"configuration": {
							"debug": true
						}
					}
				]
			}
		});
	});

	test(`module (specVersion ${specVersion}): builder/settings/includeDependency*`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"builder": {
				"settings": {
					"includeDependency": [
						"sap.a",
						"sap.b"
					],
					"includeDependencyRegExp": [
						".ui.[a-z]+",
						"^sap.[mf]$"
					],
					"includeDependencyTree": [
						"sap.c",
						"sap.d"
					]
				}
			}
		});
	});

	test(`Invalid builder/settings/includeDependency* configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"builder": {
				"settings": {
					"includeDependency": "a",
					"includeDependencyRegExp": "b",
					"includeDependencyTree": "c"
				}
			}
		}, [
			{
				instancePath: "/builder/settings/includeDependency",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyRegExp",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyTree",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"builder": {
				"settings": {
					"includeDependency": [
						true,
						1,
						{}
					],
					"includeDependencyRegExp": [
						true,
						1,
						{}
					],
					"includeDependencyTree": [
						true,
						1,
						{}
					],
					"notAllowed": true
				}
			}
		}, [
			{
				instancePath: "/builder/settings",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				instancePath: "/builder/settings/includeDependency/0",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependency/1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependency/2",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyRegExp/0",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyRegExp/1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyRegExp/2",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyTree/0",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyTree/1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/settings/includeDependencyTree/2",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=3.0").forEach(function(specVersion) {
	test(`Invalid project name (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "illegal-🦜"
			}
		}, [{
			instancePath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid project name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Configuration/#name`,
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
			"type": "module",
			"metadata": {
				"name": "a"
			}
		}, [{
			instancePath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid project name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					instancePath: "/metadata/name",
					keyword: "minLength",
					message: "must NOT have fewer than 3 characters",
					params: {
						limit: 3,
					},
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "a".repeat(81)
			}
		}, [{
			instancePath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid project name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					instancePath: "/metadata/name",
					keyword: "maxLength",
					message: "must NOT have more than 80 characters",
					params: {
						limit: 80,
					},
				}]
			},
		}]);
	});
});

SpecificationVersion.getVersionsForRange(">=3.1").forEach(function(specVersion) {
	test(`Builder resource excludes (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"builder": {
				"resources": {
					"excludes": [
						"/resources/some/project/name/test_results/**",
						"!/test-resources/some/project/name/demo-app/**"
					]
				}
			}
		});
	});
});

project.defineTests(test, assertValidation, "module");

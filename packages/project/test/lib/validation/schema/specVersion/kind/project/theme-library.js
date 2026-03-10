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
		includes: ["schema/specVersion/kind/project/theme-library.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-theme-library"});
	const thresholds = {
		statements: 60,
		branches: 55,
		functions: 100,
		lines: 60
	};
	t.context.ajvCoverage.verify(thresholds);
});

SpecificationVersion.getVersionsForRange(">=2.0").forEach(function(specVersion) {
	test(`Valid configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "theme-library",
			"metadata": {
				"name": "my-theme-library",
				"copyright": "Copyright goes here"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF-8",
					"paths": {
						"src": "src/main/uilib",
						"test": "src/test/uilib"
					}
				}
			},
			"builder": {
				"resources": {
					"excludes": [
						"/resources/some/project/name/test_results/**",
						"/test-resources/**",
						"!/test-resources/some/project/name/demo-app/**"
					]
				},
				"customTasks": [
					{
						"name": "custom-task-1",
						"beforeTask": "replaceCopyright",
						"configuration": {
							"some-key": "some value"
						}
					},
					{
						"name": "custom-task-2",
						"afterTask": "custom-task-1",
						"configuration": {
							"color": "blue"
						}
					}
				]
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

	test(`Invalid builder configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				// cachebuster is only supported for type application
				"cachebuster": {
					"signatureType": "time"
				},
				// jsdoc is only supported for type library
				"jsdoc": {
					"excludes": [
						"some/project/name/thirdparty/**"
					]
				},
				// componentPreload is only supported for types application/library
				"componentPreload": {},
				// libraryPreload is only supported for type library
				"libraryPreload": {},
			}
		}, [{
			instancePath: "/builder",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				additionalProperty: "cachebuster"
			}
		},
		{
			instancePath: "/builder",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				additionalProperty: "jsdoc"
			}
		},
		{
			instancePath: "/builder",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				additionalProperty: "componentPreload"
			}
		},
		{
			instancePath: "/builder",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				additionalProperty: "libraryPreload"
			}
		}]);
	});
});

SpecificationVersion.getVersionsForRange(">=2.5").forEach(function(specVersion) {
	test(`theme-library (specVersion ${specVersion}): builder/settings/includeDependency*`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
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
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
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
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
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
			"type": "theme-library",
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
					},
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "theme-library",
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
			"type": "theme-library",
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
project.defineTests(test, assertValidation, "theme-library");

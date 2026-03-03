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
		includes: ["schema/specVersion/kind/project/component.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-component"});
	const thresholds = {
		statements: 65,
		branches: 60,
		functions: 100,
		lines: 65
	};
	t.context.ajvCoverage.verify(thresholds);
});

SpecificationVersion.getVersionsForRange(">=5.0").forEach(function(specVersion) {
	test(`Valid configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "okay"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF-8",
					"paths": {
						"src": "/my/path"
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
				"bundles": [
					{
						"bundleDefinition": {
							"name": "sap-ui-custom.js",
							"defaultFileTypes": [
								".js"
							],
							"sections": [
								{
									"name": "my-raw-section",
									"mode": "raw",
									"filters": [
										"ui5loader-autoconfig.js"
									],
									"resolve": true,
									"resolveConditional": true,
									"renderer": true,
									"sort": true
								},
								{
									"mode": "provided",
									"filters": [
										"ui5loader-autoconfig.js"
									],
									"resolve": false,
									"resolveConditional": false,
									"renderer": false,
									"sort": false,
									"declareRawModules": true
								}
							]
						},
						"bundleOptions": {
							"optimize": true,
							"decorateBootstrapModule": true,
							"addTryCatchRestartWrapper": true
						}
					},
					{
						"bundleDefinition": {
							"name": "app.js",
							"defaultFileTypes": [
								".js"
							],
							"sections": [
								{
									"name": "some-app-preload",
									"mode": "preload",
									"filters": [
										"some/app/Component.js"
									],
									"resolve": true,
									"sort": true,
									"declareRawModules": false
								},
								{
									"mode": "require",
									"filters": [
										"ui5loader-autoconfig.js"
									],
									"resolve": true
								}
							]
						},
						"bundleOptions": {
							"optimize": true,
							"numberOfParts": 3
						}
					}
				],
				"componentPreload": {
					"paths": [
						"some/glob/**/pattern/Component.js",
						"some/other/glob/**/pattern/Component.js"
					],
					"namespaces": [
						"some/namespace",
						"some/other/namespace"
					]
				},
				"cachebuster": {
					"signatureType": "hash"
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
					},
					{
						"name": "custom-task-2",
						"beforeTask": "not-valid",
						"configuration": false
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
					},
					{
						"name": "myCustomMiddleware-2",
						"beforeMiddleware": "myCustomMiddleware",
						"configuration": {
							"debug": true
						}
					}
				]
			}
		});
	});

	test(`Invalid resources configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "FOO",
					"paths": {
						"app": "src",
						"src": {
							"path": "invalid"
						}
					},
					"notAllowed": true
				},
				"notAllowed": true
			}
		}, [
			{
				instancePath: "/resources",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				instancePath: "/resources/configuration",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				instancePath: "/resources/configuration/propertiesFileSourceEncoding",
				keyword: "enum",
				message: "must be equal to one of the allowed values",
				params: {
					allowedValues: [
						"UTF-8",
						"ISO-8859-1"
					],
				}
			},
			{
				instancePath: "/resources/configuration/paths",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "app",
				}
			},
			{
				instancePath: "/resources/configuration/paths/src",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string"
				}
			}
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test"
			},
			"resources": {
				"configuration": {
					"paths": "src"
				}
			}
		}, [
			{
				instancePath: "/resources/configuration/paths",
				keyword: "type",
				message: "must be object",
				params: {
					type: "object"
				}
			}
		]);
	});

	test(`Invalid builder configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				// jsdoc is not supported for type component
				"jsdoc": {
					"excludes": [
						"some/project/name/thirdparty/**"
					]
				},
				"bundles": [
					{
						"bundleDefinition": {
							"name": "sap-ui-custom.js",
							"defaultFileTypes": [
								".js"
							],
							"sections": [
								{
									"name": true,
									"mode": "raw",
									"filters": [
										"ui5loader-autoconfig.js"
									],
									"resolve": true,
									"sort": true,
									"declareModules": true
								}
							]
						},
						"bundleOptions": {
							"optimize": true
						}
					},
					{
						"bundleDefinition": {
							"defaultFileTypes": [
								".js", true
							],
							"sections": [
								{
									"filters": [
										"some/app/Component.js"
									],
									"resolve": true,
									"sort": true,
									"declareRawModules": []
								},
								{
									"mode": "provide",
									"filters": "*",
									"resolve": true
								}
							]
						},
						"bundleOptions": {
							"optimize": "true",
							"numberOfParts": "3",
							"notAllowed": true
						}
					}
				],
				"componentPreload": {
					"path": "some/invalid/path",
					"paths": "some/invalid/glob/**/pattern/Component.js",
					"namespaces": "some/invalid/namespace",
				},
				"libraryPreload": {} // Only supported for type library
			}
		}, [
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
					additionalProperty: "libraryPreload"
				}
			},
			{
				instancePath: "/builder/bundles/0/bundleDefinition/sections/0",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "declareModules",
				}
			},
			{
				instancePath: "/builder/bundles/0/bundleDefinition/sections/0/name",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleDefinition",
				keyword: "required",
				message: "must have required property 'name'",
				params: {
					missingProperty: "name",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleDefinition/defaultFileTypes/1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleDefinition/sections/0",
				keyword: "required",
				message: "must have required property 'mode'",
				params: {
					missingProperty: "mode",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleDefinition/sections/0/declareRawModules",
				keyword: "type",
				message: "must be boolean",
				params: {
					type: "boolean",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleDefinition/sections/1/mode",
				keyword: "enum",
				message: "must be equal to one of the allowed values",
				params: {
					allowedValues: [
						"raw",
						"preload",
						"require",
						"provided",
						"bundleInfo",
						"depCache",
					]
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleDefinition/sections/1/filters",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleOptions",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleOptions/optimize",
				keyword: "type",
				message: "must be boolean",
				params: {
					type: "boolean",
				}
			},
			{
				instancePath: "/builder/bundles/1/bundleOptions/numberOfParts",
				keyword: "type",
				message: "must be number",
				params: {
					type: "number",
				}
			},
			{
				instancePath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "path",
				}
			},
			{
				instancePath: "/builder/componentPreload/paths",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				}
			},
			{
				instancePath: "/builder/componentPreload/namespaces",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				}
			}
		]);
	});
	test(`component (specVersion ${specVersion}): builder/componentPreload/excludes`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"componentPreload": {
					"excludes": [
						"some/excluded/files/**",
						"some/other/excluded/files/**"
					]
				}
			}
		});
	});
	test(`Invalid builder/componentPreload/excludes configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"componentPreload": {
					"excludes": "some/excluded/files/**"
				}
			}
		}, [
			{
				instancePath: "/builder/componentPreload/excludes",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"componentPreload": {
					"excludes": [
						true,
						1,
						{}
					],
					"notAllowed": true
				}
			}
		}, [
			{
				instancePath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				instancePath: "/builder/componentPreload/excludes/0",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/componentPreload/excludes/1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/componentPreload/excludes/2",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
		]);
	});
	test(`component (specVersion ${specVersion}): builder/bundles/bundleDefinition/sections/mode: bundleInfo`,
		async (t) => {
			await assertValidation(t, {
				"specVersion": specVersion,
				"kind": "project",
				"type": "component",
				"metadata": {
					"name": "com.sap.ui5.test",
					"copyright": "yes"
				},
				"builder": {
					"bundles": [{
						"bundleDefinition": {
							"name": "my-bundle.js",
							"sections": [{
								"name": "my-bundle-info",
								"mode": "bundleInfo",
								"filters": []
							}]
						}
					}]
				}
			});
		});
	test(`component (specVersion ${specVersion}): builder/settings/includeDependency*`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "component",
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
			"type": "component",
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
			"type": "component",
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
	test(`component (specVersion ${specVersion}): builder/minification/excludes`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"minification": {
					"excludes": [
						"some/excluded/files/**",
						"some/other/excluded/files/**"
					]
				}
			}
		});
	});
	test(`Invalid builder/minification/excludes configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"minification": {
					"excludes": "some/excluded/files/**"
				}
			}
		}, [
			{
				instancePath: "/builder/minification/excludes",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"minification": {
					"excludes": [
						true,
						1,
						{}
					],
					"notAllowed": true
				}
			}
		}, [
			{
				instancePath: "/builder/minification",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				instancePath: "/builder/minification/excludes/0",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/minification/excludes/1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/minification/excludes/2",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
		]);
	});
	test(`Invalid project name (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "component",
			"metadata": {
				"name": "illegal/name"
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
			"type": "component",
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
			"type": "component",
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

project.defineTests(test, assertValidation, "component");

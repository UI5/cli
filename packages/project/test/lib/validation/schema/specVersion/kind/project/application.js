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
		includes: ["schema/specVersion/kind/project/application.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-application"});
	const thresholds = {
		statements: 80,
		branches: 75,
		functions: 100,
		lines: 80
	};
	t.context.ajvCoverage.verify(thresholds);
});

SpecificationVersion.getVersionsForRange(">=4.0").forEach(function(specVersion) {
	test(`Valid configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "okay"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF-8",
					"paths": {
						"webapp": "/my/path"
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
									"resolve": true,
									"async": false
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
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "FOO",
					"paths": {
						"app": "webapp",
						"webapp": {
							"path": "invalid"
						}
					},
					"notAllowed": true
				},
				"notAllowed": true
			}
		}, [
			{
				dataPath: "/resources",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/resources/configuration",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/resources/configuration/propertiesFileSourceEncoding",
				keyword: "enum",
				message: "should be equal to one of the allowed values",
				params: {
					allowedValues: [
						"UTF-8",
						"ISO-8859-1"
					],
				}
			},
			{
				dataPath: "/resources/configuration/paths",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "app",
				}
			},
			{
				dataPath: "/resources/configuration/paths/webapp",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string"
				}
			}
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test"
			},
			"resources": {
				"configuration": {
					"paths": "webapp"
				}
			}
		}, [
			{
				dataPath: "/resources/configuration/paths",
				keyword: "type",
				message: "should be object",
				params: {
					type: "object"
				}
			}
		]);
	});
});

SpecificationVersion.getVersionsForRange("2.0 - 3.2").forEach(function(specVersion) {
	test(`Valid configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "okay"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF-8",
					"paths": {
						"webapp": "/my/path"
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
							"addTryCatchRestartWrapper": true,
							"usePredefineCalls": true
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
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "FOO",
					"paths": {
						"app": "webapp",
						"webapp": {
							"path": "invalid"
						}
					},
					"notAllowed": true
				},
				"notAllowed": true
			}
		}, [
			{
				dataPath: "/resources",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/resources/configuration",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/resources/configuration/propertiesFileSourceEncoding",
				keyword: "enum",
				message: "should be equal to one of the allowed values",
				params: {
					allowedValues: [
						"UTF-8",
						"ISO-8859-1"
					],
				}
			},
			{
				dataPath: "/resources/configuration/paths",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "app",
				}
			},
			{
				dataPath: "/resources/configuration/paths/webapp",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string"
				}
			}
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test"
			},
			"resources": {
				"configuration": {
					"paths": "webapp"
				}
			}
		}, [
			{
				dataPath: "/resources/configuration/paths",
				keyword: "type",
				message: "should be object",
				params: {
					type: "object"
				}
			}
		]);
	});
});

SpecificationVersion.getVersionsForRange("2.0 - 2.2").forEach(function(specVersion) {
	test(`Unsupported builder/componentPreload/excludes configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
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
		}, [
			{
				dataPath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "excludes",
				},
			},
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=2.3").forEach(function(specVersion) {
	test(`application (specVersion ${specVersion}): builder/componentPreload/excludes`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "application",
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
			"type": "application",
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
				dataPath: "/builder/componentPreload/excludes",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
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
				dataPath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				dataPath: "/builder/componentPreload/excludes/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/componentPreload/excludes/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/componentPreload/excludes/2",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=2.4").forEach(function(specVersion) {
	// Unsupported cases for older spec-versions already tested via "allowedValues" comparison above
	test(`application (specVersion ${specVersion}): builder/bundles/bundleDefinition/sections/mode: bundleInfo`,
		async (t) => {
			await assertValidation(t, {
				"specVersion": specVersion,
				"kind": "project",
				"type": "application",
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
});

SpecificationVersion.getVersionsForRange(">=2.5").forEach(function(specVersion) {
	test(`application (specVersion ${specVersion}): builder/settings/includeDependency*`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "application",
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
			"type": "application",
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
				dataPath: "/builder/settings/includeDependency",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
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
				dataPath: "/builder/settings",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				dataPath: "/builder/settings/includeDependency/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependency/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependency/2",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp/2",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree/2",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=2.6").forEach(function(specVersion) {
	test(`application (specVersion ${specVersion}): builder/minification/excludes`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "application",
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
			"type": "application",
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
				dataPath: "/builder/minification/excludes",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
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
				dataPath: "/builder/minification",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				dataPath: "/builder/minification/excludes/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/minification/excludes/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/minification/excludes/2",
				keyword: "type",
				message: "should be string",
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
			"type": "application",
			"metadata": {
				"name": "illegal/name"
			}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid project name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "pattern",
					message: `should match pattern "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$"`,
					params: {
						pattern: "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$",
					},
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
			"metadata": {
				"name": "a"
			}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid project name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "minLength",
					message: "should NOT be shorter than 3 characters",
					params: {
						limit: 3,
					},
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
			"metadata": {
				"name": "a".repeat(81)
			}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid project name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "maxLength",
					message: "should NOT be longer than 80 characters",
					params: {
						limit: 80,
					},
				}]
			},
		}]);
	});
});

SpecificationVersion.getVersionsForRange("2.0 - 3.1").forEach(function(specVersion) {
	test(`Invalid builder configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				// jsdoc is not supported for type application
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
				dataPath: "/builder",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "jsdoc"
				}
			},
			{
				dataPath: "/builder",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "libraryPreload"
				}
			},
			{
				dataPath: "/builder/bundles/0/bundleDefinition/sections/0",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "declareModules",
				}
			},
			{
				dataPath: "/builder/bundles/0/bundleDefinition/sections/0/name",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition",
				keyword: "required",
				message: "should have required property 'name'",
				params: {
					missingProperty: "name",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/defaultFileTypes/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0",
				keyword: "required",
				message: "should have required property 'mode'",
				params: {
					missingProperty: "mode",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0/declareRawModules",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/1/mode",
				keyword: "enum",
				message: "should be equal to one of the allowed values",
				params: {
					allowedValues: ["3.1", "3.0", "2.6", "2.5", "2.4"].includes(specVersion) ? [
						"raw",
						"preload",
						"require",
						"provided",
						"bundleInfo"
					] : [
						"raw",
						"preload",
						"require",
						"provided"
					]
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/1/filters",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/optimize",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/numberOfParts",
				keyword: "type",
				message: "should be number",
				params: {
					type: "number",
				}
			},
			{
				dataPath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "path",
				}
			},
			{
				dataPath: "/builder/componentPreload/paths",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				}
			},
			{
				dataPath: "/builder/componentPreload/namespaces",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				}
			}
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=3.2").forEach(function(specVersion) {
	test(`Invalid builder configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "application",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				// jsdoc is not supported for type application
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
				dataPath: "/builder",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "jsdoc"
				}
			},
			{
				dataPath: "/builder",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "libraryPreload"
				}
			},
			{
				dataPath: "/builder/bundles/0/bundleDefinition/sections/0",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "declareModules",
				}
			},
			{
				dataPath: "/builder/bundles/0/bundleDefinition/sections/0/name",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition",
				keyword: "required",
				message: "should have required property 'name'",
				params: {
					missingProperty: "name",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/defaultFileTypes/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0",
				keyword: "required",
				message: "should have required property 'mode'",
				params: {
					missingProperty: "mode",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0/declareRawModules",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/1/mode",
				keyword: "enum",
				message: "should be equal to one of the allowed values",
				params: {
					allowedValues: [
						"raw",
						"preload",
						"require",
						"provided",
						"bundleInfo",
						"depCache"
					]
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/1/filters",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/optimize",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				}
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/numberOfParts",
				keyword: "type",
				message: "should be number",
				params: {
					type: "number",
				}
			},
			{
				dataPath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "path",
				}
			},
			{
				dataPath: "/builder/componentPreload/paths",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				}
			},
			{
				dataPath: "/builder/componentPreload/namespaces",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				}
			}
		]);
	});
});

project.defineTests(test, assertValidation, "application");

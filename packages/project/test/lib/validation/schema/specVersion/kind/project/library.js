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
		includes: ["schema/specVersion/kind/project/library.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-library"});
	const thresholds = {
		statements: 65,
		branches: 60,
		functions: 100,
		lines: 65
	};
	t.context.ajvCoverage.verify(thresholds);
});

SpecificationVersion.getVersionsForRange(">=4.0").forEach(function(specVersion) {
	test(`library (specVersion ${specVersion}): Valid configuration`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
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
									"declareRawModules": false,
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
				"jsdoc": {
					"excludes": [
						"some/project/name/thirdparty/**"
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

	test(`library (specVersion ${specVersion}): Invalid builder configuration`, async (t) => {
		const config = {
			"specVersion": specVersion,
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				// cachebuster is only supported for type application
				"cachebuster": {
					"signatureType": "time"
				},
				"bundles": [
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
									"declareRawModules": false,
									"async": false
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
			}
		};
		await assertValidation(t, config, [
			{
				instancePath: "/builder",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "cachebuster",
				},
			},
			{
				instancePath: "/builder/bundles/0/bundleDefinition/sections/0",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "async",
				},
			},
		]);
	});
});

SpecificationVersion.getVersionsForRange("2.0 - 3.2").forEach(function(specVersion) {
	test(`library (specVersion ${specVersion}): Valid configuration`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
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
				"jsdoc": {
					"excludes": [
						"some/project/name/thirdparty/**"
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

	test(`library (specVersion ${specVersion}): Invalid builder configuration`, async (t) => {
		const config = {
			"specVersion": specVersion,
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				// cachebuster is only supported for type application
				"cachebuster": {
					"signatureType": "time"
				}
			}
		};
		await assertValidation(t, config, [{
			instancePath: "/builder",
			keyword: "additionalProperties",
			message: "must NOT have additional properties",
			params: {
				additionalProperty: "cachebuster"
			}
		}]);
	});
});

SpecificationVersion.getVersionsForRange("2.0 - 2.2").forEach(function(specVersion) {
	test(`Unsupported builder/libraryPreload configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"libraryPreload": {}
			}
		}, [
			{
				instancePath: "/builder",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "libraryPreload",
				},
			},
		]);
	});
	test(`Unsupported builder/componentPreload/excludes configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "library",
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
				instancePath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "excludes",
				},
			},
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=2.3").forEach(function(specVersion) {
	test(`library (specVersion ${specVersion}): builder/libraryPreload/excludes`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"libraryPreload": {
					"excludes": [
						"some/excluded/files/**",
						"some/other/excluded/files/**"
					]
				}
			}
		});
	});
	test(`Invalid builder/libraryPreload/excludes configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"libraryPreload": {
					"excludes": "some/excluded/files/**"
				}
			}
		}, [
			{
				instancePath: "/builder/libraryPreload/excludes",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"libraryPreload": {
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
				instancePath: "/builder/libraryPreload",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				instancePath: "/builder/libraryPreload/excludes/0",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/libraryPreload/excludes/1",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
			{
				instancePath: "/builder/libraryPreload/excludes/2",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
		]);
	});


	test(`library (specVersion ${specVersion}): builder/componentPreload/excludes`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "library",
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
			"type": "library",
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
			"type": "library",
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
});

SpecificationVersion.getVersionsForRange(">=2.4").forEach(function(specVersion) {
	// Unsupported cases for older spec-versions already tested via "allowedValues" comparison above
	test(`library (specVersion ${specVersion}): builder/bundles/bundleDefinition/sections/mode: bundleInfo`,
		async (t) => {
			await assertValidation(t, {
				"specVersion": specVersion,
				"kind": "project",
				"type": "library",
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
	test(`library (specVersion ${specVersion}): builder/settings/includeDependency*`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "library",
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
			"type": "library",
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
			"type": "library",
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

SpecificationVersion.getVersionsForRange(">=2.6").forEach(function(specVersion) {
	test(`library (specVersion ${specVersion}): builder/minification/excludes`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "library",
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
			"type": "library",
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
			"type": "library",
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
});

SpecificationVersion.getVersionsForRange(">=3.0").forEach(function(specVersion) {
	test(`Invalid project name (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "library",
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
			"type": "library",
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
			"type": "library",
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

SpecificationVersion.getVersionsForRange("2.0 - 3.1").forEach(function(specVersion) {
	test(`library (specVersion ${specVersion}): Invalid configuration`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF8",
					"paths": {
						"src": {"path": "src"},
						"test": {"path": "test"},
						"webapp": "app"
					}
				}
			},
			"builder": {
				"resources": {
					"excludes": "/resources/some/project/name/test_results/**"
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
				"jsdoc": {
					"excludes": "some/project/name/thirdparty/**"
				},
				"customTasks": [
					{
						"name": "custom-task-1",
						"beforeTask": "replaceCopyright",
						"afterTask": "replaceCopyright",
					},
					{
						"afterTask": "custom-task-1",
						"configuration": {
							"color": "blue"
						}
					},
					"my-task"
				]
			},
			"server": {
				"settings": {
					"httpPort": "1337",
					"httpsPort": "1443"
				}
			}
		}, [
			{
				instancePath: "/resources/configuration/propertiesFileSourceEncoding",
				keyword: "enum",
				message: "must be equal to one of the allowed values",
				params: {
					allowedValues: [
						"UTF-8",
						"ISO-8859-1",
					],
				}
			},
			{
				instancePath: "/resources/configuration/paths",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "webapp",
				}
			},
			{
				instancePath: "/resources/configuration/paths/src",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				}
			},
			{
				instancePath: "/resources/configuration/paths/test",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				}
			},
			{
				instancePath: "/builder/resources/excludes",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				}
			},
			{
				instancePath: "/builder/jsdoc/excludes",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
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
			},
			{
				instancePath: "/builder/customTasks/0",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "afterTask",
				}
			},
			{
				instancePath: "/builder/customTasks/0",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "beforeTask",
				}
			},
			{
				instancePath: "/builder/customTasks/1",
				keyword: "required",
				message: "must have required property 'name'",
				params: {
					missingProperty: "name",
				}
			},
			{
				instancePath: "/builder/customTasks/1",
				keyword: "required",
				message: "must have required property 'beforeTask'",
				params: {
					missingProperty: "beforeTask",
				}
			},
			{
				instancePath: "/builder/customTasks/1",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "afterTask",
				}
			},
			{
				instancePath: "/builder/customTasks/2",
				keyword: "type",
				message: "must be object",
				params: {
					type: "object",
				}
			},
			{
				instancePath: "/server/settings/httpPort",
				keyword: "type",
				message: "must be number",
				params: {
					type: "number",
				}
			},
			{
				instancePath: "/server/settings/httpsPort",
				keyword: "type",
				message: "must be number",
				params: {
					type: "number",
				}
			}
		]);
	});
});

SpecificationVersion.getVersionsForRange(">=3.2").forEach(function(specVersion) {
	test(`library (specVersion ${specVersion}): Invalid configuration`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF8",
					"paths": {
						"src": {"path": "src"},
						"test": {"path": "test"},
						"webapp": "app"
					}
				}
			},
			"builder": {
				"resources": {
					"excludes": "/resources/some/project/name/test_results/**"
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
				"jsdoc": {
					"excludes": "some/project/name/thirdparty/**"
				},
				"customTasks": [
					{
						"name": "custom-task-1",
						"beforeTask": "replaceCopyright",
						"afterTask": "replaceCopyright",
					},
					{
						"afterTask": "custom-task-1",
						"configuration": {
							"color": "blue"
						}
					},
					"my-task"
				]
			},
			"server": {
				"settings": {
					"httpPort": "1337",
					"httpsPort": "1443"
				}
			}
		}, [
			{
				instancePath: "/resources/configuration/propertiesFileSourceEncoding",
				keyword: "enum",
				message: "must be equal to one of the allowed values",
				params: {
					allowedValues: [
						"UTF-8",
						"ISO-8859-1",
					],
				}
			},
			{
				instancePath: "/resources/configuration/paths",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "webapp",
				}
			},
			{
				instancePath: "/resources/configuration/paths/src",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				}
			},
			{
				instancePath: "/resources/configuration/paths/test",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				}
			},
			{
				instancePath: "/builder/resources/excludes",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				}
			},
			{
				instancePath: "/builder/jsdoc/excludes",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
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
						"depCache"
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
			},
			{
				instancePath: "/builder/customTasks/0",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "afterTask",
				}
			},
			{
				instancePath: "/builder/customTasks/0",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "beforeTask",
				}
			},
			{
				instancePath: "/builder/customTasks/1",
				keyword: "required",
				message: "must have required property 'name'",
				params: {
					missingProperty: "name",
				}
			},
			{
				instancePath: "/builder/customTasks/1",
				keyword: "required",
				message: "must have required property 'beforeTask'",
				params: {
					missingProperty: "beforeTask",
				}
			},
			{
				instancePath: "/builder/customTasks/1",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "afterTask",
				}
			},
			{
				instancePath: "/builder/customTasks/2",
				keyword: "type",
				message: "must be object",
				params: {
					type: "object",
				}
			},
			{
				instancePath: "/server/settings/httpPort",
				keyword: "type",
				message: "must be number",
				params: {
					type: "number",
				}
			},
			{
				instancePath: "/server/settings/httpsPort",
				keyword: "type",
				message: "must be number",
				params: {
					type: "number",
				}
			}
		]);
	});
});

project.defineTests(test, assertValidation, "library");

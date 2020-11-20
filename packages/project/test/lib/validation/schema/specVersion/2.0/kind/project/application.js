const test = require("ava");
const AjvCoverage = require("../../../../../../../utils/AjvCoverage");
const {_Validator: Validator} = require("../../../../../../../../lib/validation/validator");
const ValidationError = require("../../../../../../../../lib/validation/ValidationError");
const project = require("../../../../__helper__/project");

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
		includes: ["schema/specVersion/2.0/kind/project/application.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-application"});
	const thresholds = {
		statements: 80,
		branches: 70,
		functions: 100,
		lines: 80
	};
	t.context.ajvCoverage.verify(thresholds);
});

["2.2", "2.1", "2.0"].forEach(function(specVersion) {
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
						"webapp": "my/path"
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
				},
				schemaPath: "#/additionalProperties",
			},
			{
				dataPath: "/resources/configuration",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
				schemaPath: "#/properties/configuration/additionalProperties",
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
				},
				schemaPath: "../project.json#/definitions/resources-configuration-propertiesFileSourceEncoding/enum"
			},
			{
				dataPath: "/resources/configuration/paths",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "app",
				},
				schemaPath: "#/properties/configuration/properties/paths/additionalProperties",
			},
			{
				dataPath: "/resources/configuration/paths/webapp",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string"
				},
				schemaPath: "#/properties/configuration/properties/paths/properties/webapp/type"
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
				},
				schemaPath: "#/properties/configuration/properties/paths/type",
			}
		]);
	});

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
				}
			}
		}, [
			{
				dataPath: "/builder",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "jsdoc"
				},
				schemaPath: "#/additionalProperties"
			},
			{
				dataPath: "/builder/bundles/0/bundleDefinition/sections/0",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "declareModules",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/" +
					"properties/sections/items/additionalProperties",
			},
			{
				dataPath: "/builder/bundles/0/bundleDefinition/sections/0/name",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/" +
					"properties/sections/items/properties/name/type",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition",
				keyword: "required",
				message: "should have required property 'name'",
				params: {
					missingProperty: "name",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/required",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/defaultFileTypes/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/" +
					"properties/defaultFileTypes/items/type",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0",
				keyword: "required",
				message: "should have required property 'mode'",
				params: {
					missingProperty: "mode",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/" +
					"properties/sections/items/required",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0/declareRawModules",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/" +
					"properties/sections/items/properties/declareRawModules/type",
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
					],
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/" +
					"properties/sections/items/properties/mode/enum",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/1/filters",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/" +
					"properties/sections/items/properties/filters/type",
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleOptions/" +
					"additionalProperties",
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/optimize",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleOptions/" +
					"properties/optimize/type",
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/numberOfParts",
				keyword: "type",
				message: "should be number",
				params: {
					type: "number",
				},
				schemaPath:
					"../project.json#/definitions/builder-bundles/items/properties/bundleOptions/" +
					"properties/numberOfParts/type",
			},
			{
				dataPath: "/builder/componentPreload",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "path",
				},
				schemaPath: "../project.json#/definitions/builder-componentPreload/additionalProperties",
			},
			{
				dataPath: "/builder/componentPreload/paths",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
				schemaPath: "../project.json#/definitions/builder-componentPreload/properties/paths/type",
			},
			{
				dataPath: "/builder/componentPreload/namespaces",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
				schemaPath: "../project.json#/definitions/builder-componentPreload/properties/namespaces/type",
			}
		]);
	});
});


project.defineTests(test, assertValidation, "application");

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
		includes: ["schema/specVersion/2.0/kind/project/library.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-library"});
	const thresholds = {
		statements: 80,
		branches: 70,
		functions: 100,
		lines: 80
	};
	t.context.ajvCoverage.verify(thresholds);
});

["2.2", "2.1", "2.0"].forEach(function(specVersion) {
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
				dataPath: "/resources/configuration/propertiesFileSourceEncoding",
				keyword: "enum",
				message: "should be equal to one of the allowed values",
				params: {
					allowedValues: [
						"UTF-8",
						"ISO-8859-1",
					],
				},
				schemaPath: "../project.json#/definitions/resources-configuration-propertiesFileSourceEncoding/enum",
			},
			{
				dataPath: "/resources/configuration/paths",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "webapp",
				},
				schemaPath: "#/properties/configuration/properties/paths/additionalProperties",
			},
			{
				dataPath: "/resources/configuration/paths/src",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
				schemaPath: "#/properties/configuration/properties/paths/properties/src/type",
			},
			{
				dataPath: "/resources/configuration/paths/test",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
				schemaPath: "#/properties/configuration/properties/paths/properties/test/type",
			},
			{
				dataPath: "/builder/resources/excludes",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
				schemaPath: "../project.json#/definitions/builder-resources/properties/excludes/type",
			},
			{
				dataPath: "/builder/jsdoc/excludes",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
				schemaPath: "#/properties/jsdoc/properties/excludes/type",
			},
			{
				dataPath: "/builder/bundles/0/bundleDefinition/sections/0",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "declareModules",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/properties/sections/items/additionalProperties",
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
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/properties/defaultFileTypes/items/type",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0",
				keyword: "required",
				message: "should have required property 'mode'",
				params: {
					missingProperty: "mode",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/properties/sections/items/required",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/0/declareRawModules",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/properties/sections/items/properties/declareRawModules/type",
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
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/properties/sections/items/properties/mode/enum",
			},
			{
				dataPath: "/builder/bundles/1/bundleDefinition/sections/1/filters",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleDefinition/properties/sections/items/properties/filters/type",
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleOptions/additionalProperties",
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/optimize",
				keyword: "type",
				message: "should be boolean",
				params: {
					type: "boolean",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleOptions/properties/optimize/type",
			},
			{
				dataPath: "/builder/bundles/1/bundleOptions/numberOfParts",
				keyword: "type",
				message: "should be number",
				params: {
					type: "number",
				},
				schemaPath: "../project.json#/definitions/builder-bundles/items/properties/bundleOptions/properties/numberOfParts/type",
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
			},
			{
				dataPath: "/builder/customTasks/0",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "afterTask",
				},
				schemaPath: "../project.json#/definitions/customTasks/items/oneOf/0/additionalProperties",
			},
			{
				dataPath: "/builder/customTasks/0",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "beforeTask",
				},
				schemaPath: "../project.json#/definitions/customTasks/items/oneOf/1/additionalProperties",
			},
			{
				dataPath: "/builder/customTasks/1",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "afterTask",
				},
				schemaPath: "../project.json#/definitions/customTasks/items/oneOf/0/additionalProperties",
			},
			{
				dataPath: "/builder/customTasks/1",
				keyword: "required",
				message: "should have required property 'name'",
				params: {
					missingProperty: "name",
				},
				schemaPath: "../project.json#/definitions/customTasks/items/oneOf/0/required",
			},
			{
				dataPath: "/builder/customTasks/1",
				keyword: "required",
				message: "should have required property 'beforeTask'",
				params: {
					missingProperty: "beforeTask",
				},
				schemaPath: "../project.json#/definitions/customTasks/items/oneOf/0/required",
			},
			{
				dataPath: "/builder/customTasks/2",
				keyword: "type",
				message: "should be object",
				params: {
					type: "object",
				},
				schemaPath: "../project.json#/definitions/customTasks/items/oneOf/0/type",
			},
			{
				dataPath: "/server/settings/httpPort",
				keyword: "type",
				message: "should be number",
				params: {
					type: "number",
				},
				schemaPath: "../project.json#/definitions/server/properties/settings/properties/httpPort/type",
			},
			{
				dataPath: "/server/settings/httpsPort",
				keyword: "type",
				message: "should be number",
				params: {
					type: "number",
				},
				schemaPath: "../project.json#/definitions/server/properties/settings/properties/httpsPort/type",
			}
		]);
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
			dataPath: "/builder",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "cachebuster"
			},
			schemaPath: "#/additionalProperties"
		}]);
	});
});

project.defineTests(test, assertValidation, "library");

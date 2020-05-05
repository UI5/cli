/**
 * Common test functionality for framework section in config
 */
module.exports = {
	/**
	 * Executes the tests for different types of kind project, e.g. "application", "library" and "theme-library"
	 *
	 * @param {Function} test ava test
	 * @param {Function} assertValidation assertion function
	 * @param {string} type one of "application", "library" and "theme-library"
	 */
	defineTests: function(test, assertValidation, type) {
		["2.0", "2.1"].forEach((specVersion) => {
			test(`${type} (specVersion ${specVersion}): framework configuration: OpenUI5`, async (t) => {
				const config = {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					},
					"framework": {
						"name": "OpenUI5",
						"version": "1.75.0",
						"libraries": [
							{"name": "sap.ui.core"},
							{"name": "sap.m"},
							{"name": "sap.f", "optional": true},
							{"name": "sap.ui.support", "development": true}
						]
					}
				};
				await assertValidation(t, config);
			});

			test(`${type} (specVersion ${specVersion}): framework configuration: SAPUI5`, async (t) => {
				const config = {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					},
					"framework": {
						"name": "SAPUI5",
						"version": "1.75.0",
						"libraries": [
							{"name": "sap.ui.core"},
							{"name": "sap.m"},
							{"name": "sap.f", "optional": true},
							{"name": "sap.ui.support", "development": true},
							{"name": "sap.ui.comp", "development": true, "optional": false},
							{"name": "sap.fe", "development": false, "optional": true},
							{
								"name": "sap.ui.export",
								"development": false,
								"optional": false
							}
						]
					}
				};
				await assertValidation(t, config);
			});

			test(`${type} (specVersion ${specVersion}): framework configuration: Invalid`, async (t) => {
				const config = {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					},
					"framework": {
						"name": "FooUI5",
						"version": "1.75",
						"libraries": [
							"sap.ui.core",
							{"library": "sap.m"},
							{"name": "sap.f", "optional": "x"},
							{"name": "sap.f", "development": "no"}
						]
					}
				};

				await assertValidation(t, config, [
					{
						dataPath: "/framework/name",
						keyword: "enum",
						message: "should be equal to one of the allowed values",
						params: {
							allowedValues: [
								"OpenUI5",
								"SAPUI5",
							],
						},
						schemaPath: "../project.json#/definitions/framework/properties/name/enum",
					},
					{
						dataPath: "/framework/version",
						keyword: "errorMessage",
						message: "Not a valid version according to the Semantic Versioning specification (https://semver.org/)",
						params: {
							errors: [
								{
									dataPath: "/framework/version",
									keyword: "pattern",
									message:
										"should match pattern \"^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*" +
										"|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+(" +
										"[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$\"",
									params: {
										pattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-]" +
											"[0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(" +
											"?:\\.[0-9a-zA-Z-]+)*))?$",
									},
									schemaPath: "../project.json#/definitions/framework/properties/version/pattern",
								}
							]
						},
						schemaPath: "../project.json#/definitions/framework/properties/version/errorMessage",
					},
					{
						dataPath: "/framework/libraries/0",
						keyword: "type",
						message: "should be object",
						params: {
							type: "object",
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/type"
					},
					{
						dataPath: "/framework/libraries/1",
						keyword: "additionalProperties",
						message: "should NOT have additional properties",
						params: {
							additionalProperty: "library",
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/additionalProperties",
					},
					{
						dataPath: "/framework/libraries/1",
						keyword: "required",
						message: "should have required property 'name'",
						params: {
							missingProperty: "name",
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/required",
					},
					{
						dataPath: "/framework/libraries/2/optional",
						keyword: "type",
						message: "should be boolean",
						params: {
							type: "boolean"
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/properties/optional/type",
					},
					{
						dataPath: "/framework/libraries/3/development",
						keyword: "type",
						message: "should be boolean",
						params: {
							type: "boolean"
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/properties/development/type"
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}): framework configuration: Missing 'name'`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					},
					"framework": {}
				}, [
					{
						dataPath: "/framework",
						keyword: "required",
						message: "should have required property 'name'",
						params: {
							missingProperty: "name"
						},
						schemaPath: "../project.json#/definitions/framework/required",
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}): framework configuration: library with optional and development`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					},
					"framework": {
						"name": "OpenUI5",
						"libraries": [
							{
								name: "sap.ui.lib1",
								development: true,
								optional: true
							},
							{
								// This should only complain about wrong types, not that both are true
								name: "sap.ui.lib2",
								development: "true",
								optional: "true"
							}
						]
					}
				}, [
					{
						dataPath: "/framework/libraries/0",
						keyword: "errorMessage",
						message: "Either \"development\" or \"optional\" can be true, but not both",
						params: {
							errors: [
								{
									dataPath: "/framework/libraries/0",
									keyword: "additionalProperties",
									message: "should NOT have additional properties",
									params: {
										additionalProperty: "development",
									},
									schemaPath: "../project.json#/definitions/framework/properties/libraries/items/then/additionalProperties",
								},
								{
									dataPath: "/framework/libraries/0",
									keyword: "additionalProperties",
									message: "should NOT have additional properties",
									params: {
										additionalProperty: "optional",
									},
									schemaPath: "../project.json#/definitions/framework/properties/libraries/items/then/additionalProperties",
								},
							],
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/then/errorMessage",
					},
					{
						dataPath: "/framework/libraries/1/optional",
						keyword: "type",
						message: "should be boolean",
						params: {
							type: "boolean",
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/properties/optional/type",
					},
					{
						dataPath: "/framework/libraries/1/development",
						keyword: "type",
						message: "should be boolean",
						params: {
							type: "boolean",
						},
						schemaPath: "../project.json#/definitions/framework/properties/libraries/items/properties/development/type",
					},
				]);
			});
		});
	}
};

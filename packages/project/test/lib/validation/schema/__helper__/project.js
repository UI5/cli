const framework = require("./framework");
const customConfiguration = require("./customConfiguration");

/**
 * Common test functionality to be able to run the same tests for different types of kind "project"
 */
module.exports = {
	/**
	 * Executes the tests for different types of kind project,
	 *  e.g. "application", "library", "theme-library" and "module"
	 *
	 * @param {Function} test ava test
	 * @param {Function} assertValidation assertion function
	 * @param {string} type one of "application", "library", "theme-library" and "module"
	 */
	defineTests: function(test, assertValidation, type) {
		// framework tests
		if (["application", "library", "theme-library"].includes(type)) {
			framework.defineTests(test, assertValidation, type);
		}

		// customConfiguration tests
		customConfiguration.defineTests(test, assertValidation, type);

		// version specific tests
		["2.2", "2.1", "2.0"].forEach((specVersion) => {
			// tests for all kinds and version 2.0 and above
			test(`${type} (specVersion ${specVersion}): No metadata`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type
				}, [{
					dataPath: "",
					keyword: "required",
					message: "should have required property 'metadata'",
					params: {
						missingProperty: "metadata",
					},
					schemaPath: "#/required",
				}]);
			});

			test(`${type} (specVersion ${specVersion}): Metadata not type object`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": "foo"
				}, [{
					dataPath: "/metadata",
					keyword: "type",
					message: "should be object",
					params: {
						type: "object",
					},
					schemaPath: "../project.json#/definitions/metadata/type",
				}]);
			});

			test(`${type} (specVersion ${specVersion}): No metadata.name`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {}
				}, [{
					dataPath: "/metadata",
					keyword: "required",
					message: "should have required property 'name'",
					params: {
						missingProperty: "name",
					},
					schemaPath: "../project.json#/definitions/metadata/required",
				}]);
			});

			test(`${type} (specVersion ${specVersion}): Invalid metadata.name`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": {}
					}
				}, [
					{
						dataPath: "/metadata/name",
						keyword: "type",
						message: "should be string",
						params: {
							type: "string"
						},
						schemaPath: "../project.json#/definitions/metadata/properties/name/type",
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}): Invalid metadata.copyright`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "foo",
						"copyright": 123
					}
				}, [
					{
						dataPath: "/metadata/copyright",
						keyword: "type",
						message: "should be string",
						params: {
							type: "string"
						},
						schemaPath: "../project.json#/definitions/metadata/properties/copyright/type",
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}): Additional metadata property`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "foo",
						"copyrihgt": "typo"
					}
				}, [
					{
						dataPath: "/metadata",
						keyword: "additionalProperties",
						message: "should NOT have additional properties",
						params: {
							additionalProperty: "copyrihgt"
						},
						schemaPath: "../project.json#/definitions/metadata/additionalProperties",
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}): metadata.deprecated: true`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"deprecated": true
					}
				});
			});

			test(`${type} (specVersion ${specVersion}): metadata.deprecated: false`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"deprecated": false
					}
				});
			});

			test(`${type} (specVersion ${specVersion}): Invalid metadata.deprecated`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"deprecated": "Yes"
					}
				}, [
					{
						dataPath: "/metadata/deprecated",
						keyword: "type",
						message: "should be boolean",
						params: {
							type: "boolean",
						},
						schemaPath: "../project.json#/definitions/metadata/properties/deprecated/type",
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}): metadata.sapInternal: true`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"sapInternal": true
					}
				});
			});

			test(`${type} (specVersion ${specVersion}): metadata.sapInternal: false`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"sapInternal": false
					}
				});
			});

			test(`${type} (specVersion ${specVersion}): Invalid metadata.sapInternal`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"sapInternal": "Yes"
					}
				}, [
					{
						dataPath: "/metadata/sapInternal",
						keyword: "type",
						message: "should be boolean",
						params: {
							type: "boolean",
						},
						schemaPath: "../project.json#/definitions/metadata/properties/sapInternal/type",
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}): metadata.allowSapInternal: true`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"allowSapInternal": true
					}
				});
			});

			test(`${type} (specVersion ${specVersion}): metadata.allowSapInternal: false`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"allowSapInternal": false
					}
				});
			});

			test(`${type} (specVersion ${specVersion}): Invalid metadata.allowSapInternal`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type,
						"allowSapInternal": "Yes"
					}
				}, [
					{
						dataPath: "/metadata/allowSapInternal",
						keyword: "type",
						message: "should be boolean",
						params: {
							type: "boolean",
						},
						schemaPath: "../project.json#/definitions/metadata/properties/allowSapInternal/type",
					}
				]);
			});

			test(`${type} (specVersion ${specVersion}) Invalid configuration: Additional property`, async (t) => {
				await assertValidation(t, {
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					},
					"notAllowed": true
				}, [{
					dataPath: "",
					keyword: "additionalProperties",
					message: "should NOT have additional properties",
					params: {
						additionalProperty: "notAllowed",
					},
					schemaPath: specVersion !== "2.0" ? "#/then/additionalProperties" : "#/else/additionalProperties",
				}]);
			});
		});
	}
};

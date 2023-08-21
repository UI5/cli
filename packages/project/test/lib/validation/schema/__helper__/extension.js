import SpecificationVersion from "../../../../../lib/specifications/SpecificationVersion.js";
import customConfiguration from "./customConfiguration.js";

/**
 * Common test functionality to be able to run the same tests for different types of kind "extension"
 */
export default {
	/**
	 * Executes the tests for different types of kind extension, e.g. "project-shim", "server-middleware" and "task"
	 *
	 * @param {Function} test ava test
	 * @param {Function} assertValidation assertion function
	 * @param {string} type one of "project-shim", "server-middleware" and "task"
	 * @param {object} additionalConfiguration additional configuration content
	 */
	defineTests: function(test, assertValidation, type, additionalConfiguration) {
		additionalConfiguration = additionalConfiguration || {};
		additionalConfiguration = Object.assign({"kind": "extension"}, additionalConfiguration);

		customConfiguration.defineTests(test, assertValidation, type, additionalConfiguration);

		SpecificationVersion.getVersionsForRange(">=2.0").forEach((specVersion) => {
			test(`kind: extension / type: ${type} basic (${specVersion})`, async (t) => {
				await assertValidation(t, Object.assign({
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					}
				}, additionalConfiguration));
			});

			test(`kind: extension / type: ${type} additionalProperties (${specVersion})`, async (t) => {
				await assertValidation(t, Object.assign({
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": "my-" + type
					},
					"resources": {}
				}, additionalConfiguration), [{
					dataPath: "",
					keyword: "additionalProperties",
					message: "should NOT have additional properties",
					params: {
						"additionalProperty": "resources"
					}
				}]);
			});

			test(`kind: extension / type: ${type} Invalid configuration: Additional property (${specVersion})`,
				async (t) => {
					await assertValidation(t, Object.assign( {
						"specVersion": specVersion,
						"type": type,
						"metadata": {
							"name": "my-" + type
						},
						"notAllowed": true
					}, additionalConfiguration), [{
						dataPath: "",
						keyword: "additionalProperties",
						message: "should NOT have additional properties",
						params: {
							additionalProperty: "notAllowed",
						}
					}]);
				});
		});

		SpecificationVersion.getVersionsForRange("2.0 - 2.6").forEach((specVersion) => {
			test(`kind: extension / type: ${type}: Invalid metadata.name (${specVersion})`, async (t) => {
				await assertValidation(t, Object.assign({
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": {}
					}
				}, additionalConfiguration), [{
					dataPath: "/metadata/name",
					keyword: "type",
					message: "should be string",
					params: {
						type: "string"
					}
				}]);
			});
		});

		SpecificationVersion.getVersionsForRange(">=3.0").forEach((specVersion) => {
			test(`kind: extension / type: ${type}: Invalid metadata.name (${specVersion})`, async (t) => {
				await assertValidation(t, Object.assign({
					"specVersion": specVersion,
					"type": type,
					"metadata": {
						"name": {}
					}
				}, additionalConfiguration), [{
					dataPath: "/metadata/name",
					keyword: "type",
					message: "should be string",
					params: {
						type: "string",
					},
				}, {
					dataPath: "/metadata/name",
					keyword: "errorMessage",
					message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
					params: {
						errors: [{
							dataPath: "/metadata/name",
							keyword: "type",
							message: "should be string",
							params: {
								type: "string",
							}
						}]
					},
				}]);
			});
		});
	}
};

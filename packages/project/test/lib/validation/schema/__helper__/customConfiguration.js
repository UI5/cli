/**
 * Common test functionality for customConfiguration section in config
 */
module.exports = {
	/**
	 * Executes the tests for different kind of projects, e.g. "application", "library", "theme-library" and "module"
	 *
	 * @param {Function} test ava test
	 * @param {Function} assertValidation assertion function
	 * @param {string} type one of "project-shim", "server-middleware" "task",
	 *  "application", "library", "theme-library" and "module"
	 * @param {object} additionalConfiguration additional configuration content
	 */
	defineTests: function(test, assertValidation, type, additionalConfiguration) {
		additionalConfiguration = additionalConfiguration || {};

		// version specific tests for customConfiguration
		test(`${type}: Invalid customConfiguration (specVersion 2.0)`, async (t) => {
			await assertValidation(t, Object.assign({
				"specVersion": "2.0",
				"type": type,
				"metadata": {
					"name": "my-" + type
				},
				"customConfiguration": {}
			}, additionalConfiguration), [
				{
					dataPath: "",
					keyword: "additionalProperties",
					message: "should NOT have additional properties",
					params: {
						additionalProperty: "customConfiguration",
					},
					schemaPath: "#/else/additionalProperties",
				}
			]);
		});

		test(`${type}: Valid customConfiguration (specVersion 2.1)`, async (t) => {
			await assertValidation(t, Object.assign( {
				"specVersion": "2.1",
				"type": type,
				"metadata": {
					"name": "my-" + type
				},
				"customConfiguration": {
					"foo": "bar"
				}
			}, additionalConfiguration));
		});
	}
};

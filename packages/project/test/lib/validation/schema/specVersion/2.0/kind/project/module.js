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
		validationError.errors.forEach((error) => {
			delete error.schemaPath;
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator();
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/2.0/kind/project/module.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-module"});
	const thresholds = {
		statements: 75,
		branches: 65,
		functions: 100,
		lines: 75
	};
	t.context.ajvCoverage.verify(thresholds);
});

["2.3", "2.2", "2.1", "2.0"].forEach((specVersion) => {
	test(`Valid configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"resources": {
				"configuration": {
					"paths": {
						"/resources/my/library/module-xy/": "lib",
						"/resources/my/library/module-xy-min/": "dist"
					}
				}
			}
		});
	});

	test(`No framework configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"framework": {}
		}, [{
			dataPath: "",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				"additionalProperty": "framework"
			}
		}]);
	});

	test(`No propertiesFileSourceEncoding configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF-8"
				}
			}
		}, [{
			dataPath: "/resources/configuration",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				"additionalProperty": "propertiesFileSourceEncoding"
			}
		}]);
	});

	test(`No builder, server configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "module",
			"metadata": {
				"name": "my-module"
			},
			"builder": {},
			"server": {}
		}, [{
			dataPath: "",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				"additionalProperty": "builder"
			}
		}, {
			dataPath: "",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				"additionalProperty": "server"
			}
		}]);
	});
});

project.defineTests(test, assertValidation, "module");

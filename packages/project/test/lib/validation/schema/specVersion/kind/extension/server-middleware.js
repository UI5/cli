import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import AjvCoverage from "../../../../../../utils/AjvCoverage.js";
import {_Validator as Validator} from "../../../../../../../lib/validation/validator.js";
import ValidationError from "../../../../../../../lib/validation/ValidationError.js";
import extension from "../../../__helper__/extension.js";

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
		includes: ["schema/specVersion/kind/extension/server-middleware.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-extension-server-middleware"});
	const thresholds = {
		statements: 70,
		branches: 55,
		functions: 100,
		lines: 70
	};
	t.context.ajvCoverage.verify(thresholds);
});

["3.0"].forEach(function(specVersion) {
	test(`Invalid extension name (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "server-middleware",
			"metadata": {
				"name": "illegal-🦜"
			},
			"middleware": {
				"path": "/bar"
			}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "pattern",
					message: `should match pattern "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$"`,
					params: {
						pattern: "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$",
					}
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "server-middleware",
			"metadata": {
				"name": "a"
			},
			"middleware": {
				"path": "/bar"
			}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "minLength",
					message: "should NOT be shorter than 3 characters",
					params: {
						limit: 3,
					}
				}]
			},
		}]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "extension",
			"type": "server-middleware",
			"metadata": {
				"name": "a".repeat(81)
			},
			"middleware": {
				"path": "/bar"
			}
		}, [{
			dataPath: "/metadata/name",
			keyword: "errorMessage",
			message: `Not a valid extension name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Configuration/#name`,
			params: {
				errors: [{
					dataPath: "/metadata/name",
					keyword: "maxLength",
					message: "should NOT be longer than 80 characters",
					params: {
						limit: 80,
					}
				}]
			},
		}]);
	});
});

const additionalConfiguration = {
	"middleware": {
		"path": "/foo"
	}
};

extension.defineTests(test, assertValidation, "server-middleware", additionalConfiguration);

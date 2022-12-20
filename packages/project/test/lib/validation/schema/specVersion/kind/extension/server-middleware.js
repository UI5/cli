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
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator({Ajv, ajvErrors});
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

const additionalConfiguration = {
	"middleware": {
		"path": "/foo"
	}
};

extension.defineTests(test, assertValidation, "server-middleware", additionalConfiguration);

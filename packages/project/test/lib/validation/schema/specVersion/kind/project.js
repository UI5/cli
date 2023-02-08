import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import AjvCoverage from "../../../../../utils/AjvCoverage.js";
import {_Validator as Validator} from "../../../../../../lib/validation/validator.js";
import ValidationError from "../../../../../../lib/validation/ValidationError.js";

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
	t.context.validator = new Validator({Ajv, ajvErrors, schemaName: "ui5"});
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/kind/project.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project"});
	const thresholds = {
		statements: 85,
		branches: 75,
		functions: 100,
		lines: 90
	};
	t.context.ajvCoverage.verify(thresholds);
});

test("Type application", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "application",
		"metadata": {
			"name": "my-application"
		}
	});
});

test("Type application (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "my-application"
		}
	});
});

test("Type library", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "library",
		"metadata": {
			"name": "my-library"
		}
	});
});

test("Type library (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "library",
		"metadata": {
			"name": "my-library"
		}
	});
});

test("Type theme-library", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "theme-library",
		"metadata": {
			"name": "my-theme-library"
		}
	});
});

test("Type theme-library (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "theme-library",
		"metadata": {
			"name": "my-theme-library"
		}
	});
});

test("Type module", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "module",
		"metadata": {
			"name": "my-module"
		}
	});
});

test("Type module (no kind)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my-module"
		}
	});
});

test("No type", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"metadata": {
			"name": "my-project"
		}
	}, [{
		dataPath: "",
		keyword: "required",
		message: "should have required property 'type'",
		params: {
			missingProperty: "type",
		}
	}]);
});

test("No type, no kind", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"metadata": {
			"name": "my-project"
		}
	}, [{
		dataPath: "",
		keyword: "required",
		message: "should have required property 'type'",
		params: {
			missingProperty: "type",
		}
	}]);
});

test("Invalid type", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"kind": "project",
		"type": "foo",
		"metadata": {
			"name": "my-project"
		}
	}, [{
		dataPath: "/type",
		keyword: "enum",
		message: "should be equal to one of the allowed values",
		params: {
			allowedValues: [
				"application",
				"library",
				"theme-library",
				"module",
			],
		}
	}]);
});

test("No specVersion", async (t) => {
	await assertValidation(t, {
		"kind": "project",
		"type": "library",
		"metadata": {
			"name": "my-library"
		}
	}, [{
		dataPath: "",
		keyword: "required",
		message: "should have required property 'specVersion'",
		params: {
			missingProperty: "specVersion",
		}
	}]);
});

test("Legacy: Special characters in name (application)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "application",
		"metadata": {
			"name": "/".repeat(81)
		}
	});
});

test("Legacy: Special characters in name (library)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "library",
		"metadata": {
			"name": "my/(library)"
		}
	});
});

test("Legacy: Special characters in name (theme-library)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "theme-library",
		"metadata": {
			"name": "my/(theme)-library"
		}
	});
});

test("Legacy: Special characters in name (module)", async (t) => {
	await assertValidation(t, {
		"specVersion": "2.0",
		"type": "module",
		"metadata": {
			"name": "my/(module)"
		}
	});
});

import test from "ava";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import AjvCoverage from "../../../utils/AjvCoverage.js";
import {_Validator as Validator} from "../../../../lib/validation/validator.js";
import ValidationError from "../../../../lib/validation/ValidationError.js";

async function assertValidation(t, config, expectedErrors = undefined) {
	const validation = t.context.validator.validate({
		config,
		project: {id: "my-project"}
	});
	if (expectedErrors) {
		const validationError = await t.throwsAsync(validation, {
			instanceOf: ValidationError,
			name: "ValidationError",
		});
		validationError.errors.forEach((error) => {
			delete error.schemaPath;
			delete error.emUsed;
			if (error.params && Array.isArray(error.params.errors)) {
				error.params.errors.forEach(($) => {
					delete $.schemaPath;
					delete $.emUsed;
				});
			}
		});
		t.deepEqual(validationError.errors, expectedErrors);
	} else {
		await t.notThrowsAsync(validation);
	}
}

test.before((t) => {
	t.context.validator = new Validator({Ajv, ajvErrors, schemaName: "ui5-workspace"});
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/ui5-workspace.json"],
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {
		dir: "coverage/ajv-ui5-workspace",
	});
	const thresholds = {
		statements: 70,
		branches: 65,
		functions: 100,
		lines: 70,
	};
	t.context.ajvCoverage.verify(thresholds);
});

test("Empty config", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: "0.1",
		},
		[
			{
				instancePath: "",
				keyword: "required",
				message: "must have required property 'metadata'",
				params: {
					missingProperty: "metadata",
				},
			},
			{
				instancePath: "",
				keyword: "required",
				message: "must have required property 'dependencyManagement'",
				params: {
					missingProperty: "dependencyManagement",
				},
			},
			{
				instancePath: "/specVersion",
				keyword: "errorMessage",
				message: `Unsupported "specVersion"
Your UI5 CLI installation might be outdated.
Supported specification versions: "workspace/1.0"
For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#workspace-specification-versions`,
				params: {
					errors: [
						{
							instancePath: "/specVersion",
							keyword: "enum",
							message:
								"must be equal to one of the allowed values",
							params: {
								allowedValues: ["workspace/1.0"],
							},
						},
					],
				},
			},
		]
	);
});

test("Valid spec", async (t) => {
	await assertValidation(t, {
		specVersion: "workspace/1.0",
		metadata: {
			name: "test-spec-name",
		},
		dependencyManagement: {
			resolutions: [
				{
					path: "path/to/resource/1",
				},
				{
					path: "path/to/resource/2",
				},
			],
		},
	});
});

test("Missing metadata.name", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: "workspace/1.0",
			metadata: {},
			dependencyManagement: {
				resolutions: [
					{
						path: "path/to/resource/1",
					},
				],
			},
		},
		[
			{
				instancePath: "/metadata",
				keyword: "required",
				message: "must have required property 'name'",
				params: {
					missingProperty: "name",
				},
			},
		]
	);
});

test("Invalid metadata.name: Illegal characters", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: "workspace/1.0",
			metadata: {
				name: "🦭🦭🦭"
			},
			dependencyManagement: {
				resolutions: [
					{
						path: "path/to/resource/1",
					},
				],
			},
		},
		[
			{
				instancePath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							instancePath: "/metadata/name",
							keyword: "pattern",
							message: `must match pattern "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$"`,
							params: {
								pattern: "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$",
							},
						},
					],
				},
			},
		]
	);
});

test("Invalid metadata.name: Too short", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: "workspace/1.0",
			metadata: {
				name: "a"
			},
			dependencyManagement: {
				resolutions: [
					{
						path: "path/to/resource/1",
					},
				],
			},
		},
		[
			{
				instancePath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							instancePath: "/metadata/name",
							keyword: "minLength",
							message: "must NOT have fewer than 3 characters",
							params: {
								limit: 3,
							},
						},
					],
				},
			},
		]
	);
});


test("Invalid metadata.name: Too long", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: "workspace/1.0",
			metadata: {
				name: "b".repeat(81)
			},
			dependencyManagement: {
				resolutions: [
					{
						path: "path/to/resource/1",
					},
				],
			},
		},
		[
			{
				instancePath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							instancePath: "/metadata/name",
							keyword: "maxLength",
							message: "must NOT have more than 80 characters",
							params: {
								limit: 80,
							},
						}
					],
				},
			},
		]
	);
});

test("Invalid fields", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: 12,
			metadata: {
				name: {},
			},
			dependencyManagement: {
				resolutions: {
					path: "path/to/resource/1",
				},
			},
		},
		[
			{
				instancePath: "/specVersion",
				keyword: "errorMessage",
				message: `Unsupported "specVersion"
Your UI5 CLI installation might be outdated.
Supported specification versions: "workspace/1.0"
For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#workspace-specification-versions`,
				params: {
					errors: [
						{
							instancePath: "/specVersion",
							keyword: "enum",
							message:
								"must be equal to one of the allowed values",
							params: {
								allowedValues: ["workspace/1.0"],
							},
						},
					],
				},
			},
			{
				instancePath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							instancePath: "/metadata/name",
							keyword: "type",
							message: "must be string",
							params: {
								type: "string",
							},
						},
					],
				},
			},
			{
				instancePath: "/dependencyManagement/resolutions",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
			{
				instancePath: "/dependencyManagement/resolutions",
				keyword: "additionalProperties",
				message: "must NOT have additional properties",
				params: {
					additionalProperty: "path",
				},
			},
		]
	);
});

test("Invalid types", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: 42,
			metadata: {
				name: 15,
			},
			dependencyManagement: "simple string",
		},
		[
			{
				instancePath: "/specVersion",
				keyword: "errorMessage",
				message: `Unsupported "specVersion"
Your UI5 CLI installation might be outdated.
Supported specification versions: "workspace/1.0"
For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#workspace-specification-versions`,
				params: {
					errors: [
						{
							instancePath: "/specVersion",
							keyword: "enum",
							message:
								"must be equal to one of the allowed values",
							params: {
								allowedValues: ["workspace/1.0"],
							},
						},
					],
				},
			},
			{
				instancePath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://ui5.github.io/cli/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							instancePath: "/metadata/name",
							keyword: "type",
							message: "must be string",
							params: {
								type: "string",
							},
						},
					],
				},
			},
			{
				instancePath: "/dependencyManagement",
				keyword: "type",
				message: "must be object",
				params: {
					type: "object",
				},
			},
		]
	);
});

test("Invalid dependencyManagement", async (t) => {
	await assertValidation(
		t,
		{
			specVersion: "workspace/1.0",
			metadata: {
				name: "test-spec-name",
			},
			dependencyManagement: {
				resolutions: "Invalid type",
			},
		},
		[
			{
				instancePath: "/dependencyManagement/resolutions",
				keyword: "type",
				message: "must be array",
				params: {
					type: "array",
				},
			},
		]
	);

	await assertValidation(
		t,
		{
			specVersion: "workspace/1.0",
			metadata: {
				name: "test-spec-name",
			},
			dependencyManagement: {
				resolutions: ["invalid type"],
			},
		},
		[
			{
				instancePath: "/dependencyManagement/resolutions/0",
				keyword: "type",
				message: "must be object",
				params: {
					type: "object",
				},
			},
		]
	);

	await assertValidation(
		t,
		{
			specVersion: "workspace/1.0",
			metadata: {
				name: "test-spec-name",
			},
			dependencyManagement: {
				resolutions: [{path: 12}],
			},
		},
		[
			{
				instancePath: "/dependencyManagement/resolutions/0/path",
				keyword: "type",
				message: "must be string",
				params: {
					type: "string",
				},
			},
		]
	);
});

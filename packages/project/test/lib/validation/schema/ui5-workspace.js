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
		statements: 85,
		branches: 75,
		functions: 100,
		lines: 85,
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
				dataPath: "/specVersion",
				keyword: "errorMessage",
				message: `Unsupported "specVersion"
Your UI5 CLI installation might be outdated.
Supported specification versions: "workspace/1.0"
For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#workspace-specification-versions`,
				params: {
					errors: [
						{
							dataPath: "/specVersion",
							keyword: "enum",
							message:
								"should be equal to one of the allowed values",
							params: {
								allowedValues: ["workspace/1.0"],
							},
						},
					],
				},
			},
			{
				dataPath: "",
				keyword: "required",
				message: "should have required property 'metadata'",
				params: {
					missingProperty: "metadata",
				},
			},
			{
				dataPath: "",
				keyword: "required",
				message: "should have required property 'dependencyManagement'",
				params: {
					missingProperty: "dependencyManagement",
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
				dataPath: "/metadata",
				keyword: "required",
				message: "should have required property 'name'",
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
				dataPath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							dataPath: "/metadata/name",
							keyword: "pattern",
							message: `should match pattern "^(?:@[0-9a-z-_.]+\\/)?[a-z][0-9a-z-_.]*$"`,
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
				dataPath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							dataPath: "/metadata/name",
							keyword: "minLength",
							message: "should NOT be shorter than 3 characters",
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
				name: "b".repeat(51)
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
				dataPath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							dataPath: "/metadata/name",
							keyword: "maxLength",
							message: "should NOT be longer than 50 characters",
							params: {
								limit: 50,
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
				dataPath: "/specVersion",
				keyword: "errorMessage",
				message: `Unsupported "specVersion"
Your UI5 CLI installation might be outdated.
Supported specification versions: "workspace/1.0"
For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#workspace-specification-versions`,
				params: {
					errors: [
						{
							dataPath: "/specVersion",
							keyword: "enum",
							message:
								"should be equal to one of the allowed values",
							params: {
								allowedValues: ["workspace/1.0"],
							},
						},
					],
				},
			},
			{
				dataPath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							dataPath: "/metadata/name",
							keyword: "type",
							message: "should be string",
							params: {
								type: "string",
							},
						},
					],
				},
			},
			{
				dataPath: "/dependencyManagement/resolutions",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
			{
				dataPath: "/dependencyManagement/resolutions",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
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
				dataPath: "/specVersion",
				keyword: "errorMessage",
				message: `Unsupported "specVersion"
Your UI5 CLI installation might be outdated.
Supported specification versions: "workspace/1.0"
For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#workspace-specification-versions`,
				params: {
					errors: [
						{
							dataPath: "/specVersion",
							keyword: "enum",
							message:
								"should be equal to one of the allowed values",
							params: {
								allowedValues: ["workspace/1.0"],
							},
						},
					],
				},
			},
			{
				dataPath: "/metadata/name",
				keyword: "errorMessage",
				message: "Not a valid workspace name. It must consist of lowercase alphanumeric characters, dash, underscore, and period only. Additionally, it may contain an npm-style package scope. For details, see: https://sap.github.io/ui5-tooling/stable/pages/Workspace/#name",
				params: {
					errors: [
						{
							dataPath: "/metadata/name",
							keyword: "type",
							message: "should be string",
							params: {
								type: "string",
							},
						},
					],
				},
			},
			{
				dataPath: "/dependencyManagement",
				keyword: "type",
				message: "should be object",
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
				dataPath: "/dependencyManagement/resolutions",
				keyword: "type",
				message: "should be array",
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
				dataPath: "/dependencyManagement/resolutions/0",
				keyword: "type",
				message: "should be object",
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
				dataPath: "/dependencyManagement/resolutions/0/path",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
		]
	);
});

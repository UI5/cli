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
	t.context.validator = new Validator();
	t.context.ajvCoverage = new AjvCoverage(t.context.validator.ajv, {
		includes: ["schema/specVersion/2.0/kind/project/theme-library.json"]
	});
});

test.after.always((t) => {
	t.context.ajvCoverage.createReport("html", {dir: "coverage/ajv-project-theme-library"});
	const thresholds = {
		statements: 80,
		branches: 70,
		functions: 100,
		lines: 80
	};
	t.context.ajvCoverage.verify(thresholds);
});


["2.5", "2.4", "2.3", "2.2", "2.1", "2.0"].forEach(function(specVersion) {
	test(`Valid configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "theme-library",
			"metadata": {
				"name": "my-theme-library",
				"copyright": "Copyright goes here"
			},
			"resources": {
				"configuration": {
					"propertiesFileSourceEncoding": "UTF-8",
					"paths": {
						"src": "src/main/uilib",
						"test": "src/test/uilib"
					}
				}
			},
			"builder": {
				"resources": {
					"excludes": [
						"/resources/some/project/name/test_results/**",
						"/test-resources/**",
						"!/test-resources/some/project/name/demo-app/**"
					]
				},
				"customTasks": [
					{
						"name": "custom-task-1",
						"beforeTask": "replaceCopyright",
						"configuration": {
							"some-key": "some value"
						}
					},
					{
						"name": "custom-task-2",
						"afterTask": "custom-task-1",
						"configuration": {
							"color": "blue"
						}
					}
				]
			},
			"server": {
				"settings": {
					"httpPort": 1337,
					"httpsPort": 1443
				},
				"customMiddleware": [
					{
						"name": "myCustomMiddleware",
						"mountPath": "/myapp",
						"afterMiddleware": "compression",
						"configuration": {
							"debug": true
						}
					}
				]
			}
		});
	});

	test(`Invalid builder configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				// cachebuster is only supported for type application
				"cachebuster": {
					"signatureType": "time"
				},
				// jsdoc is only supported for type library
				"jsdoc": {
					"excludes": [
						"some/project/name/thirdparty/**"
					]
				},
				// componentPreload is only supported for types application/library
				"componentPreload": {},
				// libraryPreload is only supported for type library
				"libraryPreload": {},
			}
		}, [{
			dataPath: "/builder",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "cachebuster"
			}
		},
		{
			dataPath: "/builder",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "jsdoc"
			}
		},
		{
			dataPath: "/builder",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "componentPreload"
			}
		},
		{
			dataPath: "/builder",
			keyword: "additionalProperties",
			message: "should NOT have additional properties",
			params: {
				additionalProperty: "libraryPreload"
			}
		}]);
	});
});

["2.5"].forEach(function(specVersion) {
	test(`library (specVersion ${specVersion}): builder/settings/includeDependency*`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"kind": "project",
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"settings": {
					"includeDependency": [
						"sap.a",
						"sap.b"
					],
					"includeDependencyRegExp": [
						".ui.[a-z]+",
						"^sap.[mf]$"
					],
					"includeDependencyTree": [
						"sap.c",
						"sap.d"
					]
				}
			}
		});
	});
	test(`Invalid builder/settings/includeDependency* configuration (specVersion ${specVersion})`, async (t) => {
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"settings": {
					"includeDependency": "a",
					"includeDependencyRegExp": "b",
					"includeDependencyTree": "c"
				}
			}
		}, [
			{
				dataPath: "/builder/settings/includeDependency",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree",
				keyword: "type",
				message: "should be array",
				params: {
					type: "array",
				},
			},
		]);
		await assertValidation(t, {
			"specVersion": specVersion,
			"type": "theme-library",
			"metadata": {
				"name": "com.sap.ui5.test",
				"copyright": "yes"
			},
			"builder": {
				"settings": {
					"includeDependency": [
						true,
						1,
						{}
					],
					"includeDependencyRegExp": [
						true,
						1,
						{}
					],
					"includeDependencyTree": [
						true,
						1,
						{}
					],
					"notAllowed": true
				}
			}
		}, [
			{
				dataPath: "/builder/settings",
				keyword: "additionalProperties",
				message: "should NOT have additional properties",
				params: {
					additionalProperty: "notAllowed",
				},
			},
			{
				dataPath: "/builder/settings/includeDependency/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependency/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependency/2",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyRegExp/2",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree/0",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree/1",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
			{
				dataPath: "/builder/settings/includeDependencyTree/2",
				keyword: "type",
				message: "should be string",
				params: {
					type: "string",
				},
			},
		]);
	});
});

project.defineTests(test, assertValidation, "theme-library");

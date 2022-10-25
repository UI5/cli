import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

function createMockProject(attr) {
	return {
		getName: () => attr.name,
		getSpecVersion: () => attr.specVersion,
		getPath: () => attr.path,
		getFrameworkName: () => attr.frameworkName,
		getFrameworkVersion: () => attr.frameworkVersion,
		getFrameworkDependencies: () => attr.frameworkLibraries || [],
	};
}

test.beforeEach(async (t) => {
	t.context.getRootProjectConfigurationStub = sinon.stub();

	t.context.updateYamlStub = sinon.stub();

	t.context.logWarnStub = sinon.stub();

	t.context.removeFramework = await esmock.p("../../../lib/framework/remove.js", {
		"../../../lib/framework/updateYaml.js": t.context.updateYamlStub,
		"../../../lib/framework/utils.js": {
			getRootProjectConfiguration: t.context.getRootProjectConfigurationStub
		},
		"@ui5/logger": {
			getLogger: sinon.stub().returns({
				warn: t.context.logWarnStub
			})
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.removeFramework);
});

test.serial("Remove with existing libraries in config", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib2"
		}, {
			name: "sap.ui.lib1"
		}]
	});

	getRootProjectConfigurationStub.resolves(project);


	const result = await removeFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {libraries: [{name: "sap.ui.lib2"}]}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Remove with 2 existing libraries in config", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib2"
		}, {
			name: "sap.ui.lib1"
		}]
	});

	getRootProjectConfigurationStub.resolves(project);

	const result = await removeFramework({
		projectGraphOptions,
		libraries: [{
			name: "sap.ui.lib1"
		}, {
			name: "sap.ui.lib2"
		}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {libraries: []}
		}
	}], "updateYaml should be called with expected args");
});


test.serial("Remove with non-existing library in config", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub, logWarnStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib1"
		}, {
			name: "sap.ui.lib2"
		}]
	});

	getRootProjectConfigurationStub.resolves(project);

	await removeFramework({
		projectGraphOptions,
		libraries: [{
			name: "sap.ui.nonexisting"
		}]
	});

	t.is(logWarnStub.callCount, 1, "logger called once");

	t.deepEqual(logWarnStub.getCall(0).args,
		[`Failed to remove framework library sap.ui.nonexisting from project my-project because it is not present.`]);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				libraries: [{
					name: "sap.ui.lib1"
				}, {
					name: "sap.ui.lib2"
				}]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Remove with specVersion 1.0", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "1.0",
		name: "my-project",
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(removeFramework({
		projectGraphOptions
	}));

	t.is(error.message,
		`ui5 remove command requires specVersion "2.0" or higher. Project my-project uses specVersion "1.0"`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");


	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Remove without framework configuration", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(removeFramework({
		projectGraphOptions
	}));

	t.is(error.message, `Project my-project is missing a framework configuration. ` +
		`Please use "ui5 use" to configure a framework and version.`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Remove without framework version configuration", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		frameworkName: "OpenUI5"
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(removeFramework({
		projectGraphOptions
	}));

	t.is(error.message, `Project my-project does not define a framework version configuration. ` +
		`Please use "ui5 use" to configure a version.`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Remove with failing YAML update", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	const yamlUpdateError = new Error("Failed to update YAML file");
	yamlUpdateError.name = "FrameworkUpdateYamlFailed";
	updateYamlStub.rejects(yamlUpdateError);

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib2"
		}, {
			name: "sap.ui.lib1"
		}]
	});

	getRootProjectConfigurationStub.resolves(project);

	const result = await removeFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	});

	t.deepEqual(result, {yamlUpdated: false}, "yamlUpdated should be false");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib2"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Remove with failing YAML update (unexpected error)", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	updateYamlStub.rejects(new Error("Some unexpected error"));

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib2"
		}, {
			name: "sap.ui.lib1"
		}]
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(removeFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	}));

	t.is(error.message, `Some unexpected error`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib2"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Remove with projectGraphOptions.config", async (t) => {
	const {removeFramework, getRootProjectConfigurationStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		config: "/path/to/ui5.yaml"
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib2"
		}, {
			name: "sap.ui.lib1"
		}]
	});

	getRootProjectConfigurationStub.resolves(project);


	const result = await removeFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{config: "/path/to/ui5.yaml"}],
		"generateProjectGraph should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: "/path/to/ui5.yaml",
		data: {
			framework: {libraries: [{name: "sap.ui.lib2"}]}
		}
	}], "updateYaml should be called with expected args");
});

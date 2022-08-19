const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const utils = require("../../../lib/framework/utils");

let addFramework;

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

test.beforeEach((t) => {
	t.context.getRootProjectConfigurationStub = sinon.stub(utils, "getRootProjectConfiguration");
	t.context.getLibraryMetadataStub = sinon.stub();
	t.context.getFrameworkResolverStub = sinon.stub(utils, "getFrameworkResolver").returns(function Resolver() {
		return {
			getLibraryMetadata: t.context.getLibraryMetadataStub
		};
	});

	t.context.updateYamlStub = sinon.stub();
	mock("../../../lib/framework/updateYaml", t.context.updateYamlStub);

	addFramework = mock.reRequire("../../../lib/framework/add");
});

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
});

test.serial("Add without existing libraries in config", async (t) => {
	const {getRootProjectConfigurationStub, getFrameworkResolverStub,
		getLibraryMetadataStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
	});

	getRootProjectConfigurationStub.resolves(project);
	getLibraryMetadataStub.resolves();

	const result = await addFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "OpenUI5",
		"getFrameworkResolver called with expected framework");

	t.is(getLibraryMetadataStub.callCount, 1, "Resolver.getLibraryMetadata should be called once");
	t.deepEqual(getLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Resolver.getLibraryMetadata should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		configPathOverride: undefined,
		project,
		data: {
			framework: {libraries: [{name: "sap.ui.lib1"}]}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Add with existing libraries in config", async (t) => {
	const {getRootProjectConfigurationStub, getFrameworkResolverStub,
		getLibraryMetadataStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib2"
		}, {
			name: "sap.ui.lib1"
		}]
	});

	getRootProjectConfigurationStub.resolves(project);
	getLibraryMetadataStub.resolves();

	const result = await addFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}, {name: "sap.ui.lib3"}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "OpenUI5",
		"getFrameworkResolver called with expected framework");

	t.is(getLibraryMetadataStub.callCount, 2, "Resolver.getLibraryMetadata should be called twice");
	t.deepEqual(getLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Resolver.getLibraryMetadata should be called with expected args on first call");
	t.deepEqual(getLibraryMetadataStub.getCall(1).args, ["sap.ui.lib3"],
		"Resolver.getLibraryMetadata should be called with expected args on second call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		configPathOverride: undefined,
		project,
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.lib1"},
					{name: "sap.ui.lib2"},
					{name: "sap.ui.lib3"}
				]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Add optional with existing libraries in config", async (t) => {
	const {getRootProjectConfigurationStub, getFrameworkResolverStub,
		getLibraryMetadataStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{
			name: "sap.ui.lib2",
			development: true
		}, {
			name: "sap.ui.lib1",
			development: true
		}]
	});

	getRootProjectConfigurationStub.resolves(project);
	getLibraryMetadataStub.resolves();

	const result = await addFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1", optional: true}, {name: "sap.ui.lib3", optional: true}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "OpenUI5",
		"getFrameworkResolver called with expected framework");

	t.is(getLibraryMetadataStub.callCount, 2, "Resolver.getLibraryMetadata should be called twice");
	t.deepEqual(getLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Resolver.getLibraryMetadata should be called with expected args on first call");
	t.deepEqual(getLibraryMetadataStub.getCall(1).args, ["sap.ui.lib3"],
		"Resolver.getLibraryMetadata should be called with expected args on second call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		configPathOverride: undefined,
		project,
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.lib1", optional: true},
					{name: "sap.ui.lib2", development: true},
					{name: "sap.ui.lib3", optional: true}
				]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Add with specVersion 1.0", async (t) => {
	const {
		getRootProjectConfigurationStub, getFrameworkResolverStub, getLibraryMetadataStub,
		updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "1.0",
		name: "my-project",
		path: "my-project-path",
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		projectGraphOptions
	}));

	t.is(error.message,
		`ui5 add command requires specVersion "2.0" or higher. Project my-project uses specVersion "1.0"`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 0, "getFrameworkResolverStub should not be called");
	t.is(getLibraryMetadataStub.callCount, 0, "Resolver.getLibraryMetadata should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add without framework configuration", async (t) => {
	const {
		getRootProjectConfigurationStub, getFrameworkResolverStub, getLibraryMetadataStub,
		updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		projectGraphOptions
	}));

	t.is(error.message, `Project my-project is missing a framework configuration. ` +
		`Please use "ui5 use" to configure a framework and version.`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 0, "getFrameworkResolverStub should not be called");
	t.is(getLibraryMetadataStub.callCount, 0, "Resolver.getLibraryMetadata should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add without framework version configuration", async (t) => {
	const {
		getRootProjectConfigurationStub, getFrameworkResolverStub, getLibraryMetadataStub,
		updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "OpenUI5"
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		projectGraphOptions
	}));

	t.is(error.message, `Project my-project does not define a framework version configuration. ` +
		`Please use "ui5 use" to configure a version.`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 0, "getFrameworkResolverStub should not be called");
	t.is(getLibraryMetadataStub.callCount, 0, "Resolver.getLibraryMetadata should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add with failing library metadata call", async (t) => {
	const {
		getRootProjectConfigurationStub, getFrameworkResolverStub, getLibraryMetadataStub,
		updateYamlStub
	} = t.context;

	getLibraryMetadataStub.rejects(new Error("Failed to load library sap.ui.lib1"));

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "SAPUI5",
		frameworkVersion: "1.76.0"
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	}));

	t.is(error.message, `Failed to find SAPUI5 framework library sap.ui.lib1: Failed to load library sap.ui.lib1`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");

	t.is(getLibraryMetadataStub.callCount, 1, "Resolver.getLibraryMetadata should be called once");
	t.deepEqual(getLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Resolver.getLibraryMetadata should be called with expected args on first call");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add with failing YAML update", async (t) => {
	const {
		getRootProjectConfigurationStub, getFrameworkResolverStub, getLibraryMetadataStub,
		updateYamlStub
	} = t.context;

	const yamlUpdateError = new Error("Failed to update YAML file");
	yamlUpdateError.name = "FrameworkUpdateYamlFailed";
	updateYamlStub.rejects(yamlUpdateError);

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "SAPUI5",
		frameworkVersion: "1.76.0"
	});

	getRootProjectConfigurationStub.resolves(project);

	const result = await addFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	});

	t.deepEqual(result, {yamlUpdated: false}, "yamlUpdated should be false");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");

	t.is(getLibraryMetadataStub.callCount, 1, "Resolver.getLibraryMetadata should be called once");
	t.deepEqual(getLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Resolver.getLibraryMetadata should be called with expected args on first call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		configPathOverride: undefined,
		project,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib1"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Add with failing YAML update (unexpected error)", async (t) => {
	const {
		getRootProjectConfigurationStub, getFrameworkResolverStub, getLibraryMetadataStub,
		updateYamlStub
	} = t.context;

	updateYamlStub.rejects(new Error("Some unexpected error"));

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "SAPUI5",
		frameworkVersion: "1.76.0"
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		projectGraphOptions,
		libraries: [{name: "sap.ui.lib1"}]
	}));

	t.is(error.message, `Some unexpected error`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");

	t.is(getLibraryMetadataStub.callCount, 1, "Resolver.getLibraryMetadata should be called once");
	t.deepEqual(getLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Resolver.getLibraryMetadata should be called with expected args on first call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		configPathOverride: undefined,
		project,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib1"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Add should not modify input parameters", async (t) => {
	const {getRootProjectConfigurationStub, getFrameworkResolverStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "SAPUI5",
		frameworkVersion: "1.76.0",
		frameworkLibraries: [{"name": "sap.ui.lib1"}]
	});

	const libraries = [{name: "sap.ui.lib2"}];

	getRootProjectConfigurationStub.resolves(project);

	await addFramework({
		projectGraphOptions,
		libraries
	});

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");

	t.deepEqual(libraries, [{name: "sap.ui.lib2"}], "libraries array should not be changed");
});

test.serial("Add with projectGraphOptions.config", async (t) => {
	const {
		getRootProjectConfigurationStub, getFrameworkResolverStub, getLibraryMetadataStub,
		updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		config: "/path/to/ui5.yaml"
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "SAPUI5",
		frameworkVersion: "1.76.0"
	});

	getRootProjectConfigurationStub.resolves(project);

	const libraries = [{name: "sap.ui.lib1"}];
	await addFramework({
		projectGraphOptions,
		libraries
	});

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{config: "/path/to/ui5.yaml"}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.is(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");
	t.is(getLibraryMetadataStub.callCount, 1, "Resolver.getLibraryMetadata should be called once");
	t.deepEqual(getLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Resolver.getLibraryMetadata should be called with expected args on first call");
	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");

	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: "/path/to/ui5.yaml",
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib1"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

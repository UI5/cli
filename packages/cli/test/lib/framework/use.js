const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const utils = require("../../../lib/framework/utils");

let useFramework;

function createMockProject(attr) {
	return {
		getName: () => attr.name,
		getSpecVersion: () => attr.specVersion,
		getPath: () => attr.path,
		getFrameworkName: () => attr.frameworkName,
		getFrameworkVersion: () => attr.frameworkVersion,
	};
}

test.beforeEach((t) => {
	t.context.getRootProjectConfigurationStub = sinon.stub(utils, "getRootProjectConfiguration");
	t.context.resolveVersionStub = sinon.stub();
	t.context.getFrameworkResolverStub = sinon.stub(utils, "getFrameworkResolver").returns({
		resolveVersion: t.context.resolveVersionStub
	});
	t.context.updateYamlStub = sinon.stub();
	mock("../../../lib/framework/updateYaml", t.context.updateYamlStub);

	useFramework = mock.reRequire("../../../lib/framework/use");
});

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
});

test.serial("Use with name and version (OpenUI5)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path"
	});

	getRootProjectConfigurationStub.resolves(project);
	resolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "openui5",
			version: "latest"
		}
	});

	t.deepEqual(result, {
		usedFramework: "OpenUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "OpenUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name and version (SAPUI5)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path"
	});

	getRootProjectConfigurationStub.resolves(project);
	resolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "sapui5",
			version: "latest"
		}
	});

	t.deepEqual(result, {
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with version only (OpenUI5)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
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
	resolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: null,
			version: "latest"
		}
	});

	t.deepEqual(result, {
		usedFramework: "OpenUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "OpenUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with version only (SAPUI5)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "SAPUI5"
	});

	getRootProjectConfigurationStub.resolves(project);
	resolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: null,
			version: "latest"
		}
	});

	t.deepEqual(result, {
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name only (no existing framework configuration)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path"
	});

	getRootProjectConfigurationStub.resolves(project);

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "SAPUI5",
			version: null
		}
	});

	t.deepEqual(result, {
		usedFramework: "SAPUI5",
		usedVersion: null,
		yamlUpdated: true
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 0, "getFrameworkResolverStub should not be called");
	t.is(resolveVersionStub.callCount, 0, "Resolver#resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "SAPUI5"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name only (existing framework configuration)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
		frameworkName: "OpenUI5",
		frameworkVersion: "1.76.0"
	});

	getRootProjectConfigurationStub.resolves(project);
	resolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "SAPUI5",
			version: null
		}
	});

	t.deepEqual(result, {
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["1.76.0", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with projectGraphOptions.config", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
	} = t.context;

	const projectGraphOptions = {
		config: "/path/to/ui5.yaml"
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path"
	});

	getRootProjectConfigurationStub.resolves(project);
	resolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "SAPUI5",
			version: "latest"
		}
	});

	t.deepEqual(result, {
		usedFramework: "SAPUI5",
		usedVersion: "1.76.0",
		yamlUpdated: true
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{config: "/path/to/ui5.yaml"}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "SAPUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: "/path/to/ui5.yaml",
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with version only (no framework name)", async (t) => {
	const {getRootProjectConfigurationStub,
		resolveVersionStub, getFrameworkResolverStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: null,
			version: "latest"
		}
	}));

	t.is(error.message, "No framework configuration defined. Make sure to also provide the framework name.");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 0, "getFrameworkResolverStub should not be called");
	t.is(resolveVersionStub.callCount, 0, "Resolver#resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use with invalid name", async (t) => {
	const {getRootProjectConfigurationStub,
		resolveVersionStub, getFrameworkResolverStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "Foo",
			version: "latest"
		}
	}));

	t.is(error.message, "Invalid framework name: Foo");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 0, "getFrameworkResolverStub should not be called");
	t.is(resolveVersionStub.callCount, 0, "Resolver#resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use with specVersion 1.0", async (t) => {
	const {getRootProjectConfigurationStub,
		resolveVersionStub, getFrameworkResolverStub, updateYamlStub} = t.context;

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "1.0",
		name: "my-project",
		path: "my-project-path",
	});

	getRootProjectConfigurationStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "Foo",
			version: "latest"
		}
	}));

	t.is(error.message,
		`ui5 use command requires specVersion "2.0" or higher. Project my-project uses specVersion "1.0"`);

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 0, "getFrameworkResolverStub should not be called");
	t.is(resolveVersionStub.callCount, 0, "Resolver#resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use with name and version (YAML update fails)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
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
	});

	getRootProjectConfigurationStub.resolves(project);
	resolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "openui5",
			version: "latest"
		}
	});

	t.deepEqual(result, {
		usedFramework: "OpenUI5",
		usedVersion: "1.76.0",
		yamlUpdated: false
	}, "useFramework should return expected result object");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "OpenUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name and version (YAML update fails with unexpected error)", async (t) => {
	const {
		getRootProjectConfigurationStub, resolveVersionStub,
		getFrameworkResolverStub, updateYamlStub
	} = t.context;

	updateYamlStub.rejects(new Error("Some unexpected error"));

	const projectGraphOptions = {
		fakeProjectGraphOptions: true
	};

	const project = createMockProject({
		specVersion: "2.0",
		name: "my-project",
		path: "my-project-path",
	});

	getRootProjectConfigurationStub.resolves(project);
	resolveVersionStub.resolves("1.76.0");

	const error = await t.throwsAsync(useFramework({
		projectGraphOptions,
		frameworkOptions: {
			name: "openui5",
			version: "latest"
		}
	}));

	t.is(error.message, "Some unexpected error");

	t.is(getRootProjectConfigurationStub.callCount, 1, "generateProjectGraph should be called once");
	t.deepEqual(getRootProjectConfigurationStub.getCall(0).args, [{fakeProjectGraphOptions: true}],
		"generateProjectGraph should be called with expected args");

	t.is(getFrameworkResolverStub.callCount, 1, "getFrameworkResolverStub should be called once");
	t.deepEqual(getFrameworkResolverStub.getCall(0).args[0], "OpenUI5",
		"getFrameworkResolver called with expected framework");
	t.is(resolveVersionStub.callCount, 1, "Resolver#resolveVersion should be called once");
	t.deepEqual(resolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project-path"}],
		"Resolver#resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		configPathOverride: undefined,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

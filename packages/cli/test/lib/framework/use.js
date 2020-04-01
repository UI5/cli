const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const ui5Project = require("@ui5/project");

let useFramework;

test.beforeEach((t) => {
	t.context.generateDependencyTreeStub = sinon.stub(ui5Project.normalizer, "generateDependencyTree");
	t.context.processTreeStub = sinon.stub(ui5Project.projectPreprocessor, "processTree");
	t.context.Openui5ResolveVersionStub = sinon.stub(ui5Project.ui5Framework.Openui5Resolver, "resolveVersion");
	t.context.Sapui5ResolveVersionStub = sinon.stub(ui5Project.ui5Framework.Sapui5Resolver, "resolveVersion");

	t.context.updateYamlStub = sinon.stub();
	mock("../../../lib/framework/updateYaml", t.context.updateYamlStub);

	useFramework = mock.reRequire("../../../lib/framework/use");
});

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
});

test.serial("Use with name and version (OpenUI5)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Openui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Openui5ResolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 1, "Openui5Resolver.resolveVersion should be called once");
	t.deepEqual(Openui5ResolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project"}],
		"Openui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name and version (SAPUI5)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Sapui5ResolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5ResolveVersionStub.callCount, 1, "Sapui5Resolver.resolveVersion should be called once");
	t.deepEqual(Sapui5ResolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project"}],
		"Sapui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with version only (OpenUI5)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Openui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project",
		framework: {
			name: "OpenUI5"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Openui5ResolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 1, "Openui5Resolver.resolveVersion should be called once");
	t.deepEqual(Openui5ResolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project"}],
		"Openui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with version only (SAPUI5)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project",
		framework: {
			name: "SAPUI5"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Sapui5ResolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5ResolveVersionStub.callCount, 1, "Sapui5Resolver.resolveVersion should be called once");
	t.deepEqual(Sapui5ResolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project"}],
		"Sapui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name only (no existing framework configuration)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5ResolveVersionStub.callCount, 0, "Sapui5Resolver.resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "SAPUI5"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name only (existing framework configuration)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project",
		framework: {
			name: "OpenUI5",
			version: "1.76.0"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Sapui5ResolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5ResolveVersionStub.callCount, 1, "Sapui5Resolver.resolveVersion should be called once");
	t.deepEqual(Sapui5ResolveVersionStub.getCall(0).args, ["1.76.0", {cwd: "my-project"}],
		"Sapui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with normalizerOptions.configPath", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		configPath: "/path/to/ui5.yaml"
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Sapui5ResolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{configPath: "/path/to/ui5.yaml"}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		configPath: "/path/to/ui5.yaml",
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5ResolveVersionStub.callCount, 1, "Sapui5Resolver.resolveVersion should be called once");
	t.deepEqual(Sapui5ResolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project"}],
		"Sapui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with version only (no framework name)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5ResolveVersionStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		normalizerOptions,
		frameworkOptions: {
			name: null,
			version: "latest"
		}
	}));

	t.is(error.message, "No framework configuration defined. Make sure to also provide the framework name.");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 0, "Openui5Resolver.resolveVersion should not be called");
	t.is(Sapui5ResolveVersionStub.callCount, 0, "Sapui5Resolver.resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use with invalid name", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5ResolveVersionStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		normalizerOptions,
		frameworkOptions: {
			name: "Foo",
			version: "latest"
		}
	}));

	t.is(error.message, "Invalid framework name: Foo");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 0, "Openui5Resolver.resolveVersion should not be called");
	t.is(Sapui5ResolveVersionStub.callCount, 0, "Sapui5Resolver.resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use with specVersion 1.0", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5ResolveVersionStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "1.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		normalizerOptions,
		frameworkOptions: {
			name: "Foo",
			version: "latest"
		}
	}));

	t.is(error.message,
		`ui5 use command requires specVersion "2.0" or higher. Project my-project uses specVersion "1.0"`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 0, "Openui5Resolver.resolveVersion should not be called");
	t.is(Sapui5ResolveVersionStub.callCount, 0, "Sapui5Resolver.resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use without framework.name (should actually be validated via ui5-project)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5ResolveVersionStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project",
		framework: {}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		normalizerOptions,
		frameworkOptions: {
			name: "SAPUI5",
			version: "latest"
		}
	}));

	t.is(error.message,
		`Project my-project does not define a framework name configuration`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 0, "Openui5Resolver.resolveVersion should not be called");
	t.is(Sapui5ResolveVersionStub.callCount, 0, "Sapui5Resolver.resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use with invalid framework name in config (should actually be validated via ui5-project)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5ResolveVersionStub, Sapui5ResolveVersionStub, updateYamlStub} = t.context;

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project",
		framework: {
			name: "Foo"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(useFramework({
		normalizerOptions,
		frameworkOptions: {
			name: null,
			version: "latest"
		}
	}));

	t.is(error.message, "Invalid framework.name: Foo");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 0, "Openui5Resolver.resolveVersion should not be called");
	t.is(Sapui5ResolveVersionStub.callCount, 0, "Sapui5Resolver.resolveVersion should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Use with name and version (YAML update fails)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Openui5ResolveVersionStub, updateYamlStub} = t.context;

	const yamlUpdateError = new Error("Failed to update YAML file");
	yamlUpdateError.name = "FrameworkUpdateYamlFailed";
	updateYamlStub.rejects(yamlUpdateError);

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Openui5ResolveVersionStub.resolves("1.76.0");

	const result = await useFramework({
		normalizerOptions,
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

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 1, "Openui5Resolver.resolveVersion should be called once");
	t.deepEqual(Openui5ResolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project"}],
		"Openui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Use with name and version (YAML update fails with unexpected error)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub, Openui5ResolveVersionStub, updateYamlStub} = t.context;

	updateYamlStub.rejects(new Error("Some unexpected error"));

	const normalizerOptions = {
		"fakeNormalizerOption": true
	};

	const tree = {
		dependencies: [{id: "fake-dependency"}]
	};
	const project = {
		specVersion: "2.0",
		metadata: {
			name: "my-project"
		},
		path: "my-project"
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Openui5ResolveVersionStub.resolves("1.76.0");

	const error = await t.throwsAsync(useFramework({
		normalizerOptions,
		frameworkOptions: {
			name: "openui5",
			version: "latest"
		}
	}));

	t.is(error.message, "Some unexpected error");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5ResolveVersionStub.callCount, 1, "Openui5Resolver.resolveVersion should be called once");
	t.deepEqual(Openui5ResolveVersionStub.getCall(0).args, ["latest", {cwd: "my-project"}],
		"Openui5Resolver.resolveVersion should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	}], "updateYaml should be called with expected args");
});

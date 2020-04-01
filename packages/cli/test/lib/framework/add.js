const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const ui5Project = require("@ui5/project");

let addFramework;

test.beforeEach((t) => {
	t.context.generateDependencyTreeStub = sinon.stub(ui5Project.normalizer, "generateDependencyTree");
	t.context.processTreeStub = sinon.stub(ui5Project.projectPreprocessor, "processTree");
	t.context.Openui5GetLibraryMetadataStub = sinon.stub(
		ui5Project.ui5Framework.Openui5Resolver.prototype, "getLibraryMetadata");
	t.context.Sapui5GetLibraryMetadataStub = sinon.stub(
		ui5Project.ui5Framework.Sapui5Resolver.prototype, "getLibraryMetadata");

	t.context.updateYamlStub = sinon.stub();
	mock("../../../lib/framework/updateYaml", t.context.updateYamlStub);

	addFramework = mock.reRequire("../../../lib/framework/add");
});

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
});

test.serial("Add without existing libraries in config", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		framework: {
			name: "OpenUI5",
			version: "1.76.0"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Openui5GetLibraryMetadataStub.resolves();

	const result = await addFramework({
		normalizerOptions,
		libraries: [{name: "sap.ui.lib1"}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5GetLibraryMetadataStub.callCount, 1, "Openui5Resolver.getLibraryMetadata should be called once");
	t.deepEqual(Openui5GetLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Openui5Resolver.getLibraryMetadata should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {libraries: [{name: "sap.ui.lib1"}]}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Add with existing libraries in config", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		framework: {
			name: "OpenUI5",
			version: "1.76.0",
			libraries: [{
				name: "sap.ui.lib2"
			}, {
				name: "sap.ui.lib1"
			}]
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Openui5GetLibraryMetadataStub.resolves();

	const result = await addFramework({
		normalizerOptions,
		libraries: [{name: "sap.ui.lib1"}, {name: "sap.ui.lib3"}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5GetLibraryMetadataStub.callCount, 2, "Openui5Resolver.getLibraryMetadata should be called twice");
	t.deepEqual(Openui5GetLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Openui5Resolver.getLibraryMetadata should be called with expected args on first call");
	t.deepEqual(Openui5GetLibraryMetadataStub.getCall(1).args, ["sap.ui.lib3"],
		"Openui5Resolver.getLibraryMetadata should be called with expected args on second call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
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
	const {generateDependencyTreeStub, processTreeStub,
		Openui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		framework: {
			name: "OpenUI5",
			version: "1.76.0",
			libraries: [{
				name: "sap.ui.lib2",
				development: true
			}, {
				name: "sap.ui.lib1",
				development: true
			}]
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);
	Openui5GetLibraryMetadataStub.resolves();

	const result = await addFramework({
		normalizerOptions,
		libraries: [{name: "sap.ui.lib1", optional: true}, {name: "sap.ui.lib3", optional: true}]
	});

	t.deepEqual(result, {yamlUpdated: true}, "yamlUpdated should be true");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5GetLibraryMetadataStub.callCount, 2, "Openui5Resolver.getLibraryMetadata should be called twice");
	t.deepEqual(Openui5GetLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Openui5Resolver.getLibraryMetadata should be called with expected args on first call");
	t.deepEqual(Openui5GetLibraryMetadataStub.getCall(1).args, ["sap.ui.lib3"],
		"Openui5Resolver.getLibraryMetadata should be called with expected args on second call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
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
	const {generateDependencyTreeStub, processTreeStub,
		Openui5GetLibraryMetadataStub, Sapui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		normalizerOptions
	}));

	t.is(error.message,
		`ui5 add command requires specVersion "2.0" or higher. Project my-project uses specVersion "1.0"`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5GetLibraryMetadataStub.callCount, 0, "Openui5Resolver.getLibraryMetadata should not be called");
	t.is(Sapui5GetLibraryMetadataStub.callCount, 0, "Sapui5Resolver.getLibraryMetadata should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add without framework configuration", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5GetLibraryMetadataStub, Sapui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		normalizerOptions
	}));

	t.is(error.message, `Project my-project is missing a framework configuration. ` +
		`Please use "ui5 use" to configure a framework and version.`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5GetLibraryMetadataStub.callCount, 0, "Openui5Resolver.getLibraryMetadata should not be called");
	t.is(Sapui5GetLibraryMetadataStub.callCount, 0, "Sapui5Resolver.getLibraryMetadata should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add without framework version configuration", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Openui5GetLibraryMetadataStub, Sapui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		framework: {
			name: "OpenUI5"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		normalizerOptions
	}));

	t.is(error.message, `Project my-project does not define a framework version configuration. ` +
		`Please use "ui5 use" to configure a version.`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Openui5GetLibraryMetadataStub.callCount, 0, "Openui5Resolver.getLibraryMetadata should not be called");
	t.is(Sapui5GetLibraryMetadataStub.callCount, 0, "Sapui5Resolver.getLibraryMetadata should not be called");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add with failing library metadata call", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Sapui5GetLibraryMetadataStub, updateYamlStub} = t.context;

	Sapui5GetLibraryMetadataStub.rejects(new Error("Failed to load library sap.ui.lib1"));

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
		framework: {
			name: "SAPUI5",
			version: "1.76.0"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		normalizerOptions,
		libraries: [{name: "sap.ui.lib1"}]
	}));

	t.is(error.message, `Failed to find SAPUI5 framework library sap.ui.lib1: Failed to load library sap.ui.lib1`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5GetLibraryMetadataStub.callCount, 1, "Sapui5Resolver.getLibraryMetadata should be called once");
	t.deepEqual(Sapui5GetLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Sapui5Resolver.getLibraryMetadata should be called with expected args on first call");

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Add with failing YAML update", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Sapui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		framework: {
			name: "SAPUI5",
			version: "1.76.0"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const result = await addFramework({
		normalizerOptions,
		libraries: [{name: "sap.ui.lib1"}]
	});

	t.deepEqual(result, {yamlUpdated: false}, "yamlUpdated should be false");

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5GetLibraryMetadataStub.callCount, 1, "Sapui5Resolver.getLibraryMetadata should be called once");
	t.deepEqual(Sapui5GetLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Sapui5Resolver.getLibraryMetadata should be called with expected args on first call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib1"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Add with failing YAML update (unexpected error)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		Sapui5GetLibraryMetadataStub, updateYamlStub} = t.context;

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
		framework: {
			name: "SAPUI5",
			version: "1.76.0"
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	const error = await t.throwsAsync(addFramework({
		normalizerOptions,
		libraries: [{name: "sap.ui.lib1"}]
	}));

	t.is(error.message, `Some unexpected error`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(Sapui5GetLibraryMetadataStub.callCount, 1, "Sapui5Resolver.getLibraryMetadata should be called once");
	t.deepEqual(Sapui5GetLibraryMetadataStub.getCall(0).args, ["sap.ui.lib1"],
		"Sapui5Resolver.getLibraryMetadata should be called with expected args on first call");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib1"}]
			}
		}
	}], "updateYaml should be called with expected args");
});


test.serial("Add should not modify input parameters", async (t) => {
	const {generateDependencyTreeStub, processTreeStub} = t.context;

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
		framework: {
			name: "SAPUI5",
			version: "1.76.0",
			libraries: [{"name": "sap.ui.lib1"}]
		}
	};

	const libraries = [{name: "sap.ui.lib2"}];

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	await addFramework({
		normalizerOptions,
		libraries
	});

	t.deepEqual(libraries, [{name: "sap.ui.lib2"}], "libraries array should not be changed");
});

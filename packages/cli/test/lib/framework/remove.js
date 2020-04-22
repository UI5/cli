const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const log = require("@ui5/logger");

const ui5Project = require("@ui5/project");

let removeFramework;

test.beforeEach((t) => {
	t.context.generateDependencyTreeStub = sinon.stub(ui5Project.normalizer, "generateDependencyTree");
	t.context.processTreeStub = sinon.stub(ui5Project.projectPreprocessor, "processTree");

	t.context.updateYamlStub = sinon.stub();

	t.context.logWarnStub = sinon.stub();
	sinon.stub(log, "getLogger").returns({
		warn: t.context.logWarnStub
	});


	mock("../../../lib/framework/updateYaml", t.context.updateYamlStub);

	removeFramework = mock.reRequire("../../../lib/framework/remove");
});

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
});

test.serial("Remove with existing libraries in config", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub} = t.context;

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


	const result = await removeFramework({
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

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {libraries: [{name: "sap.ui.lib2"}]}
		}
	}], "updateYaml should be called with expected args");
});


test.serial("Remove with 2 existing libraries in config", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub} = t.context;

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

	const result = await removeFramework({
		normalizerOptions,
		libraries: [{
			name: "sap.ui.lib1"
		}, {
			name: "sap.ui.lib2"
		}]
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

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {libraries: []}
		}
	}], "updateYaml should be called with expected args");
});


test.serial("Remove with non-existing library in config", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub, logWarnStub} = t.context;

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
				name: "sap.ui.lib1"
			}, {
				name: "sap.ui.lib2"
			}]
		}
	};

	generateDependencyTreeStub.resolves(tree);
	processTreeStub.resolves(project);

	await removeFramework({
		normalizerOptions,
		libraries: [{
			name: "sap.ui.nonexisting"
		}]
	});

	t.is(logWarnStub.callCount, 1, "logger called once");

	t.deepEqual(logWarnStub.getCall(0).args,
		[`Failed to remove framework library sap.ui.nonexisting from project my-project because it is not present.`]);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
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
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub} = t.context;

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

	const error = await t.throwsAsync(removeFramework({
		normalizerOptions
	}));

	t.is(error.message,
		`ui5 remove command requires specVersion "2.0" or higher. Project my-project uses specVersion "1.0"`);

	t.is(generateDependencyTreeStub.callCount, 1, "normalizer.generateDependencyTree should be called once");
	t.deepEqual(generateDependencyTreeStub.getCall(0).args, [{"fakeNormalizerOption": true}],
		"normalizer.generateDependencyTree should be called with expected args");

	t.is(processTreeStub.callCount, 1, "projectPreprocessor.processTree should be called once");
	t.deepEqual(processTreeStub.getCall(0).args, [{
		dependencies: []
	}],
	"projectPreprocessor.processTree should be called with expected args");


	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Remove without framework configuration", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub} = t.context;

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

	const error = await t.throwsAsync(removeFramework({
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

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Remove without framework version configuration", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub} = t.context;

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

	const error = await t.throwsAsync(removeFramework({
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

	t.is(updateYamlStub.callCount, 0, "updateYaml should not be called");
});

test.serial("Remove with failing YAML update", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub} = t.context;

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

	const result = await removeFramework({
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

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib2"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

test.serial("Remove with failing YAML update (unexpected error)", async (t) => {
	const {generateDependencyTreeStub, processTreeStub,
		updateYamlStub} = t.context;

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

	const error = await t.throwsAsync(removeFramework({
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

	t.is(updateYamlStub.callCount, 1, "updateYaml should be called once");
	t.deepEqual(updateYamlStub.getCall(0).args, [{
		project,
		data: {
			framework: {
				libraries: [{name: "sap.ui.lib2"}]
			}
		}
	}], "updateYaml should be called with expected args");
});

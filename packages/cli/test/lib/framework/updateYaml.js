const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const fs = require("fs");
const path = require("path");

let updateYaml;

test.beforeEach((t) => {
	t.context.fsReadFileStub = sinon.stub(fs, "readFile");
	t.context.fsWriteFileStub = sinon.stub(fs, "writeFile").yieldsAsync(null);

	updateYaml = mock.reRequire("../../../lib/framework/updateYaml");
});

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
});

test.serial("Should update single document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
---
metadata:
  name: my-project
framework:
  name: SAPUI5
  version: 1.0.0
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
---
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
`, "writeFile should be called with expected content");
});

test.serial("Should update first document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
specVersion: "2.0"
metadata:
  name: my-project
framework:
  name: SAPUI5
  version: 1.0.0
---
specVersion: "1.0"
kind: extension
metadata:
  name: my-extension
type: project-shim
shims:
  configurations: {}
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
specVersion: "2.0"
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
---
specVersion: "1.0"
kind: extension
metadata:
  name: my-extension
type: project-shim
shims:
  configurations: {}
`, "writeFile should be called with expected content");
});


test.serial("Should update second document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
specVersion: "1.0"
kind: extension
metadata:
  name: my-extension
type: project-shim
shims:
  configurations: {}
framework:
  name: SAPUI5
  version: 1.0.0
---
specVersion: "2.0"
metadata:
  name: my-project
framework:
  name: SAPUI5
  version: 1.0.0
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
specVersion: "1.0"
kind: extension
metadata:
  name: my-extension
type: project-shim
shims:
  configurations: {}
framework:
  name: SAPUI5
  version: 1.0.0
---
specVersion: "2.0"
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
`, "writeFile should be called with expected content");
});

test.serial("Should add new object with one property to document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "OpenUI5"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
`, "writeFile should be called with expected content");
});

test.serial("Should add new object with two properties to document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
`, "writeFile should be called with expected content");
});

test.serial("Should add version property to document and keep name", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: "OpenUI5"
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: "OpenUI5"
  version: "1.76.0"
`, "writeFile should be called with expected content");
});

test.serial("Should add name property to document and keep version", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  version: 1.76.0
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "OpenUI5",
				version: "1.76.0"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  version: 1.76.0
  name: OpenUI5
`, "writeFile should be called with expected content");
});

test.serial("Should add new array to document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m
`, "writeFile should be called with expected content");
});

test.serial("Should add new array to document with empty array", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    []
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m

`, "writeFile should be called with expected content");
});

test.serial("Should remove array from document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m

`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: []
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
`, "writeFile should be called with expected content");
});

test.serial("Should remove array from document with content below", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m
resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: []
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8
`, "writeFile should be called with expected content");
});

test.serial("Should add new array to document with content below", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m
resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8
`, "writeFile should be called with expected content");
});

test.serial("Should add new array to document with content separated by empty line below", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"

resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m

resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8
`, "writeFile should be called with expected content");
});

test.serial("Should add new array element to document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m
`, "writeFile should be called with expected content");
});

test.serial("Should add new array elements to document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"},
					{name: "sap.ui.layout"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m
    - name: sap.ui.layout
`, "writeFile should be called with expected content");
});

test.serial("Should add new array elements to document with content below", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"},
					{name: "sap.ui.layout"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m
    - name: sap.ui.layout
resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8
`, "writeFile should be called with expected content");
});


test.serial("Should add new array elements to document with content separated by empty line below", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core

resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core"},
					{name: "sap.m"},
					{name: "sap.ui.layout"}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
    - name: sap.m
    - name: sap.ui.layout
resources:
  configuration:
    propertiesFileSourceEncoding: UTF-8
`, "writeFile should be called with expected content");
});

test.serial("Should add new array elements with multiple properties to document", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
      development: true
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				libraries: [
					{name: "sap.ui.core", optional: true},
					{name: "sap.m", optional: true},
					{name: "sap.ui.layout", optional: true}
				]
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  version: "1.76.0"
  libraries:
    - name: sap.ui.core
      optional: true
    - name: sap.m
      optional: true
    - name: sap.ui.layout
      optional: true
`, "writeFile should be called with expected content");
});

test.serial("Should validate YAML before writing file", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework: { name: "SAPUI5" }
`); // Using JSON object notation is currently not supported

	const error = await t.throwsAsync(updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				name: "SAPUI5",
				version: "1.76.0"
			}
		}
	}));

	t.is(error.message,
		`Failed to update YAML file: bad indentation of a mapping entry (5:14)\n` +
		`\n` +
		` 2 | metadata:\n` +
		` 3 |   name: my-project\n` +
		` 4 | framework: { name: "SAPUI5" }\n` +
		` 5 |              version: "1.76.0"\n` +
		`------------------^`
	);
	t.is(t.context.fsWriteFileStub.callCount, 0, "fs.writeFile should not be called");
});

test.serial("Should throw error when project document can't be found", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project-1
---
metadata:
  name: my-project-2
`);

	const error = await t.throwsAsync(updateYaml({
		project: {
			path: "my-project",
			configPath: "ui5.yaml",
			metadata: {"name": "my-project-3"}
		},
		data: {}
	}));

	t.is(error.message, "Could not find project with name my-project-3 in YAML: ui5.yaml");
	t.is(t.context.fsWriteFileStub.callCount, 0, "fs.writeFile should not be called");
});

test.serial("Should add version property to object", async (t) => {
	t.context.fsReadFileStub.yieldsAsync(null, `
metadata:
  name: my-project
framework:
  name: OpenUI5
  libraries:
    - name: sap.ui.core
something: else
`);

	await updateYaml({
		project: {
			path: "my-project",
			metadata: {"name": "my-project"}
		},
		data: {
			framework: {
				version: "1.85.0"
			}
		}
	});

	t.is(t.context.fsWriteFileStub.callCount, 1, "fs.writeFile should be called once");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[0], path.join("my-project", "ui5.yaml"),
		"writeFile should be called with expected path");
	t.deepEqual(t.context.fsWriteFileStub.getCall(0).args[1], `
metadata:
  name: my-project
framework:
  name: OpenUI5
  libraries:
    - name: sap.ui.core
  version: "1.85.0"
something: else
`, "writeFile should be called with expected content");
});

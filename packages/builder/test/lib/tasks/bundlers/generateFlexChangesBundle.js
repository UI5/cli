import test from "ava";
import sinon from "sinon";
import generateFlexChangesBundle from "../../../../lib/tasks/bundlers/generateFlexChangesBundle.js";


function createPlaceholderResource(content, path = "unknown") {
	let currentContent = content;
	return {
		name: "file",
		getBuffer: async () => JSON.stringify(currentContent),
		getString: () => JSON.stringify(currentContent),
		setString: (string) => {
			currentContent = JSON.parse(string);
		},
		getPath: () => path
	};
}

function createPlaceholderWorkspace(changes, manifest, flexBundle) {
	return {
		byGlob: async () => changes.map(createPlaceholderResource),
		byPath: async (path) => {
			if ( path.includes("manifest.json") ) {
				return createPlaceholderResource(manifest);
			} else if ( path.includes("flexibility-bundle.json")) {
				return createPlaceholderResource(flexBundle);
			}
		},
		write: () => {
			throw new Error("Function 'write' is not implemented");
		}
	};
}

["1.120.0", ["1.120.0", "2.0.0"]].forEach((minVersion) => {
	test.serial(`execute flexChangeBundler with the minVersion: ${minVersion}`, async (t) => {
		const changeList = [
			{
				"fileName": "id_1504764957625_7_rename1",
				"fileType": "change",
				"changeType": "rename",
				"reference": "rta.performance.Component",
				"packageName": "$TMP",
				"content": {
					"originalControlType": "sap.m.Label"
				},
				"selector": {
					"id": "initialLabel",
					"idIsLocal": false
				},
				"layer": "CUSTOMER",
				"texts": {
					"newText": {
						"value": "rename_0",
						"type": "XFLD"
					}
				},
				"namespace": "apps/MyComponent/changes/",
				"creation": "2017-10-06T11:54:55.238Z",
				"originalLanguage": "EN",
				"conditions": {},
				"context": "",
				"support": {
					"generator": "Change.createInitialFileContent",
					"service": "",
					"user": "",
					"sapui5Version": "1.51.0-SNAPSHOT"
				},
				"dependentSelector": {},
				"validAppVersions": {
					"creation": "1.0.0",
					"from": "1.0.0",
					"to": "1.0.0"
				}
			}
		];
		const existingChangeList = [
			{
				"fileName": "id_1504764957630_7_rename2",
				"fileType": "change",
				"changeType": "rename",
				"reference": "rta.performance.Component",
				"packageName": "$TMP",
				"content": {
					"originalControlType": "sap.m.Label"
				},
				"selector": {
					"id": "initialLabel",
					"idIsLocal": false
				},
				"layer": "USER",
				"texts": {
					"newText": {
						"value": "rename_5",
						"type": "XFLD"
					}
				},
				"namespace": "apps/MyComponent/changes/",
				"creation": "2017-09-01T11:54:55.238Z",
				"originalLanguage": "EN",
				"conditions": {},
				"context": "",
				"support": {
					"generator": "Change.createInitialFileContent",
					"service": "",
					"user": "",
					"sapui5Version": "1.51.0-SNAPSHOT"
				},
				"dependentSelector": {},
				"validAppVersions": {
					"creation": "1.0.0",
					"from": "1.0.0",
					"to": "1.0.0"
				}
			}
		];
		const manifest = {
			"sap.ui5": {
				dependencies: {
					minUI5Version: minVersion
				}
			}
		};

		const flexBundle = {
			"changes": existingChangeList,
			"compVariants": [],
			"variantChanges": [],
			"variantDependentControlChanges": [],
			"variantManagementChanges": [],
			"variants": []
		};

		const flexBundleMerge = {
			"changes": existingChangeList.concat(changeList),
			"compVariants": [],
			"variantChanges": [],
			"variantDependentControlChanges": [],
			"variantManagementChanges": [],
			"variants": []
		};

		const placeholderWorkspace = createPlaceholderWorkspace(changeList, manifest, flexBundle);
		const stub = sinon.stub(placeholderWorkspace, "write").returnsArg(0);
		await generateFlexChangesBundle({
			workspace: placeholderWorkspace,
			taskUtil: false,
			options: {
				projectNamespace: "mypath"
			}
		});

		const content = JSON.parse(await stub.getCall(0).args[0].getString());
		t.deepEqual(content, flexBundleMerge, "Result must contain the same content");

		const path = await stub.getCall(0).args[0].getPath();
		t.is(path, "/resources/mypath/changes/flexibility-bundle.json");

		const writtenManifest = JSON.parse(await stub.getCall(1).args[0].getString());
		t.deepEqual(writtenManifest, {
			"sap.ui5": {
				dependencies: {
					minUI5Version: minVersion,
					libs: {
						"sap.ui.fl": {}
					}
				},
				flexBundle: true
			}
		}, "Result must contain the same content");
	});
});

["1.70.0", ["1.70.0", "2.0.0"]].forEach((minVersion) => {
	test.serial(`execute flexChangeBundler with the minVersion < 1.73: ${minVersion}`, async (t) => {
		const manifest = {
			"sap.ui5": {
				dependencies: {
					minUI5Version: minVersion
				}
			}
		};

		const changeList = [
			{
				"fileName": "id_1504764957625_7_rename1",
				"fileType": "change",
				"changeType": "rename",
				"reference": "rta.performance.Component",
				"packageName": "$TMP",
				"content": {
					"originalControlType": "sap.m.Label"
				},
				"selector": {
					"id": "initialLabel",
					"idIsLocal": false
				},
				"layer": "CUSTOMER",
				"texts": {
					"newText": {
						"value": "rename_0",
						"type": "XFLD"
					}
				},
				"namespace": "apps/MyComponent/changes/",
				"creation": "2017-10-06T11:54:55.238Z",
				"originalLanguage": "EN",
				"conditions": {},
				"context": "",
				"support": {
					"generator": "Change.createInitialFileContent",
					"service": "",
					"user": "",
					"sapui5Version": "1.51.0-SNAPSHOT"
				},
				"dependentSelector": {},
				"validAppVersions": {
					"creation": "1.0.0",
					"from": "1.0.0",
					"to": "1.0.0"
				}
			}
		];

		const flexBundle = {
			"changes": [],
			"compVariants": [],
			"variantChanges": [],
			"variantDependentControlChanges": [],
			"variantManagementChanges": [],
			"variants": []
		};

		const placeholderWorkspace = createPlaceholderWorkspace(changeList, manifest, flexBundle);
		const stub = sinon.stub(placeholderWorkspace, "write").returnsArg(0);

		await generateFlexChangesBundle({
			workspace: placeholderWorkspace,
			taskUtil: false,
			options: {
				projectNamespace: "mypath"
			}
		});

		const content = JSON.parse(await stub.getCall(0).args[0].getString());
		t.deepEqual(content, changeList, "Result must contain the same content");

		const path = await stub.getCall(0).args[0].getPath();
		t.is(path, "/resources/mypath/changes/changes-bundle.json");
	});
});

test("flexBundle property set to true when bundle is created", async (t) => {
	const manifest = {
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"dependencies": {
				"minUI5Version": "1.75.0"
			}
		}
	};

	const changeList = [{
		"fileName": "test_change",
		"fileType": "change",
		"changeType": "rename",
		"reference": "test.Component",
		"content": {},
		"selector": {"id": "testId"},
		"layer": "CUSTOMER"
	}];

	const placeholderWorkspace = {
		byGlob: async () => changeList.map(createPlaceholderResource),
		byPath: async (path) => {
			if (path.includes("manifest.json")) {
				return createPlaceholderResource(manifest, path);
			} else if (path.includes("flexibility-bundle.json")) {
				// Return non-null to indicate file exists
				return createPlaceholderResource({}, path);
			}
			return null;
		},
		write: sinon.stub().returnsArg(0)
	};

	await generateFlexChangesBundle({
		workspace: placeholderWorkspace,
		taskUtil: false,
		options: {
			projectNamespace: "sap/ui/demo/app"
		}
	});

	// Check that manifest was updated with flexBundle: true
	t.true(placeholderWorkspace.write.callCount > 0, "workspace.write should be called");

	// Find the manifest write call
	let manifestCall;
	for (let i = 0; i < placeholderWorkspace.write.callCount; i++) {
		const call = placeholderWorkspace.write.getCall(i);
		const path = call.args[0].getPath ? await call.args[0].getPath() : "unknown";
		if (path && path.includes("manifest.json")) {
			manifestCall = call;
			break;
		}
	}

	t.truthy(manifestCall, "Manifest should be written");
	const manifestContent = JSON.parse(await manifestCall.args[0].getString());

	t.truthy(manifestContent["sap.ui5"], "sap.ui5 section should exist");
	t.true(manifestContent["sap.ui5"].flexBundle, "flexBundle should be set to true when bundle is created");
	t.deepEqual(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {}, "sap.ui.fl dependency should be added");
});

test("flexBundle property set to true when bundle is created even without existing flexibility-bundle.json",
	async (t) => {
		const manifest = {
			"_version": "1.58.0",
			"sap.app": {
				"id": "sap.ui.demo.app",
				"type": "application"
			},
			"sap.ui5": {
				"dependencies": {
					"minUI5Version": "1.75.0"
				}
			}
		};

		const changeList = [{
			"fileName": "test_change",
			"fileType": "change",
			"changeType": "rename",
			"reference": "test.Component",
			"content": {},
			"selector": {"id": "testId"},
			"layer": "CUSTOMER"
		}];

		const placeholderWorkspace = {
			byGlob: async () => changeList.map(createPlaceholderResource),
			byPath: async (path) => {
				if (path.includes("manifest.json")) {
					return createPlaceholderResource(manifest, path);
				} else if (path.includes("flexibility-bundle.json")) {
					// Return null to indicate file does not exist
					return null;
				}
				return null;
			},
			write: sinon.stub().returnsArg(0)
		};

		await generateFlexChangesBundle({
			workspace: placeholderWorkspace,
			taskUtil: false,
			options: {
				projectNamespace: "sap/ui/demo/app"
			}
		});

		// Check that manifest was updated with flexBundle: true
		t.true(placeholderWorkspace.write.callCount > 0, "workspace.write should be called");

		// Find the manifest write call
		let manifestCall;
		for (let i = 0; i < placeholderWorkspace.write.callCount; i++) {
			const call = placeholderWorkspace.write.getCall(i);
			const path = call.args[0].getPath ? await call.args[0].getPath() : "unknown";
			if (path && path.includes("manifest.json")) {
				manifestCall = call;
				break;
			}
		}

		t.truthy(manifestCall, "Manifest should be written");
		const manifestContent = JSON.parse(await manifestCall.args[0].getString());

		t.truthy(manifestContent["sap.ui5"], "sap.ui5 section should exist");
		t.true(manifestContent["sap.ui5"].flexBundle, "flexBundle should be set to true when bundle is created");
		t.deepEqual(
			manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {}, "sap.ui.fl dependency should be added");
	});

test("sap.ui.fl dependency disables lazy loading if already present", async (t) => {
	const manifest = {
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"dependencies": {
				"minUI5Version": "1.75.0",
				"libs": {
					"sap.ui.fl": {
						"lazy": true
					}
				}
			}
		}
	};

	const changeList = [{
		"fileName": "test_change",
		"fileType": "change",
		"changeType": "rename",
		"reference": "test.Component",
		"content": {},
		"selector": {"id": "testId"},
		"layer": "CUSTOMER"
	}];

	const placeholderWorkspace = {
		byGlob: async () => changeList.map((change) => createPlaceholderResource(change)),
		byPath: async (path) => {
			if (path.includes("manifest.json")) {
				return createPlaceholderResource(manifest, path);
			} else if (path.includes("flexibility-bundle.json")) {
				return createPlaceholderResource({}, path);
			}
			return null;
		},
		write: sinon.stub().returnsArg(0)
	};

	await generateFlexChangesBundle({
		workspace: placeholderWorkspace,
		taskUtil: false,
		options: {
			projectNamespace: "sap/ui/demo/app"
		}
	});

	// Find the manifest write call
	let manifestCall;
	for (let i = 0; i < placeholderWorkspace.write.callCount; i++) {
		const call = placeholderWorkspace.write.getCall(i);
		const path = call.args[0].getPath ? await call.args[0].getPath() : "unknown";
		if (path && path.includes("manifest.json")) {
			manifestCall = call;
			break;
		}
	}

	t.truthy(manifestCall, "Manifest should be written");
	const manifestContent = JSON.parse(await manifestCall.args[0].getString());

	const sapUiFlDependency = manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"];
	t.false(sapUiFlDependency.lazy, "sap.ui.fl lazy loading should be disabled when bundle is created");
});

test("manifest updated with flexBundle false when no changes exist", async (t) => {
	const manifest = {
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"dependencies": {
				"minUI5Version": "1.75.0"
			}
		}
	};

	const placeholderWorkspace = {
		byGlob: async () => [], // No changes
		byPath: async (path) => {
			if (path.includes("manifest.json")) {
				return createPlaceholderResource(manifest, path);
			} else if (path.includes("flexibility-bundle.json")) {
				// Even if file exists, task won't run without changes
				return createPlaceholderResource({}, path);
			}
			return null;
		},
		write: sinon.stub().returnsArg(0)
	};

	await generateFlexChangesBundle({
		workspace: placeholderWorkspace,
		taskUtil: false,
		options: {
			projectNamespace: "sap/ui/demo/app"
		}
	});

	// Manifest should always be updated, even when no changes exist
	t.is(placeholderWorkspace.write.callCount, 1, "workspace.write should be called to update manifest");

	// Find the manifest write call
	let manifestCall;
	for (let i = 0; i < placeholderWorkspace.write.callCount; i++) {
		const call = placeholderWorkspace.write.getCall(i);
		const path = call.args[0].getPath ? await call.args[0].getPath() : "unknown";
		if (path && path.includes("manifest.json")) {
			manifestCall = call;
			break;
		}
	}

	t.truthy(manifestCall, "Manifest should be written");
	const manifestContent = JSON.parse(await manifestCall.args[0].getString());

	t.truthy(manifestContent["sap.ui5"], "sap.ui5 section should exist");
	t.false(manifestContent["sap.ui5"].flexBundle, "flexBundle should be set to false when no bundle is created");
	t.is(manifestContent["sap.ui5"].dependencies.libs, undefined,
		"sap.ui.fl dependency should not be added when no bundle is created");
});

test("flexBundle property overrides existing value when bundle is created", async (t) => {
	const manifest = {
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": {
			"dependencies": {
				"minUI5Version": "1.75.0"
			},
			"flexBundle": false // Pre-existing value that should be overridden
		}
	};

	const changeList = [{
		"fileName": "test_change",
		"fileType": "change",
		"changeType": "rename",
		"reference": "test.Component",
		"content": {},
		"selector": {"id": "testId"},
		"layer": "CUSTOMER"
	}];

	const placeholderWorkspace = {
		byGlob: async () => changeList.map((change) => createPlaceholderResource(change)),
		byPath: async (path) => {
			if (path.includes("manifest.json")) {
				return createPlaceholderResource(manifest, path);
			} else if (path.includes("flexibility-bundle.json")) {
				// Return non-null to indicate file exists
				return createPlaceholderResource({}, path);
			}
			return null;
		},
		write: sinon.stub().returnsArg(0)
	};

	await generateFlexChangesBundle({
		workspace: placeholderWorkspace,
		taskUtil: false,
		options: {
			projectNamespace: "sap/ui/demo/app"
		}
	});

	// Check that manifest was updated and existing flexBundle: false was overridden to true
	let manifestCall;
	for (let i = 0; i < placeholderWorkspace.write.callCount; i++) {
		const call = placeholderWorkspace.write.getCall(i);
		const path = call.args[0].getPath ? await call.args[0].getPath() : "unknown";
		if (path && path.includes("manifest.json")) {
			manifestCall = call;
			break;
		}
	}

	t.truthy(manifestCall, "Manifest should be written");
	const manifestContent = JSON.parse(await manifestCall.args[0].getString());

	t.true(manifestContent["sap.ui5"].flexBundle, "flexBundle should be overridden to true when bundle is created");
	t.deepEqual(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {}, "sap.ui.fl dependency should be added");
});

test("task does not fail when manifest.json is missing and no changes exist", async (t) => {
	const placeholderWorkspace = {
		byGlob: async () => [], // No changes
		byPath: async (path) => {
			// Return null for all paths (no manifest.json, no flexibility-bundle.json)
			return null;
		},
		write: sinon.stub().returnsArg(0)
	};

	// This should not throw an error
	await t.notThrowsAsync(async () => {
		await generateFlexChangesBundle({
			workspace: placeholderWorkspace,
			taskUtil: false,
			options: {
				projectNamespace: "sap/ui/demo/app"
			}
		});
	}, "Task should not fail when manifest.json is missing");

	// No write calls should have been made since there's no manifest and no changes
	t.is(placeholderWorkspace.write.callCount, 0, "workspace.write should not be called when manifest is missing");
});

test("task does not fail when manifest.json is missing but changes exist", async (t) => {
	const changeList = [{
		"fileName": "test_change",
		"fileType": "change",
		"changeType": "rename",
		"reference": "test.Component",
		"content": {},
		"selector": {"id": "testId"},
		"layer": "CUSTOMER"
	}];

	const placeholderWorkspace = {
		byGlob: async () => changeList.map((change) => createPlaceholderResource(change)),
		byPath: async (path) => {
			// Return null for all paths (no manifest.json, no flexibility-bundle.json)
			return null;
		},
		write: sinon.stub().returnsArg(0)
	};

	// This should not throw an error
	await t.notThrowsAsync(async () => {
		await generateFlexChangesBundle({
			workspace: placeholderWorkspace,
			taskUtil: false,
			options: {
				projectNamespace: "sap/ui/demo/app"
			}
		});
	}, "Task should not fail when manifest.json is missing even with changes");

	// Verify the task created the flexibility-bundle.json
	const writeCalls = [];
	for (let i = 0; i < placeholderWorkspace.write.callCount; i++) {
		const call = placeholderWorkspace.write.getCall(i);
		const path = call.args[0].getPath ? await call.args[0].getPath() : "unknown";
		writeCalls.push(path);
	}

	// Should have written flexibility-bundle.json but NOT manifest.json
	t.true(writeCalls.some((path) => path.includes("flexibility-bundle.json")),
		"flexibility-bundle.json should be created");
	t.false(writeCalls.some((path) => path.includes("manifest.json")),
		"No manifest.json write should occur when manifest is missing");
});

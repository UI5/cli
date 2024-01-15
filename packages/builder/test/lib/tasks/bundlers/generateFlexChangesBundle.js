import test from "ava";
import sinon from "sinon";
import generateFlexChangesBundle from "../../../../lib/tasks/bundlers/generateFlexChangesBundle.js";


function createDummyResource(content) {
	return {
		name: "file",
		getBuffer: async () => JSON.stringify(content),
		getString: () => JSON.stringify(content),
		setString: (string) => undefined
	};
}

function createDummyWorkspace(changes, manifest, flexBundle) {
	return {
		byGlob: async (path) => changes.map(createDummyResource),
		byPath: async (path) => {
			if ( path.includes("manifest.json") ) {
				return createDummyResource(manifest);
			} else if ( path.includes("flexibility-bundle.json")) {
				return createDummyResource(flexBundle);
			}
		},
		write: () => {
			throw new Error("Function 'write' is not implemented");
		}
	};
}

test.serial("execute flexChangeBundler", async (t) => {
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
				minUI5Version: "1.120.0"
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

	const dummyWorkspace = createDummyWorkspace(changeList, manifest, flexBundle);
	const stub = sinon.stub(dummyWorkspace, "write").returnsArg(0);
	await generateFlexChangesBundle({
		workspace: dummyWorkspace,
		taskUtil: false,
		options: {
			namespace: "/mypath"
		}
	});

	const content = JSON.parse(await stub.getCall(0).args[0].getString());
	t.deepEqual(content, flexBundleMerge, "Result must contain the same content");
});

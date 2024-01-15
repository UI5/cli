import test from "ava";
import flexChangesBundler from "../../../../lib/processors/bundlers/flexChangesBundler.js";

test("flexChangesBundler with empty resources", async (t) => {
	const resources = [];
	const options = {};
	const aResult = await flexChangesBundler({resources, options});
	t.deepEqual(aResult, [], "The result should be an empty array");
});

test("flexChangesBundler with 2 changes", async (t) => {
	const flexBundle = [
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
		}, {
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
			"creation": "2017-09-06T11:54:55.238Z",
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

	const resources = [];
	flexBundle.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});

	const options = {
		pathPrefix: "/mypath"
	};
	const aResult = await flexChangesBundler({resources, options});
	t.is(aResult.length, 1, "There should be only one element");
	const oResult = aResult[0];

	// check path
	t.is(oResult.getPath(), "/mypath/changes/changes-bundle.json", "path should be generated from options");

	// check content
	const content = await oResult.getString();
	const parsedContent = JSON.parse(content);
	t.deepEqual(parsedContent, flexBundle, "Result must contain the content");
});

test("flexChangesBundler has ctrl_variant and hasFlexBundleVersion = true", async (t) => {
	const changeList = [
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
		}, {
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
			"creation": "2017-09-06T11:54:55.238Z",
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
	const compVariants = [{
		"fileName": "id_1504764957625_7_rename1",
		"fileType": "variant",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"appDescriptorChange": false,
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
		"creation": "2017-09-06T11:54:55.238Z",
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
	}];
	const variantDependentControlChange = [{
		"fileName": "id_1504764957625_7_rename1",
		"fileType": "change",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"variantReference": "someting",
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
		"creation": "2017-09-06T11:54:55.238Z",
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
	}];
	const ctrlVariant = [{
		"fileName": "ctrl_variants_route_test_variant1",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170705-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const ctrlVariantChange = [{
		"fileName": "ctrl_variants_route_test_variant1",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170705-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const ctrlVariantManagementChange = [{
		"fileName": "ctrl_variants_route_test_variant1",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_management_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170705-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];

	const resources = [];
	changeList.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	compVariants.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	variantDependentControlChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariantChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariantManagementChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariant.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});

	const flexBundle = {
		"changes": changeList,
		"compVariants": compVariants,
		"variantChanges": ctrlVariantChange,
		"variantDependentControlChanges": variantDependentControlChange,
		"variantManagementChanges": ctrlVariantManagementChange,
		"variants": ctrlVariant
	};

	const options = {
		pathPrefix: "/mypath",
		hasFlexBundleVersion: true
	};
	const aResult = await flexChangesBundler({resources, options});
	t.is(aResult.length, 1, "There should be only one element");
	const oResult = aResult[0];

	// check path
	t.is(oResult.getPath(), "/mypath/changes/flexibility-bundle.json", "path should be generated from options");

	// check content
	const content = await oResult.getString();
	const parsedContent = JSON.parse(content);
	t.deepEqual(parsedContent, flexBundle, "Result must contain the content");
});

test("flexChangesBundler has ctrl_variant and hasFlexBundleVersion = false", async (t) => {
	const change = [{
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
		"creation": "2017-09-06T11:54:55.238Z",
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
	}];
	const ctrlVariant = [{
		"fileName": "ctrl_variants_route_test_variant1",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170705-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];

	const resources = [];
	change.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariant.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});

	const options = {
		pathPrefix: "/mypath",
		hasFlexBundleVersion: false
	};

	const error = await t.throwsAsync(flexChangesBundler({resources, options}));
	t.deepEqual(error.message, "There are some control variant changes in the changes folder. " +
		"This only works with a minUI5Version 1.73.0. Please update the minUI5Version in the manifest.json " +
		"to 1.73.0 or higher", "Correct exception thrown");
});

test("flexChangesBundler with existing flexibility-bundle.json", async (t) => {
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
	const compVariants = [{
		"fileName": "id_1504764957625_7_rename2",
		"fileType": "variant",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"appDescriptorChange": false,
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
				"value": "rename_1",
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
	}];
	const existingCompVariants = [{
		"fileName": "id_1504764957625_7_rename1",
		"fileType": "variant",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"appDescriptorChange": false,
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
		"creation": "2017-09-06T11:54:55.238Z",
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
	}];
	const variantDependentControlChange = [{
		"fileName": "id_1504764957625_7_rename2",
		"fileType": "change",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"variantReference": "someting",
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
				"value": "rename_1",
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
	}];
	const existingVariantDependentControlChange = [{
		"fileName": "id_1504764957625_7_rename1",
		"fileType": "change",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"variantReference": "someting",
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
		"creation": "2017-09-06T11:54:55.238Z",
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
	}];
	const ctrlVariant = [{
		"fileName": "ctrl_variants_route_test_variant2",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170805-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const existingCtrlVariant = [{
		"fileName": "ctrl_variants_route_test_variant1",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170705-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const ctrlVariantChange = [{
		"fileName": "ctrl_variants_route_test_variant2",
		"title": "variant2",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170805-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const existingCtrlVariantChange = [{
		"fileName": "ctrl_variants_route_test_variant1",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170705-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const ctrlVariantManagementChange = [{
		"fileName": "ctrl_variants_route_test_variant2",
		"title": "variant2",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_management_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170805-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const existingCtrlVariantManagementChange = [{
		"fileName": "ctrl_variants_route_test_variant1",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_management_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170705-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];

	const resources = [];
	changeList.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	compVariants.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	variantDependentControlChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariantChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariantManagementChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariant.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});

	const existingFlexBundle = {
		"changes": existingChangeList,
		"compVariants": existingCompVariants,
		"variantChanges": existingCtrlVariantChange,
		"variantDependentControlChanges": existingVariantDependentControlChange,
		"variantManagementChanges": existingCtrlVariantManagementChange,
		"variants": existingCtrlVariant
	};
	const flexBundle = {
		"changes": existingChangeList.concat(changeList),
		"compVariants": existingCompVariants.concat(compVariants),
		"variantChanges": existingCtrlVariantChange.concat(ctrlVariantChange),
		"variantDependentControlChanges": existingVariantDependentControlChange.concat(variantDependentControlChange),
		"variantManagementChanges": existingCtrlVariantManagementChange.concat(ctrlVariantManagementChange),
		"variants": existingCtrlVariant.concat(ctrlVariant)
	};
	const options = {
		pathPrefix: "/mypath",
		hasFlexBundleVersion: true
	};
	const aResult = await flexChangesBundler({resources, options, existingFlexBundle});

	t.is(aResult.length, 1, "There should be only one element");
	const oResult = aResult[0];

	// check path
	t.is(oResult.getPath(), "/mypath/changes/flexibility-bundle.json", "path should be generated from options");

	// check content
	const content = await oResult.getString();
	const parsedContent = JSON.parse(content);
	t.deepEqual(parsedContent, flexBundle, "Result must contain the content");
});

test("flexChangesBundler with existing flexibility-bundle.json and missing/wrong/additional properties", async (t) => {
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
	const compVariants = [{
		"fileName": "id_1504764957625_7_rename2",
		"fileType": "variant",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"appDescriptorChange": false,
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
				"value": "rename_1",
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
	}];
	const variantDependentControlChange = [{
		"fileName": "id_1504764957625_7_rename2",
		"fileType": "change",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"variantReference": "someting",
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
				"value": "rename_1",
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
	}];
	const ctrlVariant = [{
		"fileName": "ctrl_variants_route_test_variant2",
		"title": "variant1",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170805-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const ctrlVariantChange = [{
		"fileName": "ctrl_variants_route_test_variant2",
		"title": "variant2",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170805-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];
	const ctrlVariantManagementChange = [{
		"fileName": "ctrl_variants_route_test_variant2",
		"title": "variant2",
		"variantManagementReference": "masterPageVariant",
		"variantReference": "sap.ui.demo.todo.Component",
		"fileType": "ctrl_variant_management_change",
		"component": "lrep.mocha.test.ctrl.variants.route.Component",
		"packageName": "$TMP",
		"content": {},
		"selector": {
			"id": ""
		},
		"layer": "VENDOR",
		"texts": {},
		"namespace": "lrep_unit_test_mocha/ctrl-variants-route-test/",
		"creation": "20170805-12-00-00",
		"originalLanguage": "EN",
		"conditions": {},
		"support": {
			"generator": "Change.createInitialFileContent",
			"service": "",
			"user": "SAP"
		}
	}];

	const resources = [];
	changeList.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	compVariants.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	variantDependentControlChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariantChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariantManagementChange.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});
	ctrlVariant.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});

	const existingFlexBundle = {
		"changes": existingChangeList,
		"compVariants": "test",
		"test_property": []
	};
	const flexBundle = {
		"changes": existingChangeList.concat(changeList),
		"compVariants": compVariants,
		"variantChanges": ctrlVariantChange,
		"variantDependentControlChanges": variantDependentControlChange,
		"variantManagementChanges": ctrlVariantManagementChange,
		"variants": ctrlVariant
	};
	const options = {
		pathPrefix: "/mypath",
		hasFlexBundleVersion: true
	};
	const aResult = await flexChangesBundler({resources, options, existingFlexBundle});

	t.is(aResult.length, 1, "There should be only one element");
	const oResult = aResult[0];

	// check path
	t.is(oResult.getPath(), "/mypath/changes/flexibility-bundle.json", "path should be generated from options");

	// check content
	const content = await oResult.getString();
	const parsedContent = JSON.parse(content);
	t.deepEqual(parsedContent, flexBundle, "Result must contain the content");
});

test("flexChangesBundler with existing flexibility-bundle.json and version lower 1.73.0", async (t) => {
	const flexBundle = [
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

	const resources = [];
	flexBundle.forEach((change) => {
		resources.push({
			name: "flexChange",
			getBuffer: async () => JSON.stringify(change)
		});
	});

	const existingFlexBundle = {
		"changes": existingChangeList,
	};
	const options = {
		pathPrefix: "/mypath",
		hasFlexBundleVersion: false
	};
	const aResult = await flexChangesBundler({resources, options, existingFlexBundle});

	t.is(aResult.length, 1, "There should be only one element");
	const oResult = aResult[0];

	// check path
	t.is(oResult.getPath(), "/mypath/changes/changes-bundle.json", "path should be generated from options");

	// check content
	const content = await oResult.getString();
	const parsedContent = JSON.parse(content);
	t.deepEqual(parsedContent, flexBundle, "Result must contain the content");
});

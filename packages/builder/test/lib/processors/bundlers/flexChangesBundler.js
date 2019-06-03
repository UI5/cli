const test = require("ava");

const flexChangesBundler = require("../../../../lib/processors/bundlers/flexChangesBundler");

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
		pathPrefix: "mypath"
	};
	const aResult = await flexChangesBundler({resources, options});
	t.deepEqual(aResult.length, 1, "There should be only one element");
	const oResult = aResult[0];

	// check path
	t.deepEqual(oResult.getPath(), "mypath/changes/changes-bundle.json", "path should be generated from options");

	// check content
	const content = await oResult.getString();
	const parsedContent = JSON.parse(content);
	t.deepEqual(parsedContent, flexBundle, "Result must contain the content");
});

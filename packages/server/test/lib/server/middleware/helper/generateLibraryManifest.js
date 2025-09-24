import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {createResource, createAdapter} from "@ui5/fs/resourceFactory";
import generateLibraryManifest from "../../../../../lib/middleware/helper/generateLibraryManifest.js";

test("Generate library manifest", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const project = {
		getNamespace: () => "sap/foo",
		getVersion: () => "1.0.0",
		getReader: () => reader
	};
	const middlewareUtilMock = {
		getProject: () => project
	};
	const dotLibResource = createResource({
		path: "/resources/sap/foo/.library",
		string: `<?xml version="1.0" encoding="UTF-8" ?>
<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

	<name>library.e</name>
	<vendor>SAP SE</vendor>
	<copyright>\${copyright}</copyright>
	<version>\${version}</version>

	<documentation>Library E</documentation>

</library>
`, project,
	});

	const res = await generateLibraryManifest(middlewareUtilMock, dotLibResource);
	t.is(res.getPath(), "/resources/sap/foo/manifest.json", "Created manifest.json has expected path");
	t.deepEqual(JSON.parse(await res.getString()), {
		"_version": "1.21.0",
		"sap.app":
		{
			"id": "library.e",
			"type": "library",
			"embeds":
			[],
			"applicationVersion":
			{
				"version": "1.0.0"
			},
			"title": "Library E",
			"description": "Library E",
			"resources": "resources.json",
			"offline": true
		},
		"sap.ui":
		{
			"technology": "UI5",
			"supportedThemes":
			[]
		},
		"sap.ui5":
		{
			"dependencies":
			{
				"minUI5Version": "1.0",
				"libs":
				{}
			},
			"library":
			{
				"i18n": false
			}
		}
	}, "Created manifest.json has expected content");
	t.is(res.getProject(), project, "Created manifest.json has expected project set");
});

test("Expected manifestCreator parameters", async (t) => {
	const setProjectStub = sinon.stub();
	const manifest = {
		setProject: setProjectStub
	};
	const manifestCreatorStub = sinon.stub().resolves(manifest);
	const generateLibraryManifest = await esmock("../../../../../lib/middleware/helper/generateLibraryManifest.js", {
		"@ui5/builder/processors/manifestCreator": manifestCreatorStub
	});
	const adapter = createAdapter({
		virBasePath: "/"
	});
	const libResource = createResource({
		path: "/resources/some-file.js",
		string: `some file content`,
	});
	await adapter.write(libResource);
	const project = {
		getNamespace: () => "sap/foo",
		getVersion: () => "1.0.0",
		getReader: () => adapter
	};
	const middlewareUtilMock = {
		getProject: () => project
	};
	const dotLibResource = createResource({
		path: "/resources/sap/foo/.library",
		string: `.library content`, project,
	});

	const res = await generateLibraryManifest(middlewareUtilMock, dotLibResource);
	t.is(res, manifest, "Returned expected resource object");
	t.is(manifestCreatorStub.callCount, 1, "manifestCreator was called once");
	const getProjectVersion = manifestCreatorStub.firstCall.firstArg.getProjectVersion;
	t.deepEqual(manifestCreatorStub.firstCall.firstArg, {
		libraryResource: dotLibResource,
		namespace: "sap/foo",
		resources: [libResource],
		getProjectVersion: getProjectVersion
	}, "manifestCreator was called with expected parameters");
	t.is(getProjectVersion(), "1.0.0", "getProjectVersion returns expected version");
});

import test from "ava";
import sinon from "sinon";
import generateFlexChangesBundle from "../../../../lib/tasks/bundlers/generateFlexChangesBundle.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

/**
 * Creates a lightweight mock of a @ui5/fs Resource holding an arbitrary
 * (JSON-serializable) content and an optional path.
 *
 * @param {object|Array|string} content Content held by the resource
 * @param {string} [path="unknown"] Path returned by getPath()
 * @returns {object} A resource-like stub
 */
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

/**
 * Creates a manifest.json content with the given minUI5Version and optional
 * extra content in the sap.ui5 section.
 *
 * @param {string|string[]} [minUI5Version="1.75.0"] The minUI5Version value
 * @param {object} [extraSapUi5={}] Additional keys merged into sap.ui5
 * @returns {object} A manifest.json content object
 */
function createManifest(minUI5Version = "1.75.0", extraSapUi5 = {}) {
	return {
		"_version": "1.58.0",
		"sap.app": {
			"id": "sap.ui.demo.app",
			"type": "application"
		},
		"sap.ui5": Object.assign({
			"dependencies": {
				minUI5Version
			}
		}, extraSapUi5)
	};
}

/**
 * Creates a stub of a UI5 workspace providing the given changes, manifest and
 * optionally an existing flexibility-bundle.json.
 *
 * @param {Array} changeList Changes returned by byGlob
 * @param {object|null} manifest Manifest.json content (or null if it should not exist)
 * @param {object} [options={}]
 * @param {object|null} [options.existingFlexBundle=null] Existing flexibility-bundle.json
 * @param {boolean} [options.manifestExists=true] Whether manifest.json should be resolved
 * @returns {object} A workspace-like stub with `byGlob`, `byPath` and `write` stubs
 */
function createStubWorkspace(changeList, manifest, {
	existingFlexBundle = null,
	manifestExists = true
} = {}) {
	return {
		byGlob: async () => changeList.map((c) => createPlaceholderResource(c)),
		byPath: async (path) => {
			if (path.includes("manifest.json")) {
				return manifestExists ? createPlaceholderResource(manifest, path) : null;
			} else if (path.includes("flexibility-bundle.json")) {
				return existingFlexBundle ? createPlaceholderResource(existingFlexBundle, path) : null;
			}
			return null;
		},
		write: sinon.stub().returnsArg(0)
	};
}

/**
 * Runs the task with default projectNamespace and no taskUtil.
 *
 * @param {object} workspace Workspace stub
 * @param {object} [extra={}] Additional parameters passed to the task
 * @returns {Promise<undefined>} Resolves when the task has finished
 */
function runTask(workspace, extra = {}) {
	return generateFlexChangesBundle({
		workspace,
		taskUtil: false,
		options: {projectNamespace: "sap/ui/demo/app"},
		...extra
	});
}

/**
 * Finds the workspace.write call whose resource path matches the predicate and
 * returns its resource. Returns undefined when no matching call exists.
 *
 * @param {object} workspace The workspace stub with a sinon stub `write`
 * @param {function(string):boolean} predicate Path predicate
 * @returns {Promise<object|undefined>} The matching resource (or undefined)
 */
async function findWrittenResource(workspace, predicate) {
	for (let i = 0; i < workspace.write.callCount; i++) {
		const resource = workspace.write.getCall(i).args[0];
		const path = resource.getPath ? await resource.getPath() : "";
		if (predicate(path)) {
			return resource;
		}
	}
	return undefined;
}

/**
 * Returns the parsed manifest.json content that was written by the task.
 *
 * @param {object} workspace Workspace stub
 * @returns {Promise<object|undefined>} Parsed manifest.json content or undefined
 */
async function getWrittenManifest(workspace) {
	const resource = await findWrittenResource(workspace, (p) => p.includes("manifest.json"));
	return resource ? JSON.parse(await resource.getString()) : undefined;
}

/**
 * Returns the parsed flex/changes bundle content that was written by the task.
 *
 * @param {object} workspace Workspace stub
 * @returns {Promise<object|Array|undefined>} Parsed bundle content or undefined
 */
async function getWrittenBundle(workspace) {
	const resource = await findWrittenResource(workspace,
		(p) => p.includes("flexibility-bundle.json") || p.includes("changes-bundle.json"));
	return resource ? JSON.parse(await resource.getString()) : undefined;
}

/**
 * Returns the collection of paths that the task wrote to the workspace.
 *
 * @param {object} workspace Workspace stub
 * @returns {Promise<string[]>} Paths of all written resources
 */
async function getWrittenPaths(workspace) {
	const paths = [];
	for (let i = 0; i < workspace.write.callCount; i++) {
		const resource = workspace.write.getCall(i).args[0];
		paths.push(resource.getPath ? await resource.getPath() : "");
	}
	return paths;
}

/**
 * Builds a fully populated regular change fixture (fileType: "change") with
 * overridable values. Suitable for the pre-existing round-trip tests.
 *
 * @param {object} [overrides={}] Values to merge on top of the default fixture
 * @returns {object} A change object
 */
function createFullChangeFixture(overrides = {}) {
	return Object.assign({
		"fileName": "id_1504764957625_7_rename1",
		"fileType": "change",
		"changeType": "rename",
		"reference": "rta.performance.Component",
		"packageName": "$TMP",
		"content": {"originalControlType": "sap.m.Label"},
		"selector": {"id": "initialLabel", "idIsLocal": false},
		"layer": "CUSTOMER",
		"texts": {"newText": {"value": "rename_0", "type": "XFLD"}},
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
		"validAppVersions": {"creation": "1.0.0", "from": "1.0.0", "to": "1.0.0"}
	}, overrides);
}

/**
 * Builds a minimal change fixture. `fileType` defaults to `"change"`.
 *
 * @param {object} [overrides={}] Values overriding the defaults
 * @returns {object} A change object
 */
function createChange(overrides = {}) {
	return Object.assign({
		fileName: "test_change",
		fileType: "change",
		changeType: "rename",
		reference: "test.Component",
		content: {},
		selector: {id: "testId"},
		layer: "CUSTOMER"
	}, overrides);
}

/**
 * Standard "empty" content for existing flexibility-bundle.json in older layouts.
 *
 * @returns {object} An empty flexibility-bundle content
 */
function emptyExistingFlexBundle() {
	return {
		annotationChanges: [],
		changes: [],
		compVariants: [],
		variantChanges: [],
		variantDependentControlChanges: [],
		variantManagementChanges: [],
		variants: []
	};
}

// -----------------------------------------------------------------------------
// Round-trip tests for flexibility-bundle.json / changes-bundle.json paths
// -----------------------------------------------------------------------------

["1.120.0", ["1.120.0", "2.0.0"]].forEach((minVersion) => {
	test.serial(`execute flexChangeBundler with the minVersion: ${minVersion}`, async (t) => {
		const changeList = [createFullChangeFixture()];
		const existingChangeList = [createFullChangeFixture({
			fileName: "id_1504764957630_7_rename2",
			layer: "USER",
			texts: {newText: {value: "rename_5", type: "XFLD"}},
			creation: "2017-09-01T11:54:55.238Z"
		})];

		const manifest = {"sap.ui5": {dependencies: {minUI5Version: minVersion}}};
		const existingFlexBundle = Object.assign(emptyExistingFlexBundle(),
			{changes: existingChangeList});
		const expectedBundle = Object.assign(emptyExistingFlexBundle(),
			{changes: existingChangeList.concat(changeList)});

		const workspace = createStubWorkspace(changeList, manifest, {existingFlexBundle});
		await runTask(workspace, {options: {projectNamespace: "mypath"}});

		const bundleResource = await findWrittenResource(workspace,
			(p) => p.includes("flexibility-bundle.json"));
		t.is(bundleResource.getPath(), "/resources/mypath/changes/flexibility-bundle.json");
		t.deepEqual(JSON.parse(await bundleResource.getString()), expectedBundle,
			"Merged flexibility-bundle contains new+existing changes");

		const writtenManifest = await getWrittenManifest(workspace);
		t.deepEqual(writtenManifest, {
			"sap.ui5": {
				dependencies: {
					minUI5Version: minVersion,
					libs: {"sap.ui.fl": {}}
				}
			}
		}, "Manifest gets the sap.ui.fl dependency");
	});
});

["1.70.0", ["1.70.0", "2.0.0"]].forEach((minVersion) => {
	test.serial(`execute flexChangeBundler with the minVersion < 1.73: ${minVersion}`, async (t) => {
		const changeList = [createFullChangeFixture()];
		const manifest = {"sap.ui5": {dependencies: {minUI5Version: minVersion}}};

		const workspace = createStubWorkspace(changeList, manifest,
			{existingFlexBundle: emptyExistingFlexBundle()});
		await runTask(workspace, {options: {projectNamespace: "mypath"}});

		const bundleResource = await findWrittenResource(workspace,
			(p) => p.includes("changes-bundle.json"));
		t.is(bundleResource.getPath(), "/resources/mypath/changes/changes-bundle.json");
		t.deepEqual(JSON.parse(await bundleResource.getString()), changeList,
			"Plain changes-bundle.json contains the new change");
	});
});

// -----------------------------------------------------------------------------
// Manifest update tests (based on flexBundle flag semantics)
// -----------------------------------------------------------------------------

test("flexBundle undefined when bundle is created without an annotation change (existing flexBundle file)",
	async (t) => {
		const workspace = createStubWorkspace(
			[createChange()],
			createManifest("1.75.0"),
			{existingFlexBundle: {}}
		);

		await runTask(workspace);

		const manifestContent = await getWrittenManifest(workspace);
		t.truthy(manifestContent, "Manifest is written");
		t.false("flexBundle" in manifestContent["sap.ui5"],
			"flexBundle is undefined (absent after JSON serialization) when no annotation change is present");
		t.deepEqual(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {},
			"sap.ui.fl dependency is added");
	});

test("flexBundle undefined when bundle is created without existing bundle and without annotation change",
	async (t) => {
		const workspace = createStubWorkspace(
			[createChange()],
			createManifest("1.75.0")
		);

		await runTask(workspace);

		const manifestContent = await getWrittenManifest(workspace);
		t.truthy(manifestContent, "Manifest is written");
		t.false("flexBundle" in manifestContent["sap.ui5"],
			"flexBundle is undefined when a bundle is created without annotation change");
		t.deepEqual(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {},
			"sap.ui.fl dependency is added");
	});

test("flexBundle true when bundle is created without existing bundle but with an annotation change",
	async (t) => {
		const workspace = createStubWorkspace(
			[createChange({fileType: "annotation_change"})],
			createManifest("1.75.0")
		);

		await runTask(workspace);

		const manifestContent = await getWrittenManifest(workspace);
		t.truthy(manifestContent, "Manifest is written");
		t.true(manifestContent["sap.ui5"].flexBundle,
			"flexBundle is true when annotation changes are bundled");
		t.deepEqual(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {},
			"sap.ui.fl dependency is added");
	});

test("sap.ui.fl dependency disables lazy loading if already present", async (t) => {
	const manifest = createManifest("1.75.0", {
		dependencies: {
			minUI5Version: "1.75.0",
			libs: {"sap.ui.fl": {lazy: true}}
		}
	});
	const workspace = createStubWorkspace([createChange()], manifest, {existingFlexBundle: {}});

	await runTask(workspace);

	const manifestContent = await getWrittenManifest(workspace);
	t.truthy(manifestContent, "Manifest is written");
	t.false(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"].lazy,
		"sap.ui.fl lazy loading is disabled when a bundle is created");
});

test("manifest updated with flexBundle false when no changes exist", async (t) => {
	const workspace = createStubWorkspace([], createManifest("1.75.0"), {existingFlexBundle: {}});

	await runTask(workspace);

	t.is(workspace.write.callCount, 1, "Only the manifest is written when no changes exist");

	const manifestContent = await getWrittenManifest(workspace);
	t.truthy(manifestContent, "Manifest is written");
	t.false(manifestContent["sap.ui5"].flexBundle,
		"flexBundle is false when no bundle is created");
	t.is(manifestContent["sap.ui5"].dependencies.libs, undefined,
		"sap.ui.fl dependency is not added when no bundle is created");
});

test("flexBundle overrides existing value when bundle is created", async (t) => {
	// Pre-existing flexBundle:false should be overridden to true when an annotation change is bundled
	const manifest = createManifest("1.75.0", {
		dependencies: {minUI5Version: "1.75.0"},
		flexBundle: false
	});
	const workspace = createStubWorkspace(
		[createChange({fileType: "annotation_change"})],
		manifest,
		{existingFlexBundle: {}}
	);

	await runTask(workspace);

	const manifestContent = await getWrittenManifest(workspace);
	t.true(manifestContent["sap.ui5"].flexBundle,
		"flexBundle is overridden to true when annotation changes are bundled");
	t.deepEqual(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {},
		"sap.ui.fl dependency is added");
});

test("flexBundle undefined when minUI5Version is below 1.73 and only regular changes are provided",
	async (t) => {
		const workspace = createStubWorkspace(
			[createChange()],
			createManifest("1.72.0"),
			{existingFlexBundle: {}}
		);

		await runTask(workspace);

		const manifestContent = await getWrittenManifest(workspace);
		t.false("flexBundle" in manifestContent["sap.ui5"],
			"flexBundle is undefined because no annotation change is present");
		t.deepEqual(manifestContent["sap.ui5"].dependencies.libs["sap.ui.fl"], {},
			"sap.ui.fl dependency is still added");
	});

// -----------------------------------------------------------------------------
// Missing manifest.json handling
// -----------------------------------------------------------------------------

test("task does not fail when manifest.json is missing and no changes exist", async (t) => {
	const workspace = createStubWorkspace([], null, {manifestExists: false});

	await t.notThrowsAsync(() => runTask(workspace),
		"Task does not fail without manifest.json and without changes");
	t.is(workspace.write.callCount, 0, "Nothing is written when manifest is missing and no changes");
});

test("task does not fail when manifest.json is missing but changes exist", async (t) => {
	const workspace = createStubWorkspace([createChange()], null, {manifestExists: false});

	await t.notThrowsAsync(() => runTask(workspace),
		"Task does not fail without manifest.json but with changes");

	const paths = await getWrittenPaths(workspace);
	t.true(paths.some((p) => p.includes("flexibility-bundle.json")),
		"flexibility-bundle.json is created");
	t.false(paths.some((p) => p.includes("manifest.json")),
		"No manifest.json write when manifest is missing");
});

// -----------------------------------------------------------------------------
// Bundler behavior (via the task) — additional branch coverage
// -----------------------------------------------------------------------------

test("throws an error when variants are present but minUI5Version < 1.73", async (t) => {
	const workspace = createStubWorkspace(
		[createChange({fileType: "ctrl_variant"})],
		createManifest("1.72.0")
	);

	await t.throwsAsync(() => runTask(workspace),
		{message: /supported only with a UI5 version 1\.73 and above/},
		"Task throws with a helpful message");
});

test("all fileType categories are correctly categorized in the flexibility-bundle", async (t) => {
	const changeList = [
		createChange({fileName: "c1"}),
		createChange({fileName: "v1", fileType: "variant"}),
		createChange({fileName: "cv1", fileType: "ctrl_variant"}),
		createChange({fileName: "cvc1", fileType: "ctrl_variant_change"}),
		createChange({fileName: "cvmc1", fileType: "ctrl_variant_management_change"}),
		createChange({fileName: "ac1", fileType: "annotation_change"}),
		createChange({fileName: "vdc1", variantReference: "someVariant"})
	];
	const workspace = createStubWorkspace(changeList, createManifest("1.75.0"));

	await runTask(workspace);

	const bundle = await getWrittenBundle(workspace);
	t.truthy(bundle, "Bundle is written");
	t.deepEqual(bundle.changes.map((c) => c.fileName), ["c1"]);
	t.deepEqual(bundle.compVariants.map((c) => c.fileName), ["v1"]);
	t.deepEqual(bundle.variants.map((c) => c.fileName), ["cv1"]);
	t.deepEqual(bundle.variantChanges.map((c) => c.fileName), ["cvc1"]);
	t.deepEqual(bundle.variantManagementChanges.map((c) => c.fileName), ["cvmc1"]);
	t.deepEqual(bundle.annotationChanges.map((c) => c.fileName), ["ac1"]);
	t.deepEqual(bundle.variantDependentControlChanges.map((c) => c.fileName), ["vdc1"],
		"Changes with variantReference are categorized as variantDependentControlChanges");
});

[
	{title: "app-descriptor change (boolean true) is filtered out of the bundle", value: true},
	{title: "app-descriptor change (string 'true') is filtered out of the bundle", value: "true"}
].forEach(({title, value}) => {
	test(title, async (t) => {
		const changeList = [
			createChange({fileName: "appDesc", appDescriptorChange: value}),
			createChange({fileName: "regular"})
		];
		const workspace = createStubWorkspace(changeList, createManifest("1.75.0"));

		await runTask(workspace);

		const bundle = await getWrittenBundle(workspace);
		t.deepEqual(bundle.changes.map((c) => c.fileName), ["regular"],
			"Only the non-app-descriptor change is bundled");
	});
});

test("only app-descriptor changes → bundle is empty, flexBundle is false and no sap.ui.fl dependency",
	async (t) => {
		const workspace = createStubWorkspace(
			[createChange({appDescriptorChange: true})],
			createManifest("1.75.0")
		);

		await runTask(workspace);

		const bundle = await getWrittenBundle(workspace);
		t.truthy(bundle, "Bundle is still written (with empty categories)");
		t.is(bundle.changes.length, 0);
		t.is(bundle.annotationChanges.length, 0);

		const manifestContent = await getWrittenManifest(workspace);
		t.false(manifestContent["sap.ui5"].flexBundle,
			"flexBundle is false when only filtered app-descriptor changes are present");
		t.is(manifestContent["sap.ui5"].dependencies.libs, undefined,
			"sap.ui.fl dependency is not added when no meaningful content is bundled");
	});

test("VENDOR layer changes get support.user rewritten to 'SAP'", async (t) => {
	const workspace = createStubWorkspace(
		[createChange({
			fileName: "vendorChange",
			layer: "VENDOR",
			support: {user: "someone.else@sap.com"}
		})],
		createManifest("1.75.0")
	);

	await runTask(workspace);

	const bundle = await getWrittenBundle(workspace);
	t.is(bundle.changes[0].support.user, "SAP",
		"VENDOR layer overrides support.user to 'SAP'");
});

test("changes are sorted by creation timestamp", async (t) => {
	const changeList = [
		createChange({fileName: "later", creation: "2020-05-05T10:00:00.000Z"}),
		createChange({fileName: "earliest", creation: "2018-01-01T10:00:00.000Z"}),
		createChange({fileName: "middle", creation: "2019-03-03T10:00:00.000Z"})
	];
	const workspace = createStubWorkspace(changeList, createManifest("1.75.0"));

	await runTask(workspace);

	const bundle = await getWrittenBundle(workspace);
	t.deepEqual(
		bundle.changes.map((c) => c.fileName),
		["earliest", "middle", "later"],
		"Changes are sorted by ascending creation timestamp"
	);
});

test("mergeFlexChangeBundles merges all bundle categories from existing content", async (t) => {
	const existingFlexBundle = {
		annotationChanges: [{fileName: "existingAnnotation", fileType: "annotation_change"}],
		changes: [{fileName: "existingChange", fileType: "change"}],
		compVariants: [{fileName: "existingCompVariant", fileType: "variant"}],
		variants: [{fileName: "existingVariant", fileType: "ctrl_variant"}],
		variantChanges: [{fileName: "existingVariantChange", fileType: "ctrl_variant_change"}],
		variantDependentControlChanges: [
			{fileName: "existingVdc", fileType: "change", variantReference: "abc"}
		],
		variantManagementChanges: [
			{fileName: "existingVmc", fileType: "ctrl_variant_management_change"}
		]
	};

	const changeList = [
		createChange({fileName: "newAnnotation", fileType: "annotation_change"}),
		createChange({fileName: "newChange"}),
		createChange({fileName: "newVariant", fileType: "variant"}),
		createChange({fileName: "newCtrlVariant", fileType: "ctrl_variant"}),
		createChange({fileName: "newCtrlVariantChange", fileType: "ctrl_variant_change"}),
		createChange({fileName: "newVdc", variantReference: "abc"}),
		createChange({fileName: "newVmc", fileType: "ctrl_variant_management_change"})
	];

	const workspace = createStubWorkspace(changeList, createManifest("1.75.0"), {existingFlexBundle});

	await runTask(workspace);

	const bundle = await getWrittenBundle(workspace);
	t.deepEqual(bundle.annotationChanges.map((c) => c.fileName), ["existingAnnotation", "newAnnotation"]);
	t.deepEqual(bundle.changes.map((c) => c.fileName), ["existingChange", "newChange"]);
	t.deepEqual(bundle.compVariants.map((c) => c.fileName), ["existingCompVariant", "newVariant"]);
	t.deepEqual(bundle.variants.map((c) => c.fileName), ["existingVariant", "newCtrlVariant"]);
	t.deepEqual(bundle.variantChanges.map((c) => c.fileName),
		["existingVariantChange", "newCtrlVariantChange"]);
	t.deepEqual(bundle.variantDependentControlChanges.map((c) => c.fileName),
		["existingVdc", "newVdc"]);
	t.deepEqual(bundle.variantManagementChanges.map((c) => c.fileName),
		["existingVmc", "newVmc"]);
});

test("mergeFlexChangeBundles keeps the new content when existing category is not an array", async (t) => {
	// Existing bundle contains a non-array value for a category — should be replaced by the new content
	const existingFlexBundle = {changes: "notAnArray", otherKey: "shouldBeIgnored"};
	const workspace = createStubWorkspace(
		[createChange({fileName: "newChange"})],
		createManifest("1.75.0"),
		{existingFlexBundle}
	);

	await runTask(workspace);

	const bundle = await getWrittenBundle(workspace);
	t.deepEqual(bundle.changes.map((c) => c.fileName), ["newChange"],
		"When the existing category is not an array, the new content wins");
	t.false("otherKey" in bundle, "Only keys from the new bundle format are kept");
});

test("taskUtil.setTag is called with OmitFromBuildResult for every processed resource", async (t) => {
	const changeList = [createChange({fileName: "c1"}), createChange({fileName: "c2"})];
	const workspace = createStubWorkspace(changeList, createManifest("1.75.0"));
	const taskUtil = {
		STANDARD_TAGS: {OmitFromBuildResult: "OmitFromBuildResult"},
		setTag: sinon.stub()
	};

	await runTask(workspace, {taskUtil});

	t.is(taskUtil.setTag.callCount, changeList.length,
		"setTag is called once per input resource");
	for (let i = 0; i < taskUtil.setTag.callCount; i++) {
		t.is(taskUtil.setTag.getCall(i).args[1], "OmitFromBuildResult",
			"setTag is called with the OmitFromBuildResult tag");
	}
});

test("mixed minUI5Version array where one version is below 1.73 falls back to changes-bundle.json",
	async (t) => {
		const workspace = createStubWorkspace(
			[createChange()],
			createManifest(["1.72.0", "2.0.0"])
		);

		await runTask(workspace);

		const paths = await getWrittenPaths(workspace);
		t.true(paths.some((p) => p.endsWith("/changes/changes-bundle.json")),
			"changes-bundle.json is created when at least one minUI5Version entry is below 1.73");
		t.false(paths.some((p) => p.endsWith("/changes/flexibility-bundle.json")),
			"flexibility-bundle.json is not created in this case");
	});

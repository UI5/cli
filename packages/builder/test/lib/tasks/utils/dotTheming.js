import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.sinon = sinonGlobal.createSandbox();
	t.context.dotTheming = await esmock("../../../../lib/tasks/utils/dotTheming", {});

	t.context.createDotThemingResource = (path, dotTheming) => {
		return {
			getPath: () => path,
			getString: async () => JSON.stringify(dotTheming, null, 2),
			setString: t.context.sinon.stub()
		};
	};
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("updateLibraryDotTheming: Default case", async (t) => {
	const {createDotThemingResource} = t.context;
	const {updateLibraryDotTheming} = t.context.dotTheming;

	const resource = createDotThemingResource("/resources/sap/ui/core/.theming", {
		sEntity: "Library",
		sId: "sap/ui/core",
		aFiles: [
			"existing", "entries"
		]
	});

	await updateLibraryDotTheming({
		resource,
		namespace: "sap/ui/core",
		version: "1.2.3",
		hasThemes: true
	});

	t.is(resource.setString.callCount, 1);
	t.deepEqual(resource.setString.getCall(0).args, [
		JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			aFiles: [
				"existing", "entries"
			],
			sVersion: "1.2.3",
		}, null, 2)
	]);
});

test("updateLibraryDotTheming: No themes", async (t) => {
	const {createDotThemingResource} = t.context;
	const {updateLibraryDotTheming} = t.context.dotTheming;

	const resource = createDotThemingResource("/resources/sap/ui/core/.theming", {
		sEntity: "Library",
		sId: "sap/ui/core",
		aFiles: [
			"existing", "entries"
		]
	});

	await updateLibraryDotTheming({
		resource,
		namespace: "sap/ui/core",
		version: "1.2.3",
		hasThemes: false
	});

	t.is(resource.setString.callCount, 1);
	t.deepEqual(resource.setString.getCall(0).args, [
		JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			aFiles: [
				"existing", "entries"
			],
			sVersion: "1.2.3",
			bIgnore: true
		}, null, 2)
	]);
});

test("updateLibraryDotTheming: Existing sVersion", async (t) => {
	const {createDotThemingResource} = t.context;
	const {updateLibraryDotTheming} = t.context.dotTheming;

	const resource = createDotThemingResource("/resources/sap/ui/core/.theming", {
		sEntity: "Library",
		sId: "sap/ui/core",
		sVersion: "1.2.3"
	});

	await updateLibraryDotTheming({
		resource,
		namespace: "sap/ui/core",
		version: "1.2.4",
		hasThemes: true
	});

	t.is(resource.setString.callCount, 1);
	t.deepEqual(resource.setString.getCall(0).args, [
		JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			sVersion: "1.2.4",
		}, null, 2)
	]);
});

test("updateLibraryDotTheming: Missing sEntity", async (t) => {
	const {createDotThemingResource} = t.context;
	const {updateLibraryDotTheming} = t.context.dotTheming;

	const resource = createDotThemingResource("/resources/sap/ui/core/.theming", {
		sId: "sap/ui/core",
	});

	await t.throwsAsync(updateLibraryDotTheming({
		resource,
		namespace: "sap/ui/core",
		version: "1.2.3",
		hasThemes: true
	}), {
		message: "Missing 'sEntity' property in /resources/sap/ui/core/.theming"
	});
});

test("updateLibraryDotTheming: Incorrect sEntity", async (t) => {
	const {createDotThemingResource} = t.context;
	const {updateLibraryDotTheming} = t.context.dotTheming;

	const resource = createDotThemingResource("/resources/sap/ui/core/.theming", {
		sEntity: "Wrong",
		sId: "sap/ui/core",
	});

	await t.throwsAsync(updateLibraryDotTheming({
		resource,
		namespace: "sap/ui/core",
		version: "1.2.3",
		hasThemes: true
	}), {
		message: "Incorrect 'sEntity' value 'Wrong' in /resources/sap/ui/core/.theming: Expected 'Library'"
	});
});

test("updateLibraryDotTheming: Missing sId", async (t) => {
	const {createDotThemingResource} = t.context;
	const {updateLibraryDotTheming} = t.context.dotTheming;

	const resource = createDotThemingResource("/resources/sap/ui/core/.theming", {
		sEntity: "Library",
	});

	await t.throwsAsync(updateLibraryDotTheming({
		resource,
		namespace: "sap/ui/core",
		version: "1.2.3",
		hasThemes: true
	}), {
		message: "Missing 'sId' property in /resources/sap/ui/core/.theming"
	});
});

test("updateLibraryDotTheming: Incorrect sId", async (t) => {
	const {createDotThemingResource} = t.context;
	const {updateLibraryDotTheming} = t.context.dotTheming;

	const resource = createDotThemingResource("/resources/sap/ui/core/.theming", {
		sEntity: "Library",
		sId: "Wrong",
	});

	await t.throwsAsync(updateLibraryDotTheming({
		resource,
		namespace: "sap/ui/core",
		version: "1.2.3",
		hasThemes: true
	}), {
		message: "Incorrect 'sId' value 'Wrong' in /resources/sap/ui/core/.theming: Expected 'sap/ui/core'"
	});
});

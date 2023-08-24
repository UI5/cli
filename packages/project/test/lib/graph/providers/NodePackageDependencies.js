import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.readPackageUp = sinon.stub();

	t.context.NodePackageDependencies = await esmock("../../../../lib/graph/providers/NodePackageDependencies.js", {
		"read-pkg-up": {
			readPackageUp: t.context.readPackageUp
		}
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("getRootNode should reject with error when 'name' is empty/missing in package.json", async (t) => {
	const {NodePackageDependencies, readPackageUp} = t.context;

	const resolver = new NodePackageDependencies({cwd: "cwd"});

	readPackageUp.resolves({
		path: "/path/to/root/package.json",
		packageJson: {
			name: ""
		}
	});

	await t.throwsAsync(() => resolver.getRootNode(), {
		message: "Missing or empty 'name' attribute in package.json at /path/to/root"
	});
});

test("getRootNode should reject with error when 'version' is empty/missing in package.json", async (t) => {
	const {NodePackageDependencies, readPackageUp} = t.context;

	const resolver = new NodePackageDependencies({cwd: "cwd"});

	readPackageUp.resolves({
		path: "/path/to/root/package.json",
		packageJson: {
			name: "test-package-name",
			version: ""
		}
	});

	await t.throwsAsync(() => resolver.getRootNode(), {
		message: "Missing or empty 'version' attribute in package.json at /path/to/root"
	});
});

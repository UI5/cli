import test from "ava";
import sinon from "sinon";
import TaskUtil from "../../../../lib/build/helpers/TaskUtil.js";
import SpecificationVersion from "../../../../lib/specifications/SpecificationVersion.js";

test.afterEach.always((t) => {
	sinon.restore();
});

function getSpecificationVersion(specVersion) {
	return new SpecificationVersion(specVersion);
}

const STANDARD_TAGS = Object.freeze({
	IsDebugVariant: "ui5:IsDebugVariant",
	HasDebugVariant: "ui5:HasDebugVariant",
	OmitFromBuildResult: "ui5:OmitFromBuildResult",
	IsBundle: "ui5:IsBundle"
});

test("Instantiation", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	t.deepEqual(taskUtil.STANDARD_TAGS, STANDARD_TAGS, "Correct standard tags exposed");
});

test("setTag", (t) => {
	const setTagStub = sinon.stub();
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getResourceTagCollection: () => {
				return {
					setTag: setTagStub
				};
			}
		}
	});

	const dummyResource = {};
	taskUtil.setTag(dummyResource, "my tag", "my value");

	t.is(setTagStub.callCount, 1, "ResourceTagCollection#setTag got called once");
	t.deepEqual(setTagStub.getCall(0).args[0], dummyResource, "Correct resource parameter supplied");
	t.is(setTagStub.getCall(0).args[1], "my tag", "Correct tag parameter supplied");
	t.is(setTagStub.getCall(0).args[2], "my value", "Correct value parameter supplied");
});

test("getTag", (t) => {
	const getTagStub = sinon.stub().returns(42);
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getResourceTagCollection: () => {
				return {
					getTag: getTagStub
				};
			}
		}
	});

	const dummyResource = {};
	const res = taskUtil.getTag(dummyResource, "my tag", "my value");

	t.is(getTagStub.callCount, 1, "ResourceTagCollection#getTag got called once");
	t.deepEqual(getTagStub.getCall(0).args[0], dummyResource, "Correct resource parameter supplied");
	t.is(getTagStub.getCall(0).args[1], "my tag", "Correct tag parameter supplied");
	t.is(res, 42, "Correct result");
});

test("clearTag", (t) => {
	const clearTagStub = sinon.stub();
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getResourceTagCollection: () => {
				return {
					clearTag: clearTagStub
				};
			}
		}
	});

	const dummyResource = {};
	taskUtil.clearTag(dummyResource, "my tag", "my value");

	t.is(clearTagStub.callCount, 1, "ResourceTagCollection#clearTag got called once");
	t.deepEqual(clearTagStub.getCall(0).args[0], dummyResource, "Correct resource parameter supplied");
	t.is(clearTagStub.getCall(0).args[1], "my tag", "Correct tag parameter supplied");
});

test("setTag with resource path is not supported anymore", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const err = t.throws(() => {
		taskUtil.setTag("my resource", "my tag", "my value");
	});
	t.is(err.message,
		"Deprecated parameter: Since UI5 Tooling 3.0, #setTag " +
		"requires a resource instance. Strings are no longer accepted",
		"Threw with expected error message");
});

test("getTag with resource path is not supported anymore", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const err = t.throws(() => {
		taskUtil.getTag("my resource", "my tag", "my value");
	});
	t.is(err.message,
		"Deprecated parameter: Since UI5 Tooling 3.0, #getTag " +
		"requires a resource instance. Strings are no longer accepted",
		"Threw with expected error message");
});

test("clearTag with resource path is not supported anymore", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const err = t.throws(() => {
		taskUtil.clearTag("my resource", "my tag", "my value");
	});
	t.is(err.message,
		"Deprecated parameter: Since UI5 Tooling 3.0, #clearTag " +
		"requires a resource instance. Strings are no longer accepted",
		"Threw with expected error message");
});

test("isRootProject", (t) => {
	const isRootProjectStub = sinon.stub().returns(true);
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			isRootProject: isRootProjectStub
		}
	});

	const res = taskUtil.isRootProject();

	t.is(isRootProjectStub.callCount, 1, "ProjectBuildContext#isRootProject got called once");
	t.is(res, true, "Correct result");
});

test("getBuildOption", (t) => {
	const getOptionStub = sinon.stub().returns("Pony");
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getOption: getOptionStub
		}
	});

	const res = taskUtil.getBuildOption("friend");

	t.is(getOptionStub.callCount, 1, "ProjectBuildContext#getBuildOption got called once");
	t.is(res, "Pony", "Correct result");
});

test("getProject", (t) => {
	const getProjectStub = sinon.stub().returns("Pony farm!");
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getProject: getProjectStub
		}
	});

	const res = taskUtil.getProject("pony farm");

	t.is(getProjectStub.callCount, 1, "ProjectBuildContext#getProject got called once");
	t.is(getProjectStub.getCall(0).args[0], "pony farm",
		"ProjectBuildContext#getProject got called with expected arguments");
	t.is(res, "Pony farm!", "Correct result");
});

test("getProject: Default name", (t) => {
	const getProjectStub = sinon.stub().returns("Pony farm!");
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getProject: getProjectStub
		}
	});

	const res = taskUtil.getProject();

	t.is(getProjectStub.callCount, 1, "ProjectBuildContext#getProject got called once");
	t.is(getProjectStub.getCall(0).args[0], undefined,
		"ProjectBuildContext#getProject got called with no arguments");
	t.is(res, "Pony farm!", "Correct result");
});

test("getProject: Resource", (t) => {
	const getProjectStub = sinon.stub();
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getProject: getProjectStub
		}
	});

	const mockResource = {
		getProject: sinon.stub().returns("Pig farm!")
	};
	const res = taskUtil.getProject(mockResource);

	t.is(getProjectStub.callCount, 0, "ProjectBuildContext#getProject has not been called");
	t.is(mockResource.getProject.callCount, 1, "Resource#getProject has been called once");
	t.is(res, "Pig farm!", "Correct result");
});

test("getDependencies", (t) => {
	const getDependenciesStub = sinon.stub().returns("Pony farm!");
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getDependencies: getDependenciesStub
		}
	});

	const res = taskUtil.getDependencies("pony farm");

	t.is(getDependenciesStub.callCount, 1, "ProjectBuildContext#getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], "pony farm",
		"ProjectBuildContext#getDependencies got called with expected arguments");
	t.is(res, "Pony farm!", "Correct result");
});

test("getDependencies: Default name", (t) => {
	const getDependenciesStub = sinon.stub().returns("Pony farm!");
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getDependencies: getDependenciesStub
		}
	});

	const res = taskUtil.getDependencies();

	t.is(getDependenciesStub.callCount, 1, "ProjectBuildContext#getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], undefined,
		"ProjectBuildContext#getDependencies got called with no arguments");
	t.is(res, "Pony farm!", "Correct result");
});

test("resourceFactory", (t) => {
	const {resourceFactory} = new TaskUtil({
		projectBuildContext: {}
	});
	t.is(typeof resourceFactory.createResource, "function",
		"resourceFactory function createResource is available");
	t.is(typeof resourceFactory.createReaderCollection, "function",
		"resourceFactory function createReaderCollection is available");
	t.is(typeof resourceFactory.createReaderCollectionPrioritized, "function",
		"resourceFactory function createReaderCollectionPrioritized is available");
	t.is(typeof resourceFactory.createFilterReader, "function",
		"resourceFactory function createFilterReader is available");
	t.is(typeof resourceFactory.createLinkReader, "function",
		"resourceFactory function createLinkReader is available");
	t.is(typeof resourceFactory.createFlatReader, "function",
		"resourceFactory function createFlatReader is available");
});

test("registerCleanupTask", (t) => {
	const registerCleanupTaskStub = sinon.stub();
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			registerCleanupTask: registerCleanupTaskStub
		}
	});

	taskUtil.registerCleanupTask("my callback");

	t.is(registerCleanupTaskStub.callCount, 1, "ProjectBuildContext#registerCleanupTask got called once");
	t.is(registerCleanupTaskStub.getCall(0).args[0], "my callback", "Correct callback parameter supplied");
});

test("getInterface: specVersion 1.0", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const interfacedTaskUtil = taskUtil.getInterface(getSpecificationVersion("1.0"));

	t.is(interfacedTaskUtil, undefined, "no interface provided");
});

test("getInterface: specVersion 2.2", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const interfacedTaskUtil = taskUtil.getInterface(getSpecificationVersion("2.2"));

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, STANDARD_TAGS, "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.3", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const interfacedTaskUtil = taskUtil.getInterface(getSpecificationVersion("2.3"));

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, STANDARD_TAGS, "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.4", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const interfacedTaskUtil = taskUtil.getInterface(getSpecificationVersion("2.4"));

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, STANDARD_TAGS, "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.5", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const interfacedTaskUtil = taskUtil.getInterface(getSpecificationVersion("2.5"));

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, STANDARD_TAGS, "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.6", (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {}
	});

	const interfacedTaskUtil = taskUtil.getInterface(getSpecificationVersion("2.6"));

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, STANDARD_TAGS, "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 3.0", (t) => {
	const getProjectStub = sinon.stub().returns({
		getSpecVersion: () => "specVersion",
		getType: () => "type",
		getName: () => "name",
		getVersion: () => "version",
		getNamespace: () => "namespace",
		getRootReader: () => "rootReader",
		getReader: () => "reader",
		getRootPath: () => "rootPath",
		getSourcePath: () => "sourcePath",
		getCustomConfiguration: () => "customConfiguration",
		isFrameworkProject: () => "isFrameworkProject",
		hasBuildManifest: () => "hasBuildManifest", // Should not be exposed
		getFrameworkVersion: () => "frameworkVersion", // Should not be exposed
	});
	const getDependenciesStub = sinon.stub().returns(["dep a", "dep b"]);

	const taskUtil = new TaskUtil({
		projectBuildContext: {
			getProject: getProjectStub,
			getDependencies: getDependenciesStub
		}
	});

	const interfacedTaskUtil = taskUtil.getInterface(getSpecificationVersion("3.0"));

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask",
		"getProject",
		"getDependencies",
		"resourceFactory",
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, STANDARD_TAGS, "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
	t.is(typeof interfacedTaskUtil.getProject, "function", "function registerCleanupTask is provided");

	// getProject
	const interfacedProject = interfacedTaskUtil.getProject("pony");
	t.deepEqual(Object.keys(interfacedProject), [
		"getType",
		"getName",
		"getVersion",
		"getNamespace",
		"getRootReader",
		"getReader",
		"getRootPath",
		"getSourcePath",
		"getCustomConfiguration",
		"isFrameworkProject",
	], "Correct methods are provided");

	t.is(interfacedProject.getType(), "type", "getType function is bound correctly");
	t.is(interfacedProject.getName(), "name", "getName function is bound correctly");
	t.is(interfacedProject.getVersion(), "version", "getVersion function is bound correctly");
	t.is(interfacedProject.getNamespace(), "namespace", "getNamespace function is bound correctly");
	t.is(interfacedProject.getRootPath(), "rootPath", "getRootPath function is bound correctly");
	t.is(interfacedProject.getRootReader(), "rootReader", "getRootReader function is bound correctly");
	t.is(interfacedProject.getSourcePath(), "sourcePath", "getSourcePath function is bound correctly");
	t.is(interfacedProject.getReader(), "reader", "getReader function is bound correctly");
	t.is(interfacedProject.getCustomConfiguration(), "customConfiguration",
		"getCustomConfiguration function is bound correctly");
	t.is(interfacedProject.isFrameworkProject(), "isFrameworkProject",
		"isFrameworkProject function is bound correctly");

	// getDependencies
	t.deepEqual(interfacedTaskUtil.getDependencies("pony"), ["dep a", "dep b"],
		"getDependencies function is available and bound correctly");

	// resourceFactory
	const resourceFactory = interfacedTaskUtil.resourceFactory;
	t.is(typeof resourceFactory.createResource, "function",
		"resourceFactory function createResource is available");
	t.is(typeof resourceFactory.createReaderCollection, "function",
		"resourceFactory function createReaderCollection is available");
	t.is(typeof resourceFactory.createReaderCollectionPrioritized, "function",
		"resourceFactory function createReaderCollectionPrioritized is available");
	t.is(typeof resourceFactory.createFilterReader, "function",
		"resourceFactory function createFilterReader is available");
	t.is(typeof resourceFactory.createLinkReader, "function",
		"resourceFactory function createLinkReader is available");
	t.is(typeof resourceFactory.createFlatReader, "function",
		"resourceFactory function createFlatReader is available");
});

import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import mime from "mime-types";
import MiddlewareUtil from "../../../../lib/middleware/MiddlewareUtil.js";
import SpecificationVersion from "@ui5/project/specifications/SpecificationVersion";

test.afterEach.always((t) => {
	sinon.restore();
});

function getSpecificationVersion(specVersion) {
	return new SpecificationVersion(specVersion);
}

test.serial("getPathname", async (t) => {
	const parseurlStub = sinon.stub().returns({pathname: "path%20name"});
	const MiddlewareUtil = await esmock("../../../../lib/middleware/MiddlewareUtil.js", {
		parseurl: parseurlStub
	});
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});
	const pathname = middlewareUtil.getPathname("req");

	t.is(parseurlStub.callCount, 1, "parseurl got called once");
	t.is(parseurlStub.getCall(0).args[0], "req", "parseurl got called with correct argument");
	t.is(pathname, "path name", "Correct pathname returned");
});

test.serial("getMimeInfo", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});
	const lookupStub = sinon.stub(mime, "lookup").returns("mytype");
	const charsetStub = sinon.stub(mime, "charset").returns("mycharset");

	const mimeInfo = middlewareUtil.getMimeInfo("resourcePath");

	t.is(lookupStub.callCount, 1, "mime.lookup got called once");
	t.is(lookupStub.getCall(0).args[0], "resourcePath", "mime.lookup got called with correct argument");
	t.is(charsetStub.callCount, 1, "mime.charset got called once");
	t.is(charsetStub.getCall(0).args[0], "mytype", "mime.charset got called with correct argument");
	t.deepEqual(mimeInfo, {
		type: "mytype",
		charset: "mycharset",
		contentType: "mytype; charset=mycharset"
	}, "Correct pathname returned");
});

test.serial("getMimeInfo: unknown type", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});
	const lookupStub = sinon.stub(mime, "lookup");
	const charsetStub = sinon.stub(mime, "charset");

	const mimeInfo = middlewareUtil.getMimeInfo("resourcePath");

	t.is(lookupStub.callCount, 1, "mime.lookup got called once");
	t.is(lookupStub.getCall(0).args[0], "resourcePath", "mime.lookup got called with correct argument");
	t.is(charsetStub.callCount, 1, "mime.charset got called once");
	t.is(charsetStub.getCall(0).args[0], "application/octet-stream", "mime.charset got called with correct argument");
	t.deepEqual(mimeInfo, {
		type: "application/octet-stream",
		charset: undefined,
		contentType: "application/octet-stream"
	}, "Correct pathname returned");
});

test("getProject", (t) => {
	const getProjectStub = sinon.stub().returns("Pony farm!");
	const middlewareUtil = new MiddlewareUtil({
		graph: {
			getProject: getProjectStub
		},
		project: "root project"
	});

	const res = middlewareUtil.getProject("pony farm");

	t.is(getProjectStub.callCount, 1, "ProjectGraph#getProject got called once");
	t.is(getProjectStub.getCall(0).args[0], "pony farm",
		"ProjectGraph#getProject got called with correct arguments");
	t.is(res, "Pony farm!", "Correct result");
});

test("getProject: Default name", (t) => {
	const getProjectStub = sinon.stub().returns("Pony farm!");
	const middlewareUtil = new MiddlewareUtil({
		graph: {
			getProject: getProjectStub
		},
		project: "root project"
	});

	const res = middlewareUtil.getProject();

	t.is(getProjectStub.callCount, 0, "ProjectGraph#getProject never got called");
	t.is(res, "root project", "Correct result");
});

test("getProject: Resource", (t) => {
	const getProjectStub = sinon.stub().returns("Pony farm!");
	const middlewareUtil = new MiddlewareUtil({
		graph: {
			getProject: getProjectStub
		},
		project: "root project"
	});

	const mockResource = {
		getProject: sinon.stub().returns("Pig farm!")
	};
	const res = middlewareUtil.getProject(mockResource);

	t.is(getProjectStub.callCount, 0, "ProjectGraph#getProject never got called");
	t.is(mockResource.getProject.callCount, 1, "Resource#getProject got called once");
	t.is(res, "Pig farm!", "Correct result");
});

test("getDependencies", (t) => {
	const getDependenciesStub = sinon.stub().returns("Pony farm!");
	const getProjectNameStub = sinon.stub().returns("root project name");
	const middlewareUtil = new MiddlewareUtil({
		graph: {
			getDependencies: getDependenciesStub
		},
		project: {
			getName: getProjectNameStub
		}
	});

	const res = middlewareUtil.getDependencies("pony farm");

	t.is(getDependenciesStub.callCount, 1, "ProjectGraph#getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], "pony farm",
		"ProjectGraph#getDependencies got called with correct arguments");
	t.is(getProjectNameStub.callCount, 0, "#getName of root project has not been called");
	t.is(res, "Pony farm!", "Correct result");
});

test("getDependencies: Default name", (t) => {
	const getDependenciesStub = sinon.stub().returns("Pony farm!");
	const getProjectNameStub = sinon.stub().returns("root project name");
	const middlewareUtil = new MiddlewareUtil({
		graph: {
			getDependencies: getDependenciesStub
		},
		project: {
			getName: getProjectNameStub
		}
	});

	const res = middlewareUtil.getDependencies();

	t.is(getDependenciesStub.callCount, 1, "ProjectGraph#getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], "root project name",
		"ProjectGraph#getDependencies got called with correct arguments");
	t.is(getProjectNameStub.callCount, 1, "#getName of root project has been called once");
	t.is(res, "Pony farm!", "Correct result");
});

test.serial("resourceFactory", (t) => {
	const {resourceFactory} = new MiddlewareUtil({graph: "graph", project: "project"});
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

test("getInterface: specVersion 1.0", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("1.0"));

	t.is(interfacedMiddlewareUtil, undefined, "no interface provided");
});

test("getInterface: specVersion 2.0", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("2.0"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.1", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("2.1"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.2", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("2.2"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.3", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("2.3"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.4", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("2.4"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.5", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("2.5"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.6", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("2.6"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 3.0", (t) => {
	const getReaderStub = sinon.stub().returns("reader");
	const getProjectStub = sinon.stub().returns({
		getSpecVersion: () => "specVersion",
		getType: () => "type",
		getName: () => "name",
		getVersion: () => "version",
		getNamespace: () => "namespace",
		getRootReader: () => "rootReader",
		getRootPath: () => "rootPath",
		getReader: getReaderStub,
		getSourcePath: () => "sourcePath",
		getCustomConfiguration: () => "customConfiguration",
		isFrameworkProject: () => "isFrameworkProject",
		getFrameworkVersion: () => "frameworkVersion",
		getFrameworkName: () => "frameworkName",
		getFrameworkDependencies: () => ["frameworkDependencies"],
		hasBuildManifest: () => "hasBuildManifest", // Should not be exposed
	});
	const getDependenciesStub = sinon.stub().returns(["dep a", "dep b"]);

	const mockGraph = {
		getProject: getProjectStub,
		getDependencies: getDependenciesStub
	};

	const middlewareUtil = new MiddlewareUtil({graph: mockGraph, project: "project"});

	const interfacedMiddlewareUtil = middlewareUtil.getInterface(getSpecificationVersion("3.0"));

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo",
		"getProject",
		"getDependencies",
		"resourceFactory",
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
	t.is(typeof interfacedMiddlewareUtil.getProject, "function", "function getProject is provided");
	t.is(typeof interfacedMiddlewareUtil.getDependencies, "function", "function getDependencies is provided");

	// getProject
	const interfacedProject = interfacedMiddlewareUtil.getProject("pony");
	t.deepEqual(Object.keys(interfacedProject), [
		"getType",
		"getName",
		"getVersion",
		"getNamespace",
		"getRootReader",
		"getRootPath",
		"getSourcePath",
		"getCustomConfiguration",
		"isFrameworkProject",
		"getFrameworkName",
		"getFrameworkVersion",
		"getFrameworkDependencies",
		"getReader",
	], "Correct methods are provided");

	t.is(interfacedProject.getType(), "type", "getType function is bound correctly");
	t.is(interfacedProject.getName(), "name", "getName function is bound correctly");
	t.is(interfacedProject.getVersion(), "version", "getVersion function is bound correctly");
	t.is(interfacedProject.getNamespace(), "namespace", "getNamespace function is bound correctly");
	t.is(interfacedProject.getRootReader(), "rootReader", "getRootReader function is bound correctly");
	t.is(interfacedProject.getRootPath(), "rootPath", "getRootPath function is bound correctly");
	t.is(interfacedProject.getReader(), "reader", "getReader function is bound correctly");
	t.is(getReaderStub.callCount, 1, "Project#getReader stub got called once");
	t.deepEqual(getReaderStub.firstCall.firstArg, {style: "runtime"},
		"Project#getReader got called with expected style parameter");
	t.is(interfacedProject.getSourcePath(), "sourcePath", "getSourcePath function is bound correctly");
	t.is(interfacedProject.getCustomConfiguration(), "customConfiguration",
		"getCustomConfiguration function is bound correctly");
	t.is(interfacedProject.isFrameworkProject(), "isFrameworkProject",
		"isFrameworkProject function is bound correctly");
	t.is(interfacedProject.getFrameworkVersion(), "frameworkVersion",
		"getFrameworkVersion function is bound correctly");
	t.is(interfacedProject.getFrameworkName(), "frameworkName",
		"getFrameworkName function is bound correctly");
	t.deepEqual(interfacedProject.getFrameworkDependencies(), ["frameworkDependencies"],
		"getFrameworkDependencies function is bound correctly");

	// getDependencies
	t.deepEqual(interfacedMiddlewareUtil.getDependencies("pony"), ["dep a", "dep b"],
		"getDependencies function is available and bound correctly");

	// resourceFactory
	const resourceFactory = interfacedMiddlewareUtil.resourceFactory;
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

test("getInterface: specVersion unknown", (t) => {
	const middlewareUtil = new MiddlewareUtil({graph: "graph", project: "project"});
	const err = t.throws(() => {
		middlewareUtil.getInterface(getSpecificationVersion("1.5"));
	});

	t.is(err.message,
		"Unsupported Specification Version 1.5 defined. Your UI5 CLI installation might be outdated. " +
		"For details, see https://ui5.github.io/cli/pages/Configuration/#specification-versions",
		"Throw with correct error message");
});

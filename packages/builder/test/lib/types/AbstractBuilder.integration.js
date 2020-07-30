const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	const constructorStub = sinon.stub();
	class AbstractBuilderStub {
		constructor(parameters) {
			constructorStub(parameters);
		}
	}

	mock("../../../lib/types/AbstractBuilder", AbstractBuilderStub);
	t.context.abstractBuilderConstructorStub = constructorStub;
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

const constructorParameters = Object.freeze({
	resourceCollections: "resourceCollections",
	project: "project",
	parentLogger: "parentLogger",
	taskUtil: "taskUtil"
});

test.serial("ApplicationBuilder", (t) => {
	const ApplicationBuilder = require("../../../lib/types/application/ApplicationBuilder");
	new ApplicationBuilder(constructorParameters);

	t.is(t.context.abstractBuilderConstructorStub.callCount, 1, "AbstractBuilder constructor got called once");
	t.deepEqual(t.context.abstractBuilderConstructorStub.getCall(0).args[0], constructorParameters,
		"AbstractBuilder constructor got with correct arguments");
});

test.serial("LibraryBuilder", (t) => {
	const LibraryBuilder = require("../../../lib/types/library/LibraryBuilder");
	new LibraryBuilder(constructorParameters);

	t.is(t.context.abstractBuilderConstructorStub.callCount, 1, "AbstractBuilder constructor got called once");
	t.deepEqual(t.context.abstractBuilderConstructorStub.getCall(0).args[0], constructorParameters,
		"AbstractBuilder constructor got with correct arguments");
});

test.serial("ModuleBuilder", (t) => {
	const ModuleBuilder = require("../../../lib/types/module/ModuleBuilder");
	new ModuleBuilder(constructorParameters);

	t.is(t.context.abstractBuilderConstructorStub.callCount, 1, "AbstractBuilder constructor got called once");
	t.deepEqual(t.context.abstractBuilderConstructorStub.getCall(0).args[0], constructorParameters,
		"AbstractBuilder constructor got with correct arguments");
});

test.serial("ThemeLibraryBuilder", (t) => {
	const ThemeLibraryBuilder = require("../../../lib/types/themeLibrary/ThemeLibraryBuilder");
	new ThemeLibraryBuilder(constructorParameters);

	t.is(t.context.abstractBuilderConstructorStub.callCount, 1, "AbstractBuilder constructor got called once");
	t.deepEqual(t.context.abstractBuilderConstructorStub.getCall(0).args[0], constructorParameters,
		"AbstractBuilder constructor got with correct arguments");
});

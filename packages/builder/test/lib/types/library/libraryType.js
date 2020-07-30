const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.LibraryFormatterFormatStub = sinon.stub().returns(Promise.resolve());
	t.context.LibraryFormatterStub = sinon.stub().returns({
		format: t.context.LibraryFormatterFormatStub
	});
	mock("../../../../lib/types/library/LibraryFormatter", t.context.LibraryFormatterStub);

	t.context.LibraryBuilderBuildStub = sinon.stub().returns(Promise.resolve());
	t.context.LibraryBuilderStub = sinon.stub().returns({
		build: t.context.LibraryBuilderBuildStub
	});
	mock("../../../../lib/types/library/LibraryBuilder", t.context.LibraryBuilderStub);

	t.context.libraryType = mock.reRequire("../../../../lib/types/library/libraryType");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("libraryType.format", (t) => {
	const {
		libraryType,
		LibraryFormatterStub, LibraryFormatterFormatStub
	} = t.context;

	const project = {"fake": "project"};

	const returnValue = libraryType.format(project);

	t.is(LibraryFormatterStub.callCount, 1,
		"LibraryFormatter should be called once");
	t.deepEqual(LibraryFormatterStub.getCall(0).args, [{project}],
		"LibraryFormatter should be called with expected args");
	t.is(LibraryFormatterStub.getCall(0).args[0].project, project,
		"LibraryFormatter should be called with given project reference");
	t.true(LibraryFormatterStub.calledWithNew(),
		"LibraryFormatter should be called with 'new'");

	t.is(LibraryFormatterFormatStub.callCount, 1,
		"LibraryFormatter#format should be called once");
	t.deepEqual(LibraryFormatterFormatStub.getCall(0).args, [],
		"LibraryFormatter#format should be called without args");
	t.is(LibraryFormatterFormatStub.getCall(0).returnValue, returnValue,
		"LibraryFormatter#format should be called once");
});

test.serial("libraryType.build", (t) => {
	const {
		libraryType,
		LibraryBuilderStub, LibraryBuilderBuildStub
	} = t.context;

	const parameters = {
		resourceCollections: {"fake": "resourceCollections"},
		tasks: {"fake": "tasks"},
		project: {"fake": "project"},
		parentLogger: {"fake": "parentLogger"},
		taskUtil: {"fake": "taskUtil"}
	};
	const builderParameters = {
		resourceCollections: parameters.resourceCollections,
		project: parameters.project,
		parentLogger: parameters.parentLogger,
		taskUtil: parameters.taskUtil
	};

	const returnValue = libraryType.build(parameters);

	t.is(LibraryBuilderStub.callCount, 1,
		"LibraryBuilder should be called once");
	t.deepEqual(LibraryBuilderStub.getCall(0).args, [builderParameters],
		"LibraryBuilder should be called with expected args");
	t.is(LibraryBuilderStub.getCall(0).args[0].resourceCollections, builderParameters.resourceCollections,
		"LibraryBuilder should be called with given 'resourceCollections' reference");
	t.is(LibraryBuilderStub.getCall(0).args[0].parentLogger, builderParameters.parentLogger,
		"LibraryBuilder should be called with given 'parentLogger' reference");
	t.is(LibraryBuilderStub.getCall(0).args[0].project, builderParameters.project,
		"LibraryBuilder should be called with given 'project' reference");
	t.is(LibraryBuilderStub.getCall(0).args[0].taskUtil, builderParameters.taskUtil,
		"LibraryBuilder should be called with given 'taskUtil' reference");
	t.true(LibraryBuilderStub.calledWithNew(),
		"LibraryBuilder should be called with 'new'");

	t.is(LibraryBuilderBuildStub.callCount, 1,
		"LibraryBuilder#build should be called once");
	t.deepEqual(LibraryBuilderBuildStub.getCall(0).args, [parameters.tasks],
		"LibraryBuilder#build should be called with expected args");
	t.is(LibraryBuilderBuildStub.getCall(0).args[0], parameters.tasks,
		"LibraryBuilder#build should be called with given 'tasks' reference");
	t.is(LibraryBuilderBuildStub.getCall(0).returnValue, returnValue,
		"LibraryBuilder#build should be called once");
});

test.serial("libraryType.Builder", (t) => {
	const {libraryType, LibraryBuilderStub} = t.context;
	t.is(libraryType.Builder, LibraryBuilderStub, "libraryType.Builder exports LibraryBuilder");
});

test.serial("libraryType.Formatter", (t) => {
	const {libraryType, LibraryFormatterStub} = t.context;
	t.is(libraryType.Formatter, LibraryFormatterStub, "libraryType.Formatter exports LibraryFormatter");
});

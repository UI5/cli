const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.ThemeLibraryFormatterFormatStub = sinon.stub().returns(Promise.resolve());
	t.context.ThemeLibraryFormatterStub = sinon.stub().returns({
		format: t.context.ThemeLibraryFormatterFormatStub
	});
	mock("../../../../lib/types/themeLibrary/ThemeLibraryFormatter", t.context.ThemeLibraryFormatterStub);

	t.context.ThemeLibraryBuilderBuildStub = sinon.stub().returns(Promise.resolve());
	t.context.ThemeLibraryBuilderStub = sinon.stub().returns({
		build: t.context.ThemeLibraryBuilderBuildStub
	});
	mock("../../../../lib/types/themeLibrary/ThemeLibraryBuilder", t.context.ThemeLibraryBuilderStub);

	t.context.themeLibraryType = mock.reRequire("../../../../lib/types/themeLibrary/themeLibraryType");
});

test.serial("themeLibraryType.format", (t) => {
	const {
		themeLibraryType,
		ThemeLibraryFormatterStub, ThemeLibraryFormatterFormatStub
	} = t.context;

	const project = {"fake": "project"};

	const returnValue = themeLibraryType.format(project);

	t.is(ThemeLibraryFormatterStub.callCount, 1,
		"ThemeLibraryFormatter should be called once");
	t.deepEqual(ThemeLibraryFormatterStub.getCall(0).args, [{project}],
		"ThemeLibraryFormatter should be called with expected args");
	t.is(ThemeLibraryFormatterStub.getCall(0).args[0].project, project,
		"ThemeLibraryFormatter should be called with given project reference");
	t.true(ThemeLibraryFormatterStub.calledWithNew(),
		"ThemeLibraryFormatter should be called with 'new'");

	t.is(ThemeLibraryFormatterFormatStub.callCount, 1,
		"ThemeLibraryFormatter#format should be called once");
	t.deepEqual(ThemeLibraryFormatterFormatStub.getCall(0).args, [],
		"ThemeLibraryFormatter#format should be called without args");
	t.is(ThemeLibraryFormatterFormatStub.getCall(0).returnValue, returnValue,
		"ThemeLibraryFormatter#format should be called once");
});

test.serial("themeLibraryType.build", (t) => {
	const {
		themeLibraryType,
		ThemeLibraryBuilderStub, ThemeLibraryBuilderBuildStub
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

	const returnValue = themeLibraryType.build(parameters);

	t.is(ThemeLibraryBuilderStub.callCount, 1,
		"ThemeLibraryBuilder should be called once");
	t.deepEqual(ThemeLibraryBuilderStub.getCall(0).args, [builderParameters],
		"ThemeLibraryBuilder should be called with expected args");
	t.is(ThemeLibraryBuilderStub.getCall(0).args[0].resourceCollections, builderParameters.resourceCollections,
		"ThemeLibraryBuilder should be called with given 'resourceCollections' reference");
	t.is(ThemeLibraryBuilderStub.getCall(0).args[0].parentLogger, builderParameters.parentLogger,
		"ThemeLibraryBuilder should be called with given 'parentLogger' reference");
	t.is(ThemeLibraryBuilderStub.getCall(0).args[0].project, builderParameters.project,
		"ThemeLibraryBuilder should be called with given 'project' reference");
	t.is(ThemeLibraryBuilderStub.getCall(0).args[0].taskUtil, builderParameters.taskUtil,
		"ThemeLibraryBuilder should be called with given 'taskUtil' reference");
	t.true(ThemeLibraryBuilderStub.calledWithNew(),
		"ThemeLibraryBuilder should be called with 'new'");

	t.is(ThemeLibraryBuilderBuildStub.callCount, 1,
		"ThemeLibraryBuilder#build should be called once");
	t.deepEqual(ThemeLibraryBuilderBuildStub.getCall(0).args, [parameters.tasks],
		"ThemeLibraryBuilder#build should be called with expected args");
	t.is(ThemeLibraryBuilderBuildStub.getCall(0).args[0], parameters.tasks,
		"ThemeLibraryBuilder#build should be called with given 'tasks' reference");
	t.is(ThemeLibraryBuilderBuildStub.getCall(0).returnValue, returnValue,
		"ThemeLibraryBuilder#build should be called once");
});

test.serial("themeLibraryType.Builder", (t) => {
	const {themeLibraryType, ThemeLibraryBuilderStub} = t.context;
	t.is(themeLibraryType.Builder, ThemeLibraryBuilderStub, "themeLibraryType.Builder exports ThemeLibraryBuilder");
});

test.serial("themeLibraryType.Formatter", (t) => {
	const {themeLibraryType, ThemeLibraryFormatterStub} = t.context;
	t.is(themeLibraryType.Formatter, ThemeLibraryFormatterStub,
		"themeLibraryType.Formatter exports ThemeLibraryFormatter");
});

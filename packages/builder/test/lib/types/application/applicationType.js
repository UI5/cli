const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.ApplicationFormatterFormatStub = sinon.stub().returns(Promise.resolve());
	t.context.ApplicationFormatterStub = sinon.stub().returns({
		format: t.context.ApplicationFormatterFormatStub
	});
	mock("../../../../lib/types/application/ApplicationFormatter", t.context.ApplicationFormatterStub);

	t.context.ApplicationBuilderBuildStub = sinon.stub().returns(Promise.resolve());
	t.context.ApplicationBuilderStub = sinon.stub().returns({
		build: t.context.ApplicationBuilderBuildStub
	});
	mock("../../../../lib/types/application/ApplicationBuilder", t.context.ApplicationBuilderStub);

	t.context.applicationType = mock.reRequire("../../../../lib/types/application/applicationType");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("applicationType.format", (t) => {
	const {
		applicationType,
		ApplicationFormatterStub, ApplicationFormatterFormatStub
	} = t.context;

	const project = {"fake": "project"};

	const returnValue = applicationType.format(project);

	t.is(ApplicationFormatterStub.callCount, 1,
		"ApplicationFormatter should be called once");
	t.deepEqual(ApplicationFormatterStub.getCall(0).args, [{project}],
		"ApplicationFormatter should be called with expected args");
	t.is(ApplicationFormatterStub.getCall(0).args[0].project, project,
		"ApplicationFormatter should be called with given project reference");
	t.true(ApplicationFormatterStub.calledWithNew(),
		"ApplicationFormatter should be called with 'new'");

	t.is(ApplicationFormatterFormatStub.callCount, 1,
		"ApplicationFormatter#format should be called once");
	t.deepEqual(ApplicationFormatterFormatStub.getCall(0).args, [],
		"ApplicationFormatter#format should be called without args");
	t.is(ApplicationFormatterFormatStub.getCall(0).returnValue, returnValue,
		"ApplicationFormatter#format should be called once");
});

test.serial("applicationType.build", (t) => {
	const {
		applicationType,
		ApplicationBuilderStub, ApplicationBuilderBuildStub
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

	const returnValue = applicationType.build(parameters);

	t.is(ApplicationBuilderStub.callCount, 1,
		"ApplicationBuilder should be called once");
	t.deepEqual(ApplicationBuilderStub.getCall(0).args, [builderParameters],
		"ApplicationBuilder should be called with expected args");
	t.is(ApplicationBuilderStub.getCall(0).args[0].resourceCollections, builderParameters.resourceCollections,
		"ApplicationBuilder should be called with given 'resourceCollections' reference");
	t.is(ApplicationBuilderStub.getCall(0).args[0].parentLogger, builderParameters.parentLogger,
		"ApplicationBuilder should be called with given 'parentLogger' reference");
	t.is(ApplicationBuilderStub.getCall(0).args[0].project, builderParameters.project,
		"ApplicationBuilder should be called with given 'project' reference");
	t.is(ApplicationBuilderStub.getCall(0).args[0].taskUtil, builderParameters.taskUtil,
		"ApplicationBuilder should be called with given 'taskUtil' reference");
	t.true(ApplicationBuilderStub.calledWithNew(),
		"ApplicationBuilder should be called with 'new'");

	t.is(ApplicationBuilderBuildStub.callCount, 1,
		"ApplicationBuilder#build should be called once");
	t.deepEqual(ApplicationBuilderBuildStub.getCall(0).args, [parameters.tasks],
		"ApplicationBuilder#build should be called with expected args");
	t.is(ApplicationBuilderBuildStub.getCall(0).args[0], parameters.tasks,
		"ApplicationBuilder#build should be called with given 'tasks' reference");
	t.is(ApplicationBuilderBuildStub.getCall(0).returnValue, returnValue,
		"ApplicationBuilder#build should be called once");
});

test.serial("applicationType.Builder", (t) => {
	const {applicationType, ApplicationBuilderStub} = t.context;
	t.is(applicationType.Builder, ApplicationBuilderStub, "applicationType.Builder exports ApplicationBuilder");
});

test.serial("applicationType.Formatter", (t) => {
	const {applicationType, ApplicationFormatterStub} = t.context;
	t.is(applicationType.Formatter, ApplicationFormatterStub, "applicationType.Formatter exports ApplicationFormatter");
});

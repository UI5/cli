const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.ModuleFormatterFormatStub = sinon.stub().returns(Promise.resolve());
	t.context.ModuleFormatterStub = sinon.stub().returns({
		format: t.context.ModuleFormatterFormatStub
	});
	mock("../../../../lib/types/module/ModuleFormatter", t.context.ModuleFormatterStub);

	t.context.ModuleBuilderBuildStub = sinon.stub().returns(Promise.resolve());
	t.context.ModuleBuilderStub = sinon.stub().returns({
		build: t.context.ModuleBuilderBuildStub
	});
	mock("../../../../lib/types/module/ModuleBuilder", t.context.ModuleBuilderStub);

	t.context.moduleType = mock.reRequire("../../../../lib/types/module/moduleType");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("moduleType.format", (t) => {
	const {
		moduleType,
		ModuleFormatterStub, ModuleFormatterFormatStub
	} = t.context;

	const project = {"fake": "project"};

	const returnValue = moduleType.format(project);

	t.is(ModuleFormatterStub.callCount, 1,
		"ModuleFormatter should be called once");
	t.deepEqual(ModuleFormatterStub.getCall(0).args, [{project}],
		"ModuleFormatter should be called with expected args");
	t.is(ModuleFormatterStub.getCall(0).args[0].project, project,
		"ModuleFormatter should be called with given project reference");
	t.true(ModuleFormatterStub.calledWithNew(),
		"ModuleFormatter should be called with 'new'");

	t.is(ModuleFormatterFormatStub.callCount, 1,
		"ModuleFormatter#format should be called once");
	t.deepEqual(ModuleFormatterFormatStub.getCall(0).args, [],
		"ModuleFormatter#format should be called without args");
	t.is(ModuleFormatterFormatStub.getCall(0).returnValue, returnValue,
		"ModuleFormatter#format should be called once");
});

test.serial("moduleType.build", (t) => {
	const {
		moduleType,
		ModuleBuilderStub, ModuleBuilderBuildStub
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

	const returnValue = moduleType.build(parameters);

	t.is(ModuleBuilderStub.callCount, 1,
		"ModuleBuilder should be called once");
	t.deepEqual(ModuleBuilderStub.getCall(0).args, [builderParameters],
		"ModuleBuilder should be called with expected args");
	t.is(ModuleBuilderStub.getCall(0).args[0].resourceCollections, builderParameters.resourceCollections,
		"ModuleBuilder should be called with given 'resourceCollections' reference");
	t.is(ModuleBuilderStub.getCall(0).args[0].parentLogger, builderParameters.parentLogger,
		"ModuleBuilder should be called with given 'parentLogger' reference");
	t.is(ModuleBuilderStub.getCall(0).args[0].project, builderParameters.project,
		"ModuleBuilder should be called with given 'project' reference");
	t.is(ModuleBuilderStub.getCall(0).args[0].taskUtil, builderParameters.taskUtil,
		"ModuleBuilder should be called with given 'taskUtil' reference");
	t.true(ModuleBuilderStub.calledWithNew(),
		"ModuleBuilder should be called with 'new'");

	t.is(ModuleBuilderBuildStub.callCount, 1,
		"ModuleBuilder#build should be called once");
	t.deepEqual(ModuleBuilderBuildStub.getCall(0).args, [parameters.tasks],
		"ModuleBuilder#build should be called with expected args");
	t.is(ModuleBuilderBuildStub.getCall(0).args[0], parameters.tasks,
		"ModuleBuilder#build should be called with given 'tasks' reference");
	t.is(ModuleBuilderBuildStub.getCall(0).returnValue, returnValue,
		"ModuleBuilder#build should be called once");
});

test.serial("moduleType.Builder", (t) => {
	const {moduleType, ModuleBuilderStub} = t.context;
	t.is(moduleType.Builder, ModuleBuilderStub, "moduleType.Builder exports ModuleBuilder");
});

test.serial("moduleType.Formatter", (t) => {
	const {moduleType, ModuleFormatterStub} = t.context;
	t.is(moduleType.Formatter, ModuleFormatterStub, "moduleType.Formatter exports ModuleFormatter");
});

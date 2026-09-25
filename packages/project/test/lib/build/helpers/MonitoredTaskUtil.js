import test from "ava";
import sinonGlobal from "sinon";
import MonitoredTaskUtil from "../../../../lib/build/helpers/MonitoredTaskUtil.js";

test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	// A fake project whose accessors return fixed values. getVersion is the canonical tracked input.
	t.context.coreProject = {
		getName: () => "sap.ui.core",
		getVersion: () => "1.120.0",
		getType: () => "library",
		getSpecVersion: () => "5.0", // not a tracked accessor: passes through unrecorded
	};

	// A fake TaskUtil (the raw instance a standard task receives). Tracked reads return fixed values.
	t.context.taskUtil = {
		STANDARD_TAGS: {IsBundle: "ui5:IsBundle"},
		getEnv: sinon.stub().callsFake((name) => (name === "SET" ? "on" : undefined)),
		isRootProject: sinon.stub().returns(true),
		getDependencies: sinon.stub().returns(["dep.a", "dep.b"]),
		getProject: sinon.stub().callsFake((name) => {
			if (name === undefined || name === "sap.ui.core") {
				return t.context.coreProject;
			}
			return undefined;
		}),
		setTag: sinon.stub(),
		resourceFactory: {createResource: sinon.stub()},
	};
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("delegates untracked members unchanged", (t) => {
	const {taskUtil} = t.context;
	const monitored = new MonitoredTaskUtil(taskUtil);

	t.is(monitored.STANDARD_TAGS, taskUtil.STANDARD_TAGS, "data property passes through by reference");
	t.is(monitored.resourceFactory, taskUtil.resourceFactory, "resourceFactory passes through");

	monitored.setTag("resource", "tag", true);
	t.true(taskUtil.setTag.calledOnceWithExactly("resource", "tag", true), "setTag delegates to the target");
});

test("records getEnv reads", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);

	t.is(monitored.getEnv("SET"), "on", "returns the underlying value");
	t.is(monitored.getEnv("UNSET"), undefined);

	t.deepEqual(monitored.getInputRecording(), [
		{type: "env", name: "SET", value: "on"},
		{type: "env", name: "UNSET", value: undefined},
	]);
});

test("records isRootProject reads", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	t.is(monitored.isRootProject(), true);
	t.deepEqual(monitored.getInputRecording(), [
		{type: "isRootProject", name: "", value: "true"},
	]);
});

test("records getDependencies reads, resolving the default project name", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);

	t.deepEqual(monitored.getDependencies("sap.ui.core"), ["dep.a", "dep.b"]);
	// Called without a name: records under the project being built (getProject().getName()).
	monitored.getDependencies();

	t.deepEqual(monitored.getInputRecording(), [
		{type: "getDependencies", name: "sap.ui.core", value: `["dep.a","dep.b"]`},
	], "both reads resolve to the same project name and collapse into one entry");
});

test("records tracked project accessors keyed by project name", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);

	const project = monitored.getProject("sap.ui.core");
	t.is(project.getVersion(), "1.120.0", "returns the underlying value");
	t.is(project.getType(), "library");

	t.deepEqual(monitored.getInputRecording(), [
		{type: "project.getVersion", name: "sap.ui.core", value: "1.120.0"},
		{type: "project.getType", name: "sap.ui.core", value: "library"},
	]);
});

test("does not record untracked project accessors", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);

	const project = monitored.getProject("sap.ui.core");
	t.is(project.getSpecVersion(), "5.0", "untracked accessor still delegates");

	t.deepEqual(monitored.getInputRecording(), [], "getSpecVersion is not recorded");
});

test("getProject returns the underlying falsy value for an unknown project", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	t.is(monitored.getProject("does.not.exist"), undefined);
	t.deepEqual(monitored.getInputRecording(), []);
});

test("getInputRecording is not visible as an underlying member", (t) => {
	// The monitor answers getInputRecording itself; the wrapped taskUtil has no such method.
	t.is(typeof t.context.taskUtil.getInputRecording, "undefined");
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	t.is(typeof monitored.getInputRecording, "function");
});

test("preserves a limited interface shape (custom read-only task)", (t) => {
	// A spec-version interface without setTag: the monitor must not add it.
	const readOnlyInterface = {
		getTag: t.context.sinon.stub().returns("tagValue"),
		getEnv: t.context.sinon.stub().returns("v"),
		isRootProject: t.context.sinon.stub().returns(false),
	};
	const monitored = new MonitoredTaskUtil(readOnlyInterface);

	t.is(monitored.setTag, undefined, "setTag stays absent");
	t.is(monitored.getTag("r", "t"), "tagValue", "getTag delegates");
	monitored.isRootProject();
	t.deepEqual(monitored.getInputRecording(), [
		{type: "isRootProject", name: "", value: "false"},
	]);
});

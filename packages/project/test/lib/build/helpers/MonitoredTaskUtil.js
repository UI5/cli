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
		getTime: sinon.stub().callsFake((granularity) => (granularity === "year" ? "2026" : "2026-09-25")),
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

test("records getTime reads keyed by granularity", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);

	t.is(monitored.getTime("year"), "2026", "returns the underlying quantized value");
	t.is(monitored.getTime("day"), "2026-09-25");

	// The granularity is recorded as the input name, the quantized bucket as the value.
	t.deepEqual(monitored.getInputRecording(), [
		{type: "time", name: "year", value: "2026"},
		{type: "time", name: "day", value: "2026-09-25"},
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

// Builds a fake AbstractReader-like reader that answers byPath/byGlob and exposes the
// _byPath/_byGlob hooks a real MonitoredReader delegates to. Records nothing itself; the
// MonitoredReader wrapping it is what records the requests.
function fakeReader(name) {
	return {
		getName: () => name,
		byPath: async (virPath) => ({getPath: () => virPath}),
		byGlob: async () => [],
		_byPath: async (virPath) => ({getPath: () => virPath}),
		_byGlob: async () => [],
	};
}

// The empty root bucket, reused by resource-request assertions that expect no root reads.
const EMPTY_ROOT = {
	gitignore: {paths: [], patterns: []},
	noGitignore: {paths: [], patterns: []},
};

// In the shared fixture, getProject() with no argument resolves to sap.ui.core, so that project is
// the one being built. Reads of its reader are project requests; reads of any other project's reader
// are dependency requests.
test("captures reads of the current project's getReader() as project requests", async (t) => {
	t.context.coreProject.getReader = () => fakeReader("sap.ui.core reader");

	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	await monitored.getProject().getReader().byPath("/resources/sap/ui/core/library.js");

	t.deepEqual(monitored.getResourceRequests(), {
		project: {paths: ["/resources/sap/ui/core/library.js"], patterns: []},
		dependencies: {paths: [], patterns: []},
		root: EMPTY_ROOT,
	}, "reads of the project being built land in the project bucket");
});

test("captures reads of a dependency's getReader() as dependency requests", async (t) => {
	const depProject = {getName: () => "my.dep", getReader: () => fakeReader("my.dep reader")};
	t.context.taskUtil.getProject.callsFake((name) => {
		if (name === undefined || name === "sap.ui.core") {
			return t.context.coreProject;
		}
		if (name === "my.dep") {
			return depProject;
		}
		return undefined;
	});

	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	await monitored.getProject("my.dep").getReader().byGlob("/resources/my/dep/**");

	t.deepEqual(monitored.getResourceRequests(), {
		project: {paths: [], patterns: []},
		dependencies: {paths: [], patterns: ["/resources/my/dep/**"]},
		root: EMPTY_ROOT,
	}, "reads of a dependency's reader land in the dependency bucket");
});

test("routes reads to the project or dependency bucket by project identity", async (t) => {
	t.context.coreProject.getReader = () => fakeReader("sap.ui.core reader");
	const depProject = {getName: () => "my.dep", getReader: () => fakeReader("my.dep reader")};
	t.context.taskUtil.getProject.callsFake((name) => {
		if (name === undefined || name === "sap.ui.core") {
			return t.context.coreProject;
		}
		if (name === "my.dep") {
			return depProject;
		}
		return undefined;
	});

	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	// Reading the current project by its explicit name still routes to the project bucket.
	await monitored.getProject("sap.ui.core").getReader().byPath("/resources/sap/ui/core/library.js");
	await monitored.getProject("my.dep").getReader().byPath("/resources/my/dep/thing.js");

	t.deepEqual(monitored.getResourceRequests(), {
		project: {paths: ["/resources/sap/ui/core/library.js"], patterns: []},
		dependencies: {paths: ["/resources/my/dep/thing.js"], patterns: []},
		root: EMPTY_ROOT,
	});
});

test("getResourceRequests returns empty buckets when no project reader was accessed", (t) => {
	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	t.deepEqual(monitored.getResourceRequests(), {
		project: {paths: [], patterns: []},
		dependencies: {paths: [], patterns: []},
		root: EMPTY_ROOT,
	});
});

test("captures a byPath read of the current project's root reader (default useGitignore)", async (t) => {
	t.context.coreProject.getRootReader = () => fakeReader("sap.ui.core root reader");

	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	await monitored.getProject().getRootReader().byPath("/tsconfig.json");

	const {root} = monitored.getResourceRequests();
	t.deepEqual(root.gitignore, {
		// The default useGitignore:true bucket implicitly tracks the root .gitignore, whose content
		// decides what globs recorded under it match.
		paths: ["/tsconfig.json", "/.gitignore"],
		patterns: [],
	}, "the tsconfig read lands in the gitignore root bucket alongside the .gitignore input");
	t.deepEqual(root.noGitignore, {paths: [], patterns: []});
});

test("routes root reads to the gitignore or noGitignore bucket by the useGitignore flag", async (t) => {
	t.context.coreProject.getRootReader = sinonGlobal.stub()
		.callsFake(() => fakeReader("sap.ui.core root reader"));

	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	const project = monitored.getProject();
	await project.getRootReader().byPath("/tsconfig.json"); // default: useGitignore true
	await project.getRootReader({useGitignore: false}).byGlob("/node_modules/lodash/**");

	const {root} = monitored.getResourceRequests();
	t.deepEqual(root.gitignore, {
		paths: ["/tsconfig.json", "/.gitignore"],
		patterns: [],
	});
	t.deepEqual(root.noGitignore, {
		// An explicit /node_modules glob opts in: recorded as-is, no ignore negations, and no
		// implicit .gitignore (that input only joins the useGitignore:true bucket).
		paths: [],
		patterns: ["/node_modules/lodash/**"],
	}, "an explicit node_modules glob is recorded unchanged in the noGitignore bucket");
});

test("applies the default node_modules/.git ignore to wide root globs", async (t) => {
	t.context.coreProject.getRootReader = () => fakeReader("sap.ui.core root reader");

	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	await monitored.getProject().getRootReader({useGitignore: false}).byGlob("/**");

	const {root} = monitored.getResourceRequests();
	t.deepEqual(root.noGitignore, {
		paths: [],
		patterns: [["/**", "!/node_modules/**", "!/.git/**"]],
	}, "a wide glob is bounded away from node_modules and .git on record");
});

test("does not wrap a dependency's root reader", async (t) => {
	const depRootReader = fakeReader("my.dep root reader");
	const depProject = {getName: () => "my.dep", getRootReader: () => depRootReader};
	t.context.taskUtil.getProject.callsFake((name) => {
		if (name === undefined || name === "sap.ui.core") {
			return t.context.coreProject;
		}
		if (name === "my.dep") {
			return depProject;
		}
		return undefined;
	});

	const monitored = new MonitoredTaskUtil(t.context.taskUtil);
	// A dependency's root reader passes through unwrapped: it is the same reference and its reads
	// are not recorded (root requests re-materialize against the built project's root only).
	t.is(monitored.getProject("my.dep").getRootReader(), depRootReader, "dependency root reader passes through");
	await monitored.getProject("my.dep").getRootReader().byPath("/tsconfig.json");

	t.deepEqual(monitored.getResourceRequests().root, EMPTY_ROOT, "dependency root reads stay untracked");
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

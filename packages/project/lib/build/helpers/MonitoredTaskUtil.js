import {normalizeInputValue} from "../cache/index/TaskInputSet.js";
import {createMonitor} from "@ui5/fs/resourceFactory";

// TaskUtil interfaced-project accessors whose return value is a task input. Reading one of these
// during a task makes the value part of that task's build-cache signature. Deliberately excluded:
// getRootReader/getReader (their resource reads are tracked separately as resource requests) and
// getRootPath/getSourcePath (absolute, machine-specific paths that would make cache entries
// non-portable).
const TRACKED_PROJECT_METHODS = new Set([
	"getType", "getName", "getVersion", "getNamespace",
	"getCustomConfiguration", "isFrameworkProject",
	"getFrameworkName", "getFrameworkVersion", "getFrameworkDependencies",
]);

// TaskUtil methods whose return value is a task input, keyed by method name. Each records the read
// under the given input type. `getProject` and `getDependencies` are handled separately because
// they need the resolved project name (see the constructor). Deliberately absent: `getBuildTime`,
// which returns the raw per-run timestamp and is an untracked passthrough (it advances every build,
// so tracking it would miss the cache every time); contrast the quantized, tracked `getTime`.
const TRACKED_TASK_UTIL_METHODS = {
	getEnv: "env",
	getTime: "time",
	isRootProject: "isRootProject",
};

// Tracked methods whose first argument is the input name (the environment variable name, the time
// granularity). Their read is recorded under that argument. Argument-less tracked methods
// (`isRootProject`) record under the empty name.
const NAME_ARG_METHODS = new Set(["getEnv", "getTime"]);

// Root-reader subtrees excluded from tracking by default. A wide glob (e.g. "/**") over the project
// root would otherwise pull the whole dependency install and the git database into the build-cache
// signature. A recorded glob only reaches these when it targets them explicitly (see
// `augmentRootPattern`), so a bundler that wants a third-party package under `node_modules` opts in
// with `getRootReader({useGitignore: false}).byGlob("/node_modules/<pkg>/**")`.
const ROOT_IGNORE_PREFIXES = ["/node_modules", "/.git"];

// Negation globs for the ignored subtrees, applied to a recorded glob that does not opt into one
// explicitly. Derived once from ROOT_IGNORE_PREFIXES so the two stay in sync.
const ROOT_IGNORE_NEGATIONS = ROOT_IGNORE_PREFIXES.map((prefix) => `!${prefix}/**`);

/**
 * Whether a single glob pattern targets one of the default-ignored root subtrees explicitly.
 *
 * A leading "!" marks a negation, which never opts a subtree in. Everything else counts as explicit
 * when it starts with an ignored prefix followed by "/" or the pattern end, so "/node_modules/x/**"
 * opts in while "/**" and "/node_modules_stuff/**" do not.
 *
 * @param {string} pattern Glob pattern
 * @returns {boolean} True if the pattern explicitly enters an ignored subtree
 */
function patternEntersIgnoredSubtree(pattern) {
	if (typeof pattern !== "string" || pattern.startsWith("!")) {
		return false;
	}
	return ROOT_IGNORE_PREFIXES.some((prefix) =>
		pattern === prefix || pattern.startsWith(`${prefix}/`));
}

/**
 * Applies the default root-monitor ignore to a recorded glob request.
 *
 * A request that already targets `node_modules` or `.git` explicitly is recorded unchanged so its
 * content is tracked. Any other request gains negations for those subtrees, so re-materializing the
 * request set on a later build resolves the same bounded resource set the record-time read intended.
 *
 * @param {string|string[]} pattern Recorded glob pattern (single or array form)
 * @returns {string|string[]} Pattern, augmented with ignore negations unless it opts in explicitly
 */
function augmentRootPattern(pattern) {
	const patterns = Array.isArray(pattern) ? pattern : [pattern];
	if (patterns.some(patternEntersIgnoredSubtree)) {
		return pattern;
	}
	return [...patterns, ...ROOT_IGNORE_NEGATIONS];
}

/**
 * Records the inputs a task reads through its [TaskUtil]{@link @ui5/project/build/helpers/TaskUtil},
 * analogous to how [MonitoredReader]{@link @ui5/fs/internal/MonitoredReader} records the resources a
 * task reads.
 *
 * The TaskRunner wraps the TaskUtil (or the spec-version interface) handed to a task in a
 * MonitoredTaskUtil and passes the wrapper to the task instead. Every tracked read the task makes
 * (an environment variable via <code>getEnv</code>, the quantized current time via
 * <code>getTime</code>, <code>isRootProject</code>, <code>getDependencies</code>, or a
 * <code>project.*</code> accessor on a <code>getProject(name)</code> result) is recorded. After the
 * task finishes, the TaskRunner drains the recording via {@link #getInputRecording} and folds it into
 * the task's build-cache signature so that a changed input invalidates the cached result. Reads made
 * outside a task (by build orchestration code holding the raw TaskUtil) are not monitored and stay
 * untracked.
 *
 * Wrapping is done with a Proxy so the monitor exposes exactly the same shape as the wrapped
 * TaskUtil: a custom task's limited interface stays limited, and non-input members (tag mutations,
 * <code>registerCleanupTask</code>, the <code>resourceFactory</code>, <code>STANDARD_TAGS</code>)
 * pass straight through. The constructor returns the Proxy, so <code>new MonitoredTaskUtil(taskUtil)</code>
 * yields a drop-in replacement that also answers {@link #getInputRecording}.
 *
 * Reads a task makes through a project reader are tracked too: a <code>getProject(name).getReader()</code>
 * result is wrapped in a [MonitoredReader]{@link @ui5/fs/internal/MonitoredReader}, and the resources
 * the task reads through it are recorded as resource requests. {@link #getResourceRequests} drains
 * these, split into a <code>project</code> bucket (reads of the project being built) and a
 * <code>dependencies</code> bucket (reads of any other project). The TaskRunner merges each bucket
 * into the project and dependency resource requests it already collects from the workspace and
 * dependencies readers.
 *
 * Reads through the project being built's <code>getRootReader()</code> are tracked in a third
 * <code>root</code> bucket. The root reader exposes files outside the UI5 resource model (a
 * <code>tsconfig.json</code> in the project root, third-party packages under <code>node_modules</code>),
 * so a task reading them would otherwise bypass every tracked reader. The bucket is keyed by the
 * reader's <code>useGitignore</code> flag, because the same glob returns a different resource set with
 * the flag on versus off; a read recorded under one flag is re-materialized against a root reader
 * built with the same flag. The default <code>useGitignore: true</code> bucket additionally tracks the
 * root <code>.gitignore</code> as an input, so an edit that un-ignores a file invalidates the recorded
 * request sets even though no filesystem change event fires for that file. <code>node_modules</code>
 * and <code>.git</code> are ignored unless a request globs into them explicitly (see
 * {@link augmentRootPattern}). A dependency's <code>getRootReader()</code> stays an unwrapped
 * pass-through: root requests re-materialize against the built project's root, not a dependency's.
 *
 * @alias @ui5/project/build/helpers/MonitoredTaskUtil
 */
class MonitoredTaskUtil {
	/**
	 * @param {@ui5/project/build/helpers/TaskUtil|object} taskUtil TaskUtil instance or a
	 *   spec-version interface returned by {@link @ui5/project/build/helpers/TaskUtil#getInterface}
	 * @param {object} [parameters]
	 * @param {boolean} [parameters.recordTagOperations=false] Record every <code>getTag</code>,
	 *   <code>setTag</code> and <code>clearTag</code> the wrapped task performs, drainable via
	 *   {@link #getTagOperations}. Off for the task-level monitor (tags reach the tag collection and are
	 *   captured through <code>resource.getTags()</code> like today); on for the per-step monitor the
	 *   [StepRunner]{@link @ui5/project/build/helpers/StepRunner} wraps around this one, so a step
	 *   restored from cache can replay its tag operations without re-running.
	 */
	constructor(taskUtil, {recordTagOperations = false} = {}) {
		// Recorded inputs, keyed by `${type}\0${name}` so repeated reads of the same input collapse
		// to a single entry (last read wins).
		const recording = new Map();
		const record = (type, name, rawValue) => {
			recording.set(`${type}\0${name}`, {type, name, value: normalizeInputValue(rawValue)});
		};

		// Tag operations in call order, recorded only when recordTagOperations is set. Order is kept
		// (rather than collapsed like inputs) so a replay reproduces the exact sequence a step performed,
		// e.g. a setTag followed by a later clearTag of the same tag.
		const tagOperations = [];

		// Monitored project readers, split by whether the read targets the project being built
		// (project requests) or a dependency (dependency requests). Each entry is a MonitoredReader
		// wrapping a getProject(name).getReader() result; getResourceRequests drains them.
		const projectReaderMonitors = [];
		const dependencyReaderMonitors = [];

		// Monitored root readers of the project being built, keyed by the useGitignore flag the read
		// used. Two lists because the same glob resolves differently with the flag on versus off, so
		// each recorded request must re-materialize against a matching root reader.
		const rootReaderMonitors = {true: [], false: []};

		// Name of the project being built, resolved lazily from the underlying taskUtil (getProject()
		// with no argument) and cached. `null` when the wrapped interface has no getProject (spec
		// version < 3.0), in which case no reader is ever wrapped.
		let currentProjectName;
		const getCurrentProjectName = () => {
			if (currentProjectName === undefined) {
				const current = typeof taskUtil.getProject === "function" ? taskUtil.getProject() : undefined;
				currentProjectName = current ? current.getName() : null;
			}
			return currentProjectName;
		};

		// Concatenates the recorded requests of a set of MonitoredReaders into one {paths, patterns}.
		const mergeResourceRequests = (monitors) => {
			const paths = [];
			const patterns = [];
			for (const monitor of monitors) {
				const requests = monitor.getResourceRequests();
				paths.push(...requests.paths);
				patterns.push(...requests.patterns);
			}
			return {paths, patterns};
		};

		// Drains the root reader monitors recorded under one useGitignore flag, applying the default
		// node_modules/.git ignore to glob patterns. When useGitignore is on and the bucket recorded
		// anything, the root .gitignore is tracked as a path input so its content joins the request
		// set's signature (an edit that un-ignores a file changes what the recorded globs match).
		const mergeRootRequests = (useGitignore) => {
			const {paths, patterns} = mergeResourceRequests(rootReaderMonitors[useGitignore]);
			const augmentedPatterns = patterns.map(augmentRootPattern);
			if (useGitignore && (paths.length || augmentedPatterns.length) && !paths.includes("/.gitignore")) {
				paths.push("/.gitignore");
			}
			return {paths, patterns: augmentedPatterns};
		};

		// Wraps a project (or interfaced project) returned by getProject so that reading a tracked
		// accessor records the value under the project's name, and reading through getReader records
		// the resources as resource requests. Methods bind to the underlying project so private fields
		// keep working, and untracked methods pass straight through.
		const wrapProject = (project) => {
			const projectName = project.getName();
			const isCurrentProject = projectName === getCurrentProjectName();
			const readerMonitors = isCurrentProject ?
				projectReaderMonitors : dependencyReaderMonitors;
			return new Proxy(project, {
				get(target, prop) {
					const orig = target[prop];
					if (typeof orig !== "function") {
						return orig;
					}
					if (TRACKED_PROJECT_METHODS.has(prop)) {
						return function(...args) {
							const result = orig.apply(target, args);
							record(`project.${prop}`, projectName, result);
							return result;
						};
					}
					if (prop === "getReader") {
						return function(...args) {
							const monitor = createMonitor(orig.apply(target, args));
							readerMonitors.push(monitor);
							return monitor;
						};
					}
					if (prop === "getRootReader" && isCurrentProject) {
						// Only the built project's root re-materializes correctly on lookup (against
						// this.#project.getRootReader). A dependency's root reader passes through
						// unwrapped, staying untracked as before.
						return function({useGitignore = true} = {}) {
							const monitor = createMonitor(orig.call(target, {useGitignore}));
							rootReaderMonitors[!!useGitignore].push(monitor);
							return monitor;
						};
					}
					return orig.bind(target);
				},
			});
		};

		return new Proxy(taskUtil, {
			get(target, prop) {
				if (prop === "getInputRecording") {
					return () => Array.from(recording.values());
				}
				if (prop === "getTagOperations") {
					return () => tagOperations.slice();
				}
				if (prop === "getResourceRequests") {
					return () => ({
						project: mergeResourceRequests(projectReaderMonitors),
						dependencies: mergeResourceRequests(dependencyReaderMonitors),
						root: {
							gitignore: mergeRootRequests(true),
							noGitignore: mergeRootRequests(false),
						},
					});
				}
				const orig = target[prop];
				if (typeof orig !== "function") {
					// STANDARD_TAGS, resourceFactory, or a member the interface does not provide
					return orig;
				}
				if (recordTagOperations && (prop === "setTag" || prop === "clearTag" || prop === "getTag")) {
					// Record the operation and delegate to the wrapped taskUtil, so a set/clear still
					// reaches the project tag collection (captured by recordTaskResult like a task-level
					// tag) while the per-step attribution a restored step's replay needs is kept. The path
					// stands in for the resource, since the tag collection keys tags by path and a restored
					// step has no resource instance to hand back.
					return function(resource, tag, value) {
						const result = orig.call(target, resource, tag, value);
						if (prop === "setTag") {
							tagOperations.push({op: "set", path: resource.getPath(), tag,
								value: value === undefined ? true : value});
						} else if (prop === "clearTag") {
							tagOperations.push({op: "clear", path: resource.getPath(), tag});
						} else {
							tagOperations.push({op: "get", path: resource.getPath(), tag});
						}
						return result;
					};
				}
				if (Object.hasOwn(TRACKED_TASK_UTIL_METHODS, prop)) {
					const type = TRACKED_TASK_UTIL_METHODS[prop];
					return function(name) {
						const value = orig.call(target, name);
						record(type, NAME_ARG_METHODS.has(prop) ? name : "", value);
						return value;
					};
				}
				if (prop === "getDependencies") {
					return function(projectName) {
						const value = orig.call(target, projectName);
						// getDependencies defaults to the project being built. Record the resolved name
						// so the lookup re-derives the same input.
						const resolvedName = projectName ?? target.getProject().getName();
						record("getDependencies", resolvedName, value);
						return value;
					};
				}
				if (prop === "getProject") {
					return function(nameOrResource) {
						const project = orig.call(target, nameOrResource);
						return project ? wrapProject(project) : project;
					};
				}
				return orig.bind(target);
			},
		});
	}

	/**
	 * Returns the inputs recorded since this monitor was created.
	 *
	 * Called by the TaskRunner after the task finishes; folded into the task's build-cache signature.
	 *
	 * @returns {Array<{type: string, name: string, value: string|undefined}>} Recorded input entries
	 */
	getInputRecording() {
		// Implemented via the constructor's Proxy trap; this declaration documents the contract.
		return [];
	}

	/**
	 * Returns the tag operations recorded since this monitor was created, in call order. Empty unless
	 * the monitor was constructed with <code>recordTagOperations</code> (the per-step monitor).
	 *
	 * The [StepRunner]{@link @ui5/project/build/helpers/StepRunner} persists these per step so a
	 * step restored from cache on a delta build replays its <code>set</code>/<code>clear</code> operations
	 * into the tag collection, reproducing tags the step would have set had it run.
	 *
	 * @returns {Array<{op: string, path: string, tag: string, value: *}>} Recorded tag operations
	 *   (<code>op</code> is <code>"set"</code>, <code>"clear"</code> or <code>"get"</code>;
	 *   <code>value</code> is present only for <code>"set"</code>)
	 */
	getTagOperations() {
		// Implemented via the constructor's Proxy trap; this declaration documents the contract.
		return [];
	}

	/**
	 * Returns the resource requests recorded through project readers since this monitor was created.
	 *
	 * Called by the TaskRunner after the task finishes. The <code>project</code> and
	 * <code>dependencies</code> buckets are merged into the project and dependency resource requests
	 * the TaskRunner already collects from the workspace and dependencies readers. The <code>root</code>
	 * bucket carries reads through the built project's root reader, keyed by <code>useGitignore</code>,
	 * for the build cache to re-materialize against a matching root reader.
	 *
	 * @returns {{project: {paths: string[], patterns: (string|string[])[]},
	 *   dependencies: {paths: string[], patterns: (string|string[])[]},
	 *   root: {gitignore: {paths: string[], patterns: (string|string[])[]},
	 *     noGitignore: {paths: string[], patterns: (string|string[])[]}}}} Recorded resource requests
	 */
	getResourceRequests() {
		// Implemented via the constructor's Proxy trap; this declaration documents the contract.
		return {
			project: {paths: [], patterns: []},
			dependencies: {paths: [], patterns: []},
			root: {gitignore: {paths: [], patterns: []}, noGitignore: {paths: [], patterns: []}},
		};
	}
}

export default MonitoredTaskUtil;

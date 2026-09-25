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
// they need the resolved project name (see the constructor).
const TRACKED_TASK_UTIL_METHODS = {
	getEnv: "env",
	isRootProject: "isRootProject",
};

/**
 * Records the inputs a task reads through its [TaskUtil]{@link @ui5/project/build/helpers/TaskUtil},
 * analogous to how [MonitoredReader]{@link @ui5/fs/internal/MonitoredReader} records the resources a
 * task reads.
 *
 * The TaskRunner wraps the TaskUtil (or the spec-version interface) handed to a task in a
 * MonitoredTaskUtil and passes the wrapper to the task instead. Every tracked read the task makes
 * (an environment variable via <code>getEnv</code>, <code>isRootProject</code>,
 * <code>getDependencies</code>, or a <code>project.*</code> accessor on a
 * <code>getProject(name)</code> result) is recorded. After the task finishes, the TaskRunner drains
 * the recording via {@link #getInputRecording} and folds it into the task's build-cache signature so
 * that a changed input invalidates the cached result. Reads made outside a task (by build
 * orchestration code holding the raw TaskUtil) are not monitored and stay untracked.
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
 * dependencies readers. <code>getRootReader</code> is deliberately not wrapped: it exposes the
 * project root (test sources, config) which is not part of the dependency reader collection those
 * requests are later resolved against, so a read through it stays untracked.
 *
 * @alias @ui5/project/build/helpers/MonitoredTaskUtil
 */
class MonitoredTaskUtil {
	/**
	 * @param {@ui5/project/build/helpers/TaskUtil|object} taskUtil TaskUtil instance or a
	 *   spec-version interface returned by {@link @ui5/project/build/helpers/TaskUtil#getInterface}
	 */
	constructor(taskUtil) {
		// Recorded inputs, keyed by `${type}\0${name}` so repeated reads of the same input collapse
		// to a single entry (last read wins).
		const recording = new Map();
		const record = (type, name, rawValue) => {
			recording.set(`${type}\0${name}`, {type, name, value: normalizeInputValue(rawValue)});
		};

		// Monitored project readers, split by whether the read targets the project being built
		// (project requests) or a dependency (dependency requests). Each entry is a MonitoredReader
		// wrapping a getProject(name).getReader() result; getResourceRequests drains them.
		const projectReaderMonitors = [];
		const dependencyReaderMonitors = [];

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

		// Wraps a project (or interfaced project) returned by getProject so that reading a tracked
		// accessor records the value under the project's name, and reading through getReader records
		// the resources as resource requests. Methods bind to the underlying project so private fields
		// keep working, and untracked methods pass straight through.
		const wrapProject = (project) => {
			const projectName = project.getName();
			const readerMonitors = projectName === getCurrentProjectName() ?
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
					return orig.bind(target);
				},
			});
		};

		return new Proxy(taskUtil, {
			get(target, prop) {
				if (prop === "getInputRecording") {
					return () => Array.from(recording.values());
				}
				if (prop === "getResourceRequests") {
					return () => ({
						project: mergeResourceRequests(projectReaderMonitors),
						dependencies: mergeResourceRequests(dependencyReaderMonitors),
					});
				}
				const orig = target[prop];
				if (typeof orig !== "function") {
					// STANDARD_TAGS, resourceFactory, or a member the interface does not provide
					return orig;
				}
				if (Object.hasOwn(TRACKED_TASK_UTIL_METHODS, prop)) {
					const type = TRACKED_TASK_UTIL_METHODS[prop];
					return function(name) {
						const value = orig.call(target, name);
						record(type, prop === "getEnv" ? name : "", value);
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
	 * Returns the resource requests recorded through project readers since this monitor was created,
	 * split into reads of the project being built and reads of dependencies.
	 *
	 * Called by the TaskRunner after the task finishes; each bucket is merged into the project and
	 * dependency resource requests the TaskRunner already collects from the workspace and dependencies
	 * readers.
	 *
	 * @returns {{project: {paths: string[], patterns: string[]},
	 *   dependencies: {paths: string[], patterns: string[]}}} Recorded resource requests
	 */
	getResourceRequests() {
		// Implemented via the constructor's Proxy trap; this declaration documents the contract.
		return {project: {paths: [], patterns: []}, dependencies: {paths: [], patterns: []}};
	}
}

export default MonitoredTaskUtil;

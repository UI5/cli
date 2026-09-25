import {normalizeInputValue} from "../cache/index/TaskInputSet.js";

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

		// Wraps a project (or interfaced project) returned by getProject so that reading a tracked
		// accessor records the value under the project's name. Methods bind to the underlying project
		// so private fields keep working, and untracked methods pass straight through.
		const wrapProject = (project) => {
			const projectName = project.getName();
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
					return orig.bind(target);
				},
			});
		};

		return new Proxy(taskUtil, {
			get(target, prop) {
				if (prop === "getInputRecording") {
					return () => Array.from(recording.values());
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
}

export default MonitoredTaskUtil;

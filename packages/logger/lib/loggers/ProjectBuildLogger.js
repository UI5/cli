import Logger from "./Logger.js";

/**
 * Logger for emitting status events on the progress a single project's build process.
 * <br><br>
 * Emits <code>ui5.log</code>, <code>ui5.project-build-metadata</code> and <code>ui5.project-build-status</code>
 * events on the [<code>process</code>]{@link https://nodejs.org/api/process.html} object,
 * which can be handled by dedicated handlers,
 * like [@ui5/logger/handlers/ConsoleHandler]{@link @ui5/logger/handlers/ConsoleHandler}.
 * <br><br>
 * If no listener is attached to the the event, messages are written directly to the <code>process.stderr</code> stream.
 *
 * @private
 * @class
 * @alias @ui5/logger/ProjectBuildLogger
 */
class ProjectBuildLogger extends Logger {
	#projectName;
	#projectType;
	#tasksToRun;

	static PROJECT_BUILD_METADATA_EVENT_NAME = "ui5.project-build-metadata";
	static PROJECT_BUILD_STATUS_EVENT_NAME = "ui5.project-build-status";

	constructor({moduleName, projectName, projectType}) {
		super(moduleName);

		if (!projectName) {
			throw new Error("ProjectBuildLogger: Missing projectName parameter");
		}
		if (!projectType) {
			throw new Error("ProjectBuildLogger: Missing projectType parameter");
		}
		this.#projectName = projectName;
		this.#projectType = projectType;
	}

	setTasks(tasks) {
		if (!tasks || !Array.isArray(tasks)) {
			throw new Error("ProjectBuildLogger#setTasks: Missing or incorrect tasks parameter");
		}
		this.#tasksToRun = tasks;

		this._emit(ProjectBuildLogger.PROJECT_BUILD_METADATA_EVENT_NAME, {
			projectName: this.#projectName,
			projectType: this.#projectType,
			tasksToRun: tasks
		});
	}

	startTask(taskName) {
		if (!this.#tasksToRun || !this.#tasksToRun.includes(taskName)) {
			throw new Error(`ProjectBuildLogger#startTask: Unknown task ${taskName}`);
		}
		const level = "info";
		const hasListeners = this._emit(ProjectBuildLogger.PROJECT_BUILD_STATUS_EVENT_NAME, {
			level,
			projectName: this.#projectName,
			projectType: this.#projectType,
			taskName,
			status: "task-start",
		});

		if (!hasListeners) {
			this._log(level, `${this.#projectName}: Running task ${taskName}...`);
		}
	}

	endTask(taskName) {
		if (!this.#tasksToRun || !this.#tasksToRun.includes(taskName)) {
			throw new Error(`ProjectBuildLogger#endTask: Unknown task ${taskName}`);
		}
		const level = "verbose";
		const hasListeners = this._emit(ProjectBuildLogger.PROJECT_BUILD_STATUS_EVENT_NAME, {
			level,
			projectName: this.#projectName,
			projectType: this.#projectType,
			taskName,
			status: "task-end",
		});

		if (!hasListeners) {
			this._log(level, `${this.#projectName}: Finished task ${taskName}`);
		}
	}
}

export default ProjectBuildLogger;

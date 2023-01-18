import Logger from "./Logger.js";

/**
 * Logger for emitting status events on the progress a UI5 Tooling build process.
 * <br><br>
 * Emits <code>ui5.log</code>, <code>ui5.build-metadata</code> and <code>ui5.build-status</code> events on the
 * [<code>process</code>]{@link https://nodejs.org/api/process.html} object, which can which can be handled
 * by dedicated writers, like [@ui5/logger/writers/Console]{@link @ui5/logger/writers/Console}.
 * <br><br>
 * If no listener is attached to the the event, messages are written directly to the <code>process.stderr</code> stream.
 *
 * @private
 * @class
 * @alias @ui5/logger/loggers/Build
 */
class Build extends Logger {
	#projectsToBuild;

	static BUILD_METADATA_EVENT_NAME = "ui5.build-metadata";
	static BUILD_STATUS_EVENT_NAME = "ui5.build-status";

	setProjects(projects) {
		if (!projects || !Array.isArray(projects)) {
			throw new Error("loggers/Build#setProjects: Missing or incorrect projects parameter");
		}
		this.#projectsToBuild = projects;

		this._emit(Build.BUILD_METADATA_EVENT_NAME, {
			projectsToBuild: projects
		});
	}

	startProjectBuild(projectName, projectType) {
		if (!this.#projectsToBuild || !this.#projectsToBuild.includes(projectName)) {
			throw new Error(`loggers/Build#startProjectBuild: Unknown project ${projectName}`);
		}
		if (!projectType) {
			throw new Error(`loggers/Build#startProjectBuild: Missing projectType parameter`);
		}
		const level = "info";
		const hasListeners = this._emit(Build.BUILD_STATUS_EVENT_NAME, {
			level,
			projectName,
			projectType,
			status: "project-build-start",
		});
		if (!hasListeners) {
			this._log(level, `Building ${projectType} project ${projectName}...`);
		}
	}

	endProjectBuild(projectName, projectType) {
		if (!this.#projectsToBuild || !this.#projectsToBuild.includes(projectName)) {
			throw new Error(`loggers/Build#endProjectBuild: Unknown project ${projectName}`);
		}
		if (!projectType) {
			throw new Error(`loggers/Build#endProjectBuild: Missing projectType parameter`);
		}
		const level = "verbose";
		const hasListeners = this._emit(Build.BUILD_STATUS_EVENT_NAME, {
			level,
			projectName,
			projectType,
			status: "project-build-end",
		});
		if (!hasListeners) {
			this._log(level, `Finished building ${projectType} project ${projectName}`);
		}
	}

	skipProjectBuild(projectName, projectType) {
		if (!this.#projectsToBuild || !this.#projectsToBuild.includes(projectName)) {
			throw new Error(`loggers/Build#skipProjectBuild: Unknown project ${projectName}`);
		}
		if (!projectType) {
			throw new Error(`loggers/Build#skipProjectBuild: Missing projectType parameter`);
		}
		const level = "info";
		const hasListeners = this._emit(Build.BUILD_STATUS_EVENT_NAME, {
			level,
			projectName,
			projectType,
			status: "project-build-skip",
		});
		if (!hasListeners) {
			this._log(level, `Skipping build of ${projectType} project ${projectName}`);
		}
	}
}

export default Build;

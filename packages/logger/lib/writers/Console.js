import process from "node:process";
import {chalkStderr as chalk} from "chalk";
import figures from "figures";
import {MultiBar} from "cli-progress";
import Logger from "../loggers/Logger.js";

/**
 * Standard handler for events emitted by @ui5/logger modules. Writes messages to
 * [<code>process.stderr</code>]{@link https://nodejs.org/api/process.html#processstderr} stream
 * and renders a progress bar for UI5 Tooling build processes.
 * <br><br>
 * The progress bar is only used in interactive terminals. If verbose logging is enabled, the progress
 * bar is disabled.
 *
 * @public
 * @class
 * @alias @ui5/logger/writers/Console
 */
class Console {
	#projectMetadata = new Map();
	#progressBarContainer;
	#progressBar;
	#progressProjectWeight;

	constructor() {
		this._handleLogEvent = this.#handleLogEvent.bind(this);
		this._handleBuildStatusEvent = this.#handleBuildStatusEvent.bind(this);
		this._handleProjectBuildStatusEvent = this.#handleProjectBuildStatusEvent.bind(this);
		this._handleBuildMetadataEvent = this.#handleBuildMetadataEvent.bind(this);
		this._handleProjectBuildMetadataEvent = this.#handleProjectBuildMetadataEvent.bind(this);
		this._handleStop = this.disable.bind(this);
	}

	/**
	 * Attaches all event listeners and starts writing to output stream
	 *
	 * @public
	 */
	enable() {
		process.on("ui5.log", this._handleLogEvent);
		process.on("ui5.build-metadata", this._handleBuildMetadataEvent);
		process.on("ui5.project-build-metadata", this._handleProjectBuildMetadataEvent);
		process.on("ui5.build-status", this._handleBuildStatusEvent);
		process.on("ui5.project-build-status", this._handleProjectBuildStatusEvent);
		process.on("ui5.log.stop-console", this._handleStop);
	}

	/**
	 * Detaches all event listeners and stops writing to output stream
	 *
	 * @public
	 */
	disable() {
		process.off("ui5.log", this._handleLogEvent);
		process.off("ui5.build-metadata", this._handleBuildMetadataEvent);
		process.off("ui5.project-build-metadata", this._handleProjectBuildMetadataEvent);
		process.off("ui5.build-status", this._handleBuildStatusEvent);
		process.off("ui5.project-build-status", this._handleProjectBuildStatusEvent);
		process.off("ui5.log.stop-console", this._handleStop);
		if (this.#progressBarContainer) {
			this.#progressBar.stop();
			this.#progressBarContainer.stop(); // Will fire internal stop event
		}
	}

	/*
	 * Progress bar is only required when building projects. So we create it lazily
	 */
	_getProgressBar() {
		// Do not use a progress bar if there is no text terminal attached or verbose logging is enabled
		// * If log output is piped to a static output (= no TTY), no progress bar should be rendered
		// * Since logging through the progress bar is asynchronous (controlled by the FPS setting),
		//   exceptions might lead to log messages being dropped. Therefore do not use a progress bar
		//   for verbose logging
		// * If log-level is set to "silent", we should never render a progress bar
		if (process.stderr.isTTY !== true || Logger.isLevelEnabled("verbose") || Logger.getLevel() === "silent") {
			return null;
		}
		if (!this.#progressBarContainer) {
			// We use a "MultiBar" instance even though we intend to only render a single progress bar
			// This is because only MultiBar provides a "log" method as of today
			this.#progressBarContainer = new MultiBar({
				format: `{bar} {message}`,
				barsize: 20,
				linewrap: true,
				emptyOnZero: 0,
				hideCursor: true,

				// FPS also controls how fast a log message will be rendered above the progress bar
				fps: 120,

				// Disable progress bar explicitly for non-TTY, even though this is already checked above
				noTTYOutput: false,

				// Graceful exit is required to ensure all terminal settings (e.g. hideCursor)
				// are restored on SIGINT
				gracefulExit: true,

				// Required to prevent flickering when logging
				forceRedraw: true,

				clearOnComplete: true,
				stopOnComplete: true,

				barCompleteChar: figures.square,
				barIncompleteChar: figures.squareLightShade,
			});

			// Initialize empty progress bar to enable logging through the multibar instance
			this.#progressBar = this.#progressBarContainer.create(0, 0, {message: ""});

			this.#progressBarContainer.on("stop", () => {
				// Progress bar has finished and will remove itself from the output.
				// Therefore, further logging needs to be done directly to process.stderr. Otherwise it would disappear.
				// Therefore, we de-reference all instances now
				this.#progressBarContainer = null;
				this.#progressBar = null;
			});
		}
		return this.#progressBar;
	}

	#writeMessage(level, message) {
		if (!Logger.isLevelEnabled(level)) {
			return;
		}
		const levelPrefix = this.#getLevelPrefix(level);
		const msg = `${levelPrefix} ${message}\n`;

		if (this.#progressBarContainer) {
			// If a progress bar is in use, we have to log through it's API
			// cli-progress requires full control of the stderr output to ensure correct rendering
			this.#progressBarContainer.log(msg);
		} else {
			process.stderr.write(msg);
		}
	}

	#handleLogEvent({level, message, moduleName}) {
		this.#writeMessage(level, `${chalk.blue(moduleName)} ${message}`);
	}

	#handleBuildMetadataEvent({projectsToBuild}) {
		projectsToBuild.forEach((projectName) => {
			this.#projectMetadata.set(projectName, {
				buildStarted: false,
				buildSkipped: false,
				buildEnded: false,
				buildStartIndex: null,
				projectTasks: new Map(),
			});
		});
		this.#updateProgressBarTotal();
	}

	#handleProjectBuildMetadataEvent({tasksToRun, projectName, projectType}) {
		const projectMetadata = this.#getProjectMetadata(projectName);
		tasksToRun.forEach((taskName) => {
			projectMetadata.projectTasks.set(taskName, {
				executionStarted: false,
				executionEnded: false,
				executionStartIndex: null,
			});
		});
		this.#updateProgressBarTotal();
	}

	#getProjectMetadata(projectName) {
		const projectMetadata = this.#projectMetadata.get(projectName);
		if (!projectMetadata) {
			throw new Error(`writers/Console: Unknown project ${projectName}`);
		}
		return projectMetadata;
	}

	#updateProgressBarTotal() {
		let numberOfTasks = 0;
		this.#projectMetadata.forEach(({projectTasks}) => {
			numberOfTasks += projectTasks.size;
		});

		// Project progress should weigh more than single task progress
		// This is proportional to the number of projects (since that also multiplies the number of tasks)
		this.#progressProjectWeight = this.#projectMetadata.size;
		this._getProgressBar()?.setTotal(
			(this.#progressProjectWeight * this.#projectMetadata.size) + numberOfTasks);
	}

	#handleBuildStatusEvent({level, projectName, projectType, status}) {
		const projectMetadata = this.#getProjectMetadata(projectName);
		if (projectMetadata.buildStartIndex === null) {
			let nextIdx = 1;
			this.#projectMetadata.forEach((metadata) => {
				if (metadata.buildStartIndex !== null && metadata.buildStartIndex >= nextIdx) {
					nextIdx = metadata.buildStartIndex + 1;
				}
			});
			projectMetadata.buildStartIndex = nextIdx;
		}
		const buildIndex = `Project ${projectMetadata.buildStartIndex} of ${this.#projectMetadata.size}`;

		let message;
		switch (status) {
		case "project-build-start":
			if (projectMetadata.buildEnded) {
				throw new Error(
					`writers/Console: Unexpected project-build-start event for project ${projectName}. ` +
					`Project build already ended`);
			}
			if (projectMetadata.buildStarted) {
				throw new Error(
					`writers/Console: Unexpected duplicate project-build-start event for project ${projectName}`);
			}
			if (projectMetadata.buildSkipped) {
				throw new Error(
					`writers/Console: Unexpected project-build-start event for project ${projectName}. ` +
					`Project build already skipped`);
			}
			projectMetadata.buildStarted = true;
			message = `${chalk.blue(figures.pointer)} ` +
				`Building ${projectType} project ${chalk.bold(projectName)}...`;

			// Update progress bar message with current project
			this._getProgressBar()?.update({
				message: `${figures.pointer} Building ${projectType} project ${projectName}...`
			});
			break;
		case "project-build-end":
			if (projectMetadata.buildEnded) {
				throw new Error(
					`writers/Console: Unexpected duplicate project-build-end event for project ${projectName}`);
			}
			if (projectMetadata.buildSkipped) {
				throw new Error(
					`writers/Console: Unexpected project-build-end event for project ${projectName}. ` +
					`Project build already skipped`);
			}
			if (!projectMetadata.buildStarted) {
				throw new Error(
					`writers/Console: Unexpected project-build-end event for project ${projectName}. ` +
					`No corresponding project-build-start event handled`);
			}
			projectMetadata.buildEnded = true;
			message = `${chalk.green(figures.tick)} ` +
				`Finished building ${projectType} project ${chalk.bold(projectName)}`;

			// Update progress bar (if used)
			this._getProgressBar()?.increment(this.#progressProjectWeight);
			break;
		case "project-build-skip":
			if (projectMetadata.buildSkipped) {
				throw new Error(
					`writers/Console: Unexpected duplicate project-build-skip event for project ${projectName}`);
			}
			if (projectMetadata.buildEnded) {
				throw new Error(
					`writers/Console: Unexpected project-build-skip event for project ${projectName}. ` +
					`Project build already ended`);
			}
			if (projectMetadata.buildStarted) {
				throw new Error(
					`writers/Console: Unexpected project-build-skip event for project ${projectName}. ` +
					`Project build already started`);
			}
			projectMetadata.buildSkipped = true;
			message = `${chalk.yellow(figures.tick)} ` +
				`Skipping build of ${projectType} project ${chalk.bold(projectName)}`;

			// Update progress bar (if used)
			// All tasks of this projects are completed
			this._getProgressBar()?.increment(this.#progressProjectWeight + projectMetadata.projectTasks.size);
			break;
		default:
			this.#writeMessage("verbose",
				`writers/Console: Received unknown build-status ${status} for project ${projectName}`);
			return;
		}

		this.#writeMessage(level, `${chalk.grey(buildIndex)}: ${message}`);
	}

	#handleProjectBuildStatusEvent({level, projectName, projectType, taskName, status}) {
		const {projectTasks} = this.#getProjectMetadata(projectName);
		const taskMetadata = projectTasks.get(taskName);
		if (!taskMetadata) {
			throw new Error(`writers/Console: Unknown task ${taskName} for project ${projectName}`);
		}
		if (taskMetadata.executionStartIndex === null) {
			let nextIdx = 1;
			projectTasks.forEach((metadata) => {
				if (metadata.executionStartIndex !== null && metadata.executionStartIndex >= nextIdx) {
					nextIdx = metadata.executionStartIndex + 1;
				}
			});
			taskMetadata.executionStartIndex = nextIdx;
		}
		let taskIndex = "";
		if (Logger.isLevelEnabled("verbose")) {
			taskIndex = chalk.grey(`Task ${taskMetadata.executionStartIndex} of ${projectTasks.size} `);
		}

		let message;
		switch (status) {
		case "task-start":
			if (taskMetadata.executionEnded) {
				throw new Error(
					`writers/Console: Unexpected task-start event for project ${projectName}, task ${taskName}. ` +
					`Task execution already ended`);
			}
			if (taskMetadata.executionStarted) {
				throw new Error(`writers/Console: Unexpected duplicate task-start event ` +
					`for project ${projectName}, task ${taskName}`);
			}
			taskMetadata.executionStarted = true;
			message = `${chalk.blue(figures.pointerSmall)} Running task ${chalk.bold(taskName)}...`;
			break;
		case "task-end":
			if (taskMetadata.executionEnded) {
				throw new Error(`writers/Console: ` +
					`Unexpected duplicate task-end event for project ${projectName}, task ${taskName}`);
			}
			if (!taskMetadata.executionStarted) {
				throw new Error(
					`writers/Console: Unexpected task-end event for project ${projectName}, task ${taskName}. ` +
					`No corresponding task-start event handled`);
			}
			taskMetadata.executionEnded = true;
			message = `${chalk.green(figures.tick)} Finished task ${chalk.bold(taskName)}`;

			// Update progress bar (if used)
			this._getProgressBar()?.increment(1);
			break;
		default:
			this.#writeMessage("verbose",
				`writers/Console: Received unknown project-build-status ${status} for project ${projectName}`);
			return;
		}

		this.#writeMessage(level, `${chalk.blue(`${(projectName)}`)} ${taskIndex}${message}`);
	}

	#getLevelPrefix(level) {
		switch (level) {
		case "silly":
			return chalk.inverse(level);
		case "verbose":
			return chalk.cyan("verb");
		case "perf":
			return chalk.bgYellow.red(level);
		case "info":
			return chalk.green(level);
		case "warn":
			return chalk.yellow(level);
		case "error":
			return chalk.bgRed.white(level);
		// Log level silent does not produce messages
		default:
			return level;
		}
	}

	/**
	 * Creates a new instance and subscribes it to all events
	 *
	 * @public
	 */
	static init() {
		const cH = new Console();
		cH.enable();
		return cH;
	}

	static stop() {
		process.emit("ui5.log.stop-console");
	}
}

export default Console;

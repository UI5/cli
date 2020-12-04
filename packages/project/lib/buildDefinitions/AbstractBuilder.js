const {getTask} = require("@ui5/builder").tasks.taskRepository;
const composeTaskList = require("../buildHelpers/composeTaskList");

/**
 * Resource collections
 *
 * @public
 * @typedef module:@ui5/builder.BuilderResourceCollections
 * @property {module:@ui5/fs.DuplexCollection} workspace Workspace Resource
 * @property {module:@ui5/fs.ReaderCollection} dependencies Workspace Resource
 */

/**
 * Base class for the builder implementation of a project type
 *
 * @abstract
 */
class AbstractBuilder {
	/**
	 * Constructor
	 *
	 * @param {object} parameters
	 * @param {object} parameters.graph
	 * @param {object} parameters.project
	 * @param {GroupLogger} parameters.parentLogger Logger to use
	 * @param {object} parameters.taskUtil
	 */
	constructor({graph, project, parentLogger, taskUtil}) {
		if (new.target === AbstractBuilder) {
			throw new TypeError("Class 'AbstractBuilder' is abstract");
		}

		this.project = project;
		this.graph = graph;
		this.taskUtil = taskUtil;

		this.log = parentLogger.createSubLogger(project.getType() + " " + project.getName(), 0.2);
		this.taskLog = this.log.createTaskLogger("🔨");

		this.tasks = {};
		this.taskExecutionOrder = [];

		this.addStandardTasks({
			project,
			taskUtil,
			getTask
		});
		this.addCustomTasks({
			graph,
			project,
			taskUtil
		});
	}

	/**
	 * Adds all standard tasks to execute
	 *
	 * @abstract
	 * @protected
	 * @param {object} parameters
	 * @param {object} parameters.taskUtil
	 * @param {object} parameters.project
	 */
	addStandardTasks({project, taskUtil}) {
		throw new Error("Function 'addStandardTasks' is not implemented");
	}

	/**
	 * Adds custom tasks to execute
	 *
	 * @private
	 * @param {object} parameters
	 * @param {object} parameters.graph
	 * @param {object} parameters.project
	 * @param {object} parameters.taskUtil
	 */
	addCustomTasks({graph, project, taskUtil}) {
		const projectCustomTasks = project.getCustomTasks();
		if (!projectCustomTasks || projectCustomTasks.length === 0) {
			return; // No custom tasks defined
		}
		for (let i = 0; i < projectCustomTasks.length; i++) {
			const taskDef = projectCustomTasks[i];
			if (!taskDef.name) {
				throw new Error(`Missing name for custom task definition of project ${project.getName()} ` +
					`at index ${i}`);
			}
			if (taskDef.beforeTask && taskDef.afterTask) {
				throw new Error(`Custom task definition ${taskDef.name} of project ${project.getName()} ` +
					`defines both "beforeTask" and "afterTask" parameters. Only one must be defined.`);
			}
			if (this.taskExecutionOrder.length && !taskDef.beforeTask && !taskDef.afterTask) {
				// Iff there are tasks configured, beforeTask or afterTask must be given
				throw new Error(`Custom task definition ${taskDef.name} of project ${project.getName()} ` +
					`defines neither a "beforeTask" nor an "afterTask" parameter. One must be defined.`);
			}

			let newTaskName = taskDef.name;
			if (this.tasks[newTaskName]) {
				// Task is already known
				// => add a suffix to allow for multiple configurations of the same task
				let suffixCounter = 0;
				while (this.tasks[newTaskName]) {
					suffixCounter++; // Start at 1
					newTaskName = `${taskDef.name}--${suffixCounter}`;
				}
			}
			const task = graph.getExtension(taskDef.name);
			// TODO: Create callback for custom tasks to configure "requiresDependencies" and "enabled"
			// 		Input: task "options" and build mode ("standalone", "preload", etc.)
			const requiresDependencies = true; // Default to true for old spec versions
			const execTask = function({workspace, dependencies}) {
				/* Custom Task Interface
					Parameters:
						{Object} parameters Parameters
						{module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
						{module:@ui5/fs.AbstractReader} parameters.dependencies
							Reader or Collection to read dependency files
						{Object} parameters.taskUtil Specification Version dependent interface to a
							[TaskUtil]{@link module:@ui5/builder.tasks.TaskUtil} instance
						{Object} parameters.options Options
						{string} parameters.options.projectName Project name
						{string} [parameters.options.projectNamespace] Project namespace if available
						{string} [parameters.options.configuration] Task configuration if given in ui5.yaml
					Returns:
						{Promise<undefined>} Promise resolving with undefined once data has been written
				*/
				const params = {
					workspace,
					options: {
						projectName: project.getName(),
						projectNamespace: project.getNamespace(),
						configuration: taskDef.configuration
					}
				};

				if (requiresDependencies) {
					params.dependencies = dependencies;
				}

				const taskUtilInterface = taskUtil.getInterface(task.getSpecVersion());
				// Interface is undefined if specVersion does not support taskUtil
				if (taskUtilInterface) {
					params.taskUtil = taskUtilInterface;
				}
				return task.getTask()(params);
			};

			this.tasks[newTaskName] = {
				task: execTask,
				requiresDependencies
			};

			if (this.taskExecutionOrder.length) {
				// There is at least one task configured. Use before- and afterTask to add the custom task
				const refTaskName = taskDef.beforeTask || taskDef.afterTask;
				let refTaskIdx = this.taskExecutionOrder.indexOf(refTaskName);
				if (refTaskIdx === -1) {
					throw new Error(`Could not find task ${refTaskName}, referenced by custom task ${newTaskName}, ` +
						`to be scheduled for project ${project.getName()}`);
				}
				if (taskDef.afterTask) {
					// Insert after index of referenced task
					refTaskIdx++;
				}
				this.taskExecutionOrder.splice(refTaskIdx, 0, newTaskName);
			} else {
				// There is no task configured so far. Just add the custom task
				this.taskExecutionOrder.push(newTaskName);
			}
		}
	}

	/**
	 * Adds a executable task to the builder
	 *
	 * The order this function is being called defines the build order. FIFO.
	 *
	 * @param {string} taskName Name of the task which should be in the list availableTasks.
	 * @param {object} [parameters]
	 * @param {boolean} [parameters.requiresDependencies]
	 * @param {object} [parameters.options]
	 * @param {Function} [taskFunction]
	 */
	addTask(taskName, {requiresDependencies = false, options = {}} = {}, taskFunction) {
		if (this.tasks[taskName]) {
			throw new Error(`Failed to add duplicate task ${taskName} for project ${this.project.getName()}`);
		}
		if (this.taskExecutionOrder.includes(taskName)) {
			throw new Error(`Builder: Failed to add task ${taskName} for project ${this.project.getName()}. ` +
				`It has already been scheduled for execution.`);
		}

		const task = ({workspace, dependencies}) => {
			options.projectName = this.project.getName();
			// TODO: Deprecate "namespace" in favor of "projectNamespace" as already used for custom tasks?
			options.projectNamespace = this.project.getNamespace();

			const params = {
				workspace,
				taskUtil: this.taskUtil,
				options
			};

			if (requiresDependencies) {
				params.dependencies = dependencies;
			}

			if (!taskFunction) {
				taskFunction = getTask(taskName).task;
			}
			return taskFunction(params);
		};
		this.tasks[taskName] = {
			task,
			requiresDependencies
		};
		this.taskExecutionOrder.push(taskName);
	}

	/**
	 * Takes a list of tasks which should be executed from the available task list of the current builder
	 *
	 * @param {object} buildConfig
	 * @param {boolean} buildConfig.selfContained
	 *			True if a the build should be self-contained or false for prelead build bundles
	 * @param {boolean} buildConfig.jsdoc True if a JSDoc build should be executed
	 * @param {Array} buildConfig.includedTasks Task list to be included from build
	 * @param {Array} buildConfig.excludedTasks Task list to be excluded from build
	 * @param {object} buildParams
	 * @param {module:@ui5/fs.DuplexCollection} buildParams.workspace Workspace of the current project
	 * @param {module:@ui5/fs.ReaderCollection} buildParams.dependencies Dependencies reader collection
	 * @returns {Promise} Returns promise chain with tasks
	 */
	async build(buildConfig, buildParams) {
		const tasksToRun = composeTaskList(Object.keys(this.tasks), buildConfig);
		const allTasks = this.taskExecutionOrder.filter((taskName) => {
			// There might be a numeric suffix in case a custom task is configured multiple times.
			// The suffix needs to be removed in order to check against the list of tasks to run.
			//
			// Note: The 'tasksToRun' parameter only allows to specify the custom task name
			// (without suffix), so it executes either all or nothing.
			// It's currently not possible to just execute some occurrences of a custom task.
			// This would require a more robust contract to identify task executions
			// (e.g. via an 'id' that can be assigned to a specific execution in the configuration).
			const taskWithoutSuffixCounter = taskName.replace(/--\d+$/, "");
			return tasksToRun.includes(taskWithoutSuffixCounter);
		});

		this.taskLog.addWork(allTasks.length);

		for (const taskName of allTasks) {
			const taskFunction = this.tasks[taskName].task;

			if (typeof taskFunction === "function") {
				await this.executeTask(taskName, taskFunction, buildParams);
			}
		}
	}

	requiresDependencies(buildConfig) {
		const tasksToRun = composeTaskList(Object.keys(this.tasks), buildConfig);
		const allTasks = this.taskExecutionOrder.filter((taskName) => {
			// There might be a numeric suffix in case a custom task is configured multiple times.
			// The suffix needs to be removed in order to check against the list of tasks to run.
			//
			// Note: The 'tasksToRun' parameter only allows to specify the custom task name
			// (without suffix), so it executes either all or nothing.
			// It's currently not possible to just execute some occurrences of a custom task.
			// This would require a more robust contract to identify task executions
			// (e.g. via an 'id' that can be assigned to a specific execution in the configuration).
			const taskWithoutSuffixCounter = taskName.replace(/--\d+$/, "");
			return tasksToRun.includes(taskWithoutSuffixCounter);
		});
		return allTasks.some((taskName) => {
			if (this.tasks[taskName].requiresDependencies) {
				this.log.verbose(`Task ${taskName} for project ${this.project.getName()} requires dependencies`);
				return true;
			}
			return false;
		});
	}

	/**
	 * Adds progress related functionality to task function.
	 *
	 * @private
	 * @param {string} taskName Name of the task
	 * @param {Function} taskFunction Function which executed the task
	 * @param {object} taskParams Base parameters for all tasks
	 * @returns {Promise} Resolves when task has finished
	 */
	async executeTask(taskName, taskFunction, taskParams) {
		this.taskLog.startWork(`Running task ${taskName}...`);
		this._taskStart = performance.now();
		await taskFunction(taskParams);
		this.taskLog.completeWork(1);
		if (process.env.UI5_LOG_TASK_PERF) {
			this.taskLog.info(`Task succeeded in ${Math.round((performance.now() - this._taskStart))} ms`);
		}
	}

	/**
	 * Appends the list of 'excludes' to the list of 'patterns'. To harmonize both lists, the 'excludes'
	 * are negated and the 'patternPrefix' is added to make them absolute.
	 *
	 * @private
	 * @param {string[]} patterns
	 *   List of absolute default patterns.
	 * @param {string[]} excludes
	 *   List of relative patterns to be excluded. Excludes with a leading "!" are meant to be re-included.
	 * @param {string} patternPrefix
	 *   Prefix to be added to the excludes to make them absolute. The prefix must have a leading and a
	 *   trailing "/".
	 */
	enhancePatternWithExcludes(patterns, excludes, patternPrefix) {
		excludes.forEach((exclude) => {
			if (exclude.startsWith("!")) {
				patterns.push(`${patternPrefix}${exclude.slice(1)}`);
			} else {
				patterns.push(`!${patternPrefix}${exclude}`);
			}
		});
	}
}

module.exports = AbstractBuilder;

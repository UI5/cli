import composeTaskList from "./helpers/composeTaskList.js";
import logger from "@ui5/logger";

/**
 * TaskRunner
 *
 * @private
 * @hideconstructor
 */
class TaskRunner {
	/**
	 * Constructor
	 *
	 * @param {object} parameters
	 * @param {object} parameters.graph
	 * @param {object} parameters.project
	 * @param {@ui5/logger/GroupLogger} parameters.parentLogger Logger to use
	 * @param {@ui5/project/build/helpers/TaskUtil} parameters.taskUtil TaskUtil instance
	 * @param {@ui5/builder/tasks/taskRepository} parameters.taskRepository Task repository
	 * @param {@ui5/project/build/ProjectBuilder~BuildConfiguration} parameters.buildConfig
	 * 			Build configuration
	 * @param {Map<string, object>} parameters.standardTasks Standard tasks
	 */
	constructor({graph, project, parentLogger, taskUtil, taskRepository, buildConfig, standardTasks}) {
		if (!graph || !project || !parentLogger || !taskUtil || !buildConfig || !standardTasks) {
			throw new Error("One or more mandatory parameters not provided");
		}
		this._project = project;
		this._graph = graph;
		this._taskUtil = taskUtil;
		this._taskRepository = taskRepository;
		this._buildConfig = buildConfig;

		this._log = parentLogger.createSubLogger(project.getType() + " " + project.getName(), 0.2);
		this._taskLog = this._log.createTaskLogger("🔨");

		this._tasks = Object.create(null);
		this._taskExecutionOrder = [];

		for (const [taskName, params] of standardTasks) {
			this._addTask(taskName, params);
		}

		this._addCustomTasks({
			graph,
			project,
			taskUtil
		});
	}

	/**
	 * Creates a new TaskRunner Instance
	 *
	 * @param {object} parameters
	 * @param {object} parameters.graph
	 * @param {object} parameters.project
	 * @param {@ui5/logger/GroupLogger} parameters.parentLogger Logger to use
	 * @param {@ui5/project/build/helpers/TaskUtil} parameters.taskUtil TaskUtil instance
	 * @param {@ui5/builder/tasks/taskRepository} parameters.taskRepository Task repository
	 * @param {@ui5/project/build/ProjectBuilder~BuildConfiguration} parameters.buildConfig
	 * 			Build configuration
	 */
	static async create({graph, project, parentLogger, taskUtil, taskRepository, buildConfig}) {
		let buildDefinition;

		switch (project.getType()) {
		case "application":
			buildDefinition = "./definitions/application.js";
			break;
		case "library":
			buildDefinition = "./definitions/library.js";
			break;
		case "module":
			buildDefinition = "./definitions/module.js";
			break;
		case "theme-library":
			buildDefinition = "./definitions/themeLibrary.js";
			break;
		default:
			throw new Error(`Unknown project type ${project.getType()}`);
		}

		const {default: getStandardTasks} = await import(buildDefinition);

		const standardTasks = getStandardTasks({
			project,
			taskUtil,
			getTask: taskRepository.getTask
		});

		return new TaskRunner({graph, project, parentLogger, taskUtil, taskRepository, buildConfig, standardTasks});
	}

	/**
	 * Takes a list of tasks which should be executed from the available task list of the current builder
	 *
	 * @param {object} buildParams
	 * @param {@ui5/fs/DuplexCollection} buildParams.workspace Workspace of the current project
	 * @param {@ui5/fs/ReaderCollection} buildParams.dependencies Dependencies reader collection
	 * @returns {Promise} Returns promise chain with tasks
	 */
	async runTasks(buildParams) {
		const tasksToRun = composeTaskList(Object.keys(this._tasks), this._buildConfig);
		const allTasks = this._taskExecutionOrder.filter((taskName) => {
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

		this._taskLog.addWork(allTasks.length);

		for (const taskName of allTasks) {
			const taskFunction = this._tasks[taskName].task;

			if (typeof taskFunction === "function") {
				await this._executeTask(taskName, taskFunction, buildParams);
			}
		}
	}

	/**
	 * Takes a list of tasks which should be executed from the available task list of the current builder
	 *
	 * @returns {Promise} Returns promise chain with tasks
	 */
	requiresDependencies() {
		const tasksToRun = composeTaskList(Object.keys(this._tasks), this._buildConfig);
		const allTasks = this._taskExecutionOrder.filter((taskName) => {
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
			if (this._tasks[taskName].requiresDependencies) {
				this._log.verbose(`Task ${taskName} for project ${this._project.getName()} requires dependencies`);
				return true;
			}
			return false;
		});
	}

	requiresBuild() {
		// TODO: Decide based on build config and manifest content
		return !this._project.hasBuildManifest();
	}

	getBuildMetadata() {
		if (this._project.hasBuildManifest()) {
			const buildManifest = this._project.getBuildManifest();
			const timeDiff = (new Date().getTime() - new Date(buildManifest.timestamp).getTime());

			// TODO: Format age properly via a new @ui5/logger util module
			return {
				timestamp: buildManifest.timestamp,
				age: timeDiff / 1000 + " seconds"
			};
		} else {
			return null;
		}
	}

	/**
	 * Adds an executable task to the builder
	 *
	 * The order this function is being called defines the build order. FIFO.
	 *
	 * @param {string} taskName Name of the task which should be in the list availableTasks.
	 * @param {object} [parameters]
	 * @param {boolean} [parameters.requiresDependencies]
	 * @param {object} [parameters.options]
	 * @param {Function} [parameters.taskFunction]
	 */
	_addTask(taskName, {requiresDependencies = false, options = {}, taskFunction} = {}) {
		if (this._tasks[taskName]) {
			throw new Error(`Failed to add duplicate task ${taskName} for project ${this._project.getName()}`);
		}
		if (this._taskExecutionOrder.includes(taskName)) {
			throw new Error(`Failed to add task ${taskName} for project ${this._project.getName()}. ` +
				`It has already been scheduled for execution`);
		}

		const task = async ({workspace, dependencies}, log) => {
			options.projectName = this._project.getName();
			options.projectNamespace = this._project.getNamespace();

			const params = {
				workspace,
				taskUtil: this._taskUtil,
				options
			};

			if (requiresDependencies) {
				params.dependencies = dependencies;
			}

			if (!taskFunction) {
				taskFunction = (await this._taskRepository.getTask(taskName)).task;
			}
			return taskFunction(params);
		};
		this._tasks[taskName] = {
			task,
			requiresDependencies
		};
		this._taskExecutionOrder.push(taskName);
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
	_addCustomTasks({graph, project, taskUtil}) {
		const projectCustomTasks = project.getCustomTasks();
		if (!projectCustomTasks || projectCustomTasks.length === 0) {
			return; // No custom tasks defined
		}
		for (let i = 0; i < projectCustomTasks.length; i++) {
			const taskDef = projectCustomTasks[i];
			if (!taskDef.name) {
				throw new Error(`Missing name for custom task in configuration of project ${project.getName()}`);
			}
			if (taskDef.beforeTask && taskDef.afterTask) {
				throw new Error(`Custom task definition ${taskDef.name} of project ${project.getName()} ` +
					`defines both "beforeTask" and "afterTask" parameters. Only one must be defined.`);
			}
			if (this._taskExecutionOrder.length && !taskDef.beforeTask && !taskDef.afterTask) {
				// Iff there are tasks configured, beforeTask or afterTask must be given
				throw new Error(`Custom task definition ${taskDef.name} of project ${project.getName()} ` +
					`defines neither a "beforeTask" nor an "afterTask" parameter. One must be defined.`);
			}
			const standardTasks = this._taskRepository.getAllTaskNames();
			if (standardTasks.includes(taskDef.name)) {
				throw new Error(
					`Custom task configuration of project ${project.getName()} ` +
					`references standard task ${taskDef.name}. Only custom tasks must be provided here.`);
			}

			let newTaskName = taskDef.name;
			if (this._tasks[newTaskName]) {
				// Task is already known
				// => add a suffix to allow for multiple configurations of the same task
				let suffixCounter = 1;
				while (this._tasks[newTaskName]) {
					suffixCounter++; // Start at 2
					newTaskName = `${taskDef.name}--${suffixCounter}`;
				}
			}
			const task = graph.getExtension(taskDef.name);
			if (!task) {
				throw new Error(
					`Could not find custom task ${taskDef.name}, referenced by project ${project.getName()} ` +
					`in project graph with root node ${graph.getRoot().getName()}`);
			}
			// TODO: Create callback for custom tasks to configure "requiresDependencies" and "enabled"
			// 		Input: task "options" and build mode ("standalone", "preload", etc.)
			const requiresDependencies = true; // Default to true for old spec versions
			const execTask = async function({workspace, dependencies}, log) {
				/* Custom Task Interface
					Parameters:
						{Object} parameters Parameters
						{@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
						{@ui5/fs/AbstractReader} parameters.dependencies
							Reader or Collection to read dependency files
						{@ui5/project/build/helpers/TaskUtil} parameters.taskUtil Specification Version-dependent
							interface of a [TaskUtil]{@link @ui5/project/build/helpers/TaskUtil} instance
						{@ui5/logger/GroupLogger} [parameters.log] Logger instance to use by the custom task.
							This parameter is only available to custom task extensions defining
	 						<b>Specification Version 3.0 and above</b>.
						{Object} parameters.options Options
						{string} parameters.options.projectName Project name
						{string|null} parameters.options.projectNamespace Project namespace if available
						{string} [parameters.options.taskName] Runtime name of the task.
							If a task is executed multiple times, a suffix is added to distinguish the executions.
							This attribute is only available to custom task extensions defining
	 						<b>Specification Version 3.0 and above</b>.
						{string} [parameters.options.configuration] Task configuration if given in ui5.yaml
					Returns:
						{Promise<undefined>} Promise resolving with undefined once data has been written
				*/
				const params = {
					workspace,
					options: {
						projectName: project.getName(),
						projectNamespace: project.getNamespace(),
						configuration: taskDef.configuration,
					}
				};

				if (requiresDependencies) {
					params.dependencies = dependencies;
				}

				const specVersion = task.getSpecVersion();
				if (specVersion.gte("3.0")) {
					params.options.taskName = newTaskName;
					params.log = logger.getGroupLogger(`builder:custom-task:${newTaskName}`);
				}

				const taskUtilInterface = taskUtil.getInterface(specVersion);
				// Interface is undefined if specVersion does not support taskUtil
				if (taskUtilInterface) {
					params.taskUtil = taskUtilInterface;
				}
				return (await task.getTask())(params);
			};

			this._tasks[newTaskName] = {
				task: execTask,
				requiresDependencies
			};

			if (this._taskExecutionOrder.length) {
				// There is at least one task configured. Use before- and afterTask to add the custom task
				const refTaskName = taskDef.beforeTask || taskDef.afterTask;
				let refTaskIdx = this._taskExecutionOrder.indexOf(refTaskName);
				if (refTaskIdx === -1) {
					throw new Error(`Could not find task ${refTaskName}, referenced by custom task ${newTaskName}, ` +
						`to be scheduled for project ${project.getName()}`);
				}
				if (taskDef.afterTask) {
					// Insert after index of referenced task
					refTaskIdx++;
				}
				this._taskExecutionOrder.splice(refTaskIdx, 0, newTaskName);
			} else {
				// There is no task configured so far. Just add the custom task
				this._taskExecutionOrder.push(newTaskName);
			}
		}
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
	async _executeTask(taskName, taskFunction, taskParams) {
		this._taskLog.startWork(`Running task ${taskName}...`);
		this._taskStart = performance.now();
		await taskFunction(taskParams, this._taskLog);
		this._taskLog.completeWork(1);
		if (this._taskLog.isLevelEnabled("perf")) {
			this._taskLog.perf(`Task ${taskName} finished in ${Math.round((performance.now() - this._taskStart))} ms`);
		}
	}
}

export default TaskRunner;

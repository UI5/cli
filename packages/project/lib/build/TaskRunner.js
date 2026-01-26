import {getLogger} from "@ui5/logger";
import composeTaskList from "./helpers/composeTaskList.js";
import {createReaderCollection, createMonitor} from "@ui5/fs/resourceFactory";

/**
 * TaskRunner
 *
 * Manages the execution of build tasks for a project, including task composition,
 * dependency management, and custom task integration.
 *
 * @hideconstructor
 */
class TaskRunner {
	/**
	 * Constructor
	 *
	 * @param {object} parameters Parameters
	 * @param {@ui5/project/graph/ProjectGraph} parameters.graph Project graph instance
	 * @param {@ui5/project/specifications/Project} parameters.project Project instance
	 * @param {@ui5/logger/loggers/ProjectBuild} parameters.log Logger to use
	 * @param {@ui5/project/build/cache/ProjectBuildCache} parameters.buildCache Build cache instance
	 * @param {@ui5/project/build/helpers/TaskUtil} parameters.taskUtil TaskUtil instance
	 * @param {@ui5/builder/tasks/taskRepository} parameters.taskRepository Task repository
	 * @param {@ui5/project/build/ProjectBuilder~BuildConfiguration} parameters.buildConfig
	 * 			Build configuration
	 */
	constructor({graph, project, log, buildCache, taskUtil, taskRepository, buildConfig}) {
		if (!graph || !project || !log || !buildCache || !taskUtil || !taskRepository || !buildConfig) {
			throw new Error("TaskRunner: One or more mandatory parameters not provided");
		}
		this._project = project;
		this._graph = graph;
		this._taskUtil = taskUtil;
		this._taskRepository = taskRepository;
		this._buildConfig = buildConfig;
		this._log = log;
		this._buildCache = buildCache;

		this._directDependencies = new Set(this._taskUtil.getDependencies());
	}

	/**
	 * Initializes the task list based on the project type
	 *
	 * This method:
	 * 1. Loads the appropriate build definition for the project type
	 * 2. Adds all standard tasks from the definition
	 * 3. Adds any custom tasks configured for the project
	 *
	 * @returns {Promise<void>}
	 */
	async _initTasks() {
		if (this._tasks) {
			return;
		}

		this._tasks = Object.create(null);
		this._taskExecutionOrder = [];

		const project = this._project;
		let buildDefinition;

		switch (project.getType()) {
		case "application":
			buildDefinition = "./definitions/application.js";
			break;
		case "library":
			buildDefinition = "./definitions/library.js";
			break;
		case "component":
			buildDefinition = "./definitions/component.js";
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
			taskUtil: this._taskUtil,
			getTask: this._taskRepository.getTask
		});

		for (const [taskName, params] of standardTasks) {
			this._addTask(taskName, params);
		}

		await this._addCustomTasks();
	}

	/**
	 * Executes all configured tasks for the project
	 *
	 * This method:
	 * 1. Initializes the task list if not already done
	 * 2. Ensures dependency reader is ready
	 * 3. Composes the final list of tasks to execute based on build configuration
	 * 4. Executes each task in order, respecting cache and abort signals
	 * 5. Returns the list of changed resources after all tasks complete
	 *
	 * @public
	 * @param {AbortSignal} [signal] Abort signal to cancel task execution
	 * @returns {Promise<string[]>} Array of changed resource paths since the last build
	 */
	async runTasks(signal) {
		await this._initTasks();

		// Ensure cached dependencies reader is initialized and up-to-date (TODO: improve this lifecycle)
		await this.getDependenciesReader(this._directDependencies);

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
			return tasksToRun.includes(taskWithoutSuffixCounter) &&
				// Task can be explicitly excluded by making its taskFunction = null
				this._tasks[taskName].task !== null;
		});

		this._log.setTasks(allTasks);
		this._buildCache.setTasks(allTasks);
		for (const taskName of allTasks) {
			signal?.throwIfAborted();
			const taskFunction = this._tasks[taskName].task;

			if (typeof taskFunction === "function") {
				await this._executeTask(taskName, taskFunction);
			}
		}
		return await this._buildCache.allTasksCompleted();
	}

	/**
	 * Determines which project dependencies are required by the tasks that will be executed
	 *
	 * This method:
	 * 1. Initializes the task list if needed
	 * 2. Composes the list of tasks that will be executed
	 * 3. Collects all dependencies required by those tasks
	 *
	 * @public
	 * @returns {Promise<Set<string>>} Set containing the names of all required direct project dependencies
	 */
	async getRequiredDependencies() {
		if (this._requiredDependencies) {
			return this._requiredDependencies;
		}
		await this._initTasks();
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
		this._requiredDependencies = allTasks.reduce((requiredDependencies, taskName) => {
			if (this._tasks[taskName].requiredDependencies.size) {
				this._log.verbose(`Task ${taskName} for project ${this._project.getName()} requires dependencies`);
			}
			for (const depName of this._tasks[taskName].requiredDependencies) {
				requiredDependencies.add(depName);
			}
			return requiredDependencies;
		}, new Set());
		return this._requiredDependencies;
	}

	/**
	 * Adds an executable task to the builder
	 *
	 * The order this function is called defines the build order (FIFO).
	 * Tasks can be explicitly skipped by setting taskFunction to null.
	 *
	 * @param {string} taskName Name of the task to add
	 * @param {object} [parameters] Task parameters
	 * @param {boolean} [parameters.requiresDependencies=false]
	 *   Whether the task requires access to project dependencies
	 * @param {boolean} [parameters.supportsDifferentialUpdates=false]
	 *   Whether the task supports differential updates using cache
	 * @param {object} [parameters.options={}] Options to pass to the task
	 * @param {Function|null} [parameters.taskFunction]
	 *   Task function to execute, or null to explicitly skip the task
	 * @returns {void}
	 */
	_addTask(taskName, {
		requiresDependencies = false, supportsDifferentialUpdates = false, options = {}, taskFunction
	} = {}) {
		if (this._tasks[taskName]) {
			throw new Error(`Failed to add duplicate task ${taskName} for project ${this._project.getName()}`);
		}
		if (this._taskExecutionOrder.includes(taskName)) {
			throw new Error(`Failed to add task ${taskName} for project ${this._project.getName()}. ` +
				`It has already been scheduled for execution`);
		}

		let task;
		if (taskFunction === null) {
			this._log.verbose(`Task ${taskName} is set to be explicitly skipped in definitions.`);
			task = null;
		} else {
			task = async (log) => {
				options.projectName = this._project.getName();
				options.projectNamespace = this._project.getNamespace();

				const cacheInfo = await this._buildCache.prepareTaskExecutionAndValidateCache(taskName);
				if (cacheInfo === true) {
					this._log.skipTask(taskName);
					return;
				}
				const usingCache = !!(supportsDifferentialUpdates && cacheInfo);
				const workspace = createMonitor(this._project.getWorkspace());
				const params = {
					workspace,
					taskUtil: this._taskUtil,
					options,
				};

				let dependencies;
				if (requiresDependencies) {
					dependencies = createMonitor(this._cachedDependenciesReader);
					params.dependencies = dependencies;
				}
				if (usingCache) {
					params.changedProjectResourcePaths = cacheInfo.changedProjectResourcePaths;
					if (requiresDependencies) {
						params.changedDependencyResourcePaths = cacheInfo.changedDependencyResourcePaths;
					}
				}
				if (!taskFunction) {
					const {task} = await this._taskRepository.getTask(taskName);
					taskFunction = task;
				}
				this._log.startTask(taskName, usingCache);
				this._taskStart = performance.now();
				await taskFunction(params);
				if (this._log.isLevelEnabled("perf")) {
					this._log.perf(
						`Task ${taskName} finished in ${Math.round((performance.now() - this._taskStart))} ms`);
				}
				this._log.endTask(taskName);
				await this._buildCache.recordTaskResult(taskName,
					workspace.getResourceRequests(),
					dependencies?.getResourceRequests(),
					usingCache ? cacheInfo : undefined,
					supportsDifferentialUpdates);
			};
		}
		this._tasks[taskName] = {
			task,
			requiredDependencies: requiresDependencies ? this._directDependencies : new Set()
		};
		this._taskExecutionOrder.push(taskName);
	}

	/**
	 * Adds all custom tasks configured for the project
	 *
	 * Processes custom tasks in the order they are defined in the project configuration.
	 *
	 * @returns {Promise<void>}
	 */
	async _addCustomTasks() {
		const projectCustomTasks = this._project.getCustomTasks();
		if (!projectCustomTasks || projectCustomTasks.length === 0) {
			return; // No custom tasks defined
		}
		for (let i = 0; i < projectCustomTasks.length; i++) {
			// Add tasks one-by-one to keep order as defined in project configuration
			await this._addCustomTask(projectCustomTasks[i]);
		}
	}
	/**
	 * Adds a single custom task to the task execution order
	 *
	 * This method:
	 * 1. Validates the custom task definition
	 * 2. Loads the task extension from the project graph
	 * 3. Determines required dependencies via callback if provided
	 * 4. Creates a wrapper function for the custom task
	 * 5. Inserts the task at the correct position based on beforeTask/afterTask configuration
	 *
	 * @param {object} taskDef Custom task definition from project configuration
	 * @param {string} taskDef.name Name of the custom task
	 * @param {string} [taskDef.beforeTask] Name of task to insert before
	 * @param {string} [taskDef.afterTask] Name of task to insert after
	 * @param {object} [taskDef.configuration] Custom task configuration
	 * @returns {Promise<void>}
	 */
	async _addCustomTask(taskDef) {
		const project = this._project;
		const graph = this._graph;
		const taskUtil = this._taskUtil;

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

		// Tasks can provide an optional callback to tell build process which dependencies they require
		const requiredDependenciesCallback = await task.getRequiredDependenciesCallback();
		// const buildSignatureCallback = await task.getBuildSignatureCallback();
		// const expectedOutputCallback = await task.getExpectedOutputCallback();
		const supportsDifferentialUpdatesCallback = await task.getSupportsDifferentialUpdatesCallback();
		const specVersion = task.getSpecVersion();
		let requiredDependencies;

		// Always provide a dependencies-reader, even if empty. Unless the task is specVersion >=3.0
		// and did not define the respective callback.
		// This is to distinguish between tasks semi-intentionally not requesting any dependencies,
		// because none are available (i.e. because the project does not have any) and tasks that
		// intentionally do not request any dependencies, by not providing a dependency-determination callback function
		let provideDependenciesReader = true;
		if (!requiredDependenciesCallback) {
			if (specVersion.gte("3.0")) {
				// Default for new spec versions: Provide no dependencies if no callback is provided
				this._log.verbose(
					`Custom task ${task.getName()} of project ${this._project.getName()} ` +
					`does not provide a callback for determining its required dependencies. ` +
					`Defaulting to not providing any dependencies to the task`);
				requiredDependencies = new Set();

				// Ensure that no reader is provided, in order to produce an exception if
				// access is still attempted
				provideDependenciesReader = false;
			} else {
				// Default for old spec versions: Assume all dependencies are required
				requiredDependencies = this._directDependencies;
			}
		} else {
			const dependencyDeterminationParams = {
				availableDependencies: new Set(this._directDependencies)
			};

			if (specVersion.gte("3.0")) {
				// Add getProjects, getDependencies and options to parameters
				const taskUtilInterface = taskUtil.getInterface(specVersion);
				dependencyDeterminationParams.getProject =
					taskUtilInterface.getProject.bind(taskUtilInterface);
				dependencyDeterminationParams.getDependencies =
					taskUtilInterface.getDependencies.bind(taskUtilInterface);
			}

			dependencyDeterminationParams.options = {
				projectName: project.getName(),
				projectNamespace: project.getNamespace(),
				configuration: taskDef.configuration,
				taskName: newTaskName
			};

			requiredDependencies = await requiredDependenciesCallback(dependencyDeterminationParams);
			if (!(requiredDependencies instanceof Set)) {
				throw new Error(
					`'determineRequiredDependencies' callback function of custom task ${task.getName()} of ` +
					`project ${project.getName()} must resolve with Set.`);
			}
			requiredDependencies.forEach((depName) => {
				// Returned requiredDependencies must be a subset of all direct dependencies of the project
				if (!this._directDependencies.has(depName)) {
					throw new Error(
						`'determineRequiredDependencies' callback function of custom task ${task.getName()} ` +
						`of project ${project.getName()} must resolve with a subset of the the direct ` +
						`dependencies of the project. ${depName} is not a direct dependency of the project.`);
				}
			});
		}
		let supportsDifferentialUpdates = false;
		if (specVersion.gte("5.0") && supportsDifferentialUpdatesCallback && supportsDifferentialUpdatesCallback()) {
			supportsDifferentialUpdates = true;
		}

		this._tasks[newTaskName] = {
			task: this._createCustomTaskWrapper({
				task,
				project,
				taskUtil,
				taskName: newTaskName,
				taskConfiguration: taskDef.configuration,
				provideDependenciesReader,
				supportsDifferentialUpdates,
				getDependenciesReaderCb: () => {
					// Create the dependencies reader on-demand
					return this.getDependenciesReader(requiredDependencies);
				},
			}),
			requiredDependencies
		};

		if (this._taskExecutionOrder.length) {
			// There is at least one task configured. Use before- and afterTask to add the custom task
			const refTaskName = taskDef.beforeTask || taskDef.afterTask;
			let refTaskIdx = this._taskExecutionOrder.indexOf(refTaskName);
			if (refTaskIdx === -1) {
				if (this._taskRepository.getRemovedTaskNames().includes(refTaskName)) {
					throw new Error(
						`Standard task ${refTaskName}, referenced by custom task ${newTaskName} ` +
						`in project ${project.getName()}, ` +
						`has been removed in this version of UI5 CLI and can't be referenced anymore. ` +
						`Please see the migration guide at https://ui5.github.io/cli/updates/migrate-v3/`);
				}
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

	/**
	 * Creates a wrapper function for executing a custom task
	 *
	 * The wrapper:
	 * 1. Validates cache and determines if task can be skipped
	 * 2. Prepares workspace and dependencies readers
	 * 3. Builds the parameter object for the custom task interface
	 * 4. Executes the custom task function
	 * 5. Records the task result in the build cache
	 *
	 * @param {object} parameters Parameters
	 * @param {@ui5/project/specifications/Project} parameters.project Project instance
	 * @param {@ui5/project/build/helpers/TaskUtil} parameters.taskUtil TaskUtil instance
	 * @param {Function} parameters.getDependenciesReaderCb
	 *   Callback to get dependencies reader on-demand
	 * @param {boolean} parameters.provideDependenciesReader
	 *   Whether to provide dependencies reader to the task
	 * @param {boolean} parameters.supportsDifferentialUpdates
	 *   Whether the task supports differential updates
	 * @param {@ui5/project/specifications/Extension} parameters.task Task extension instance
	 * @param {string} parameters.taskName Runtime name of the task (may include suffix)
	 * @param {object} [parameters.taskConfiguration] Task configuration from ui5.yaml
	 * @returns {Function} Async wrapper function for the custom task
	 */
	_createCustomTaskWrapper({
		project, taskUtil, getDependenciesReaderCb, provideDependenciesReader, supportsDifferentialUpdates,
		task, taskName, taskConfiguration
	}) {
		return async () => {
			const cacheInfo = await this._buildCache.prepareTaskExecutionAndValidateCache(taskName);
			if (cacheInfo === true) {
				this._log.skipTask(taskName);
				return;
			}
			const usingCache = !!(supportsDifferentialUpdates && cacheInfo);

			/* Custom Task Interface
				Parameters:
					{Object} parameters Parameters
					{@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
					{@ui5/fs/AbstractReader} parameters.dependencies
						Reader or Collection to read dependency files
					{@ui5/project/build/helpers/TaskUtil} parameters.taskUtil Specification Version-dependent
						interface of a [TaskUtil]{@link @ui5/project/build/helpers/TaskUtil} instance
					{@ui5/logger/Logger} [parameters.log] Logger instance to use by the custom task.
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
			const workspace = createMonitor(this._project.getWorkspace());
			const params = {
				workspace,
				options: {
					projectName: project.getName(),
					projectNamespace: project.getNamespace(),
					configuration: taskConfiguration,
				}
			};
			if (usingCache) {
				params.changedProjectResourcePaths = cacheInfo.changedProjectResourcePaths;
				if (provideDependenciesReader) {
					params.changedDependencyResourcePaths = cacheInfo.changedDependencyResourcePaths;
				}
			}
			const specVersion = task.getSpecVersion();
			const taskUtilInterface = taskUtil.getInterface(specVersion);
			// Interface is undefined if specVersion does not support taskUtil
			if (taskUtilInterface) {
				params.taskUtil = taskUtilInterface;
			}
			const taskFunction = await task.getTask();

			if (specVersion.gte("3.0")) {
				params.options.taskName = taskName;
				params.log = getLogger(`builder:custom-task:${taskName}`);
			}

			let dependencies;
			if (provideDependenciesReader) {
				dependencies = createMonitor(await getDependenciesReaderCb());
				params.dependencies = dependencies;
			}
			this._log.startTask(taskName, usingCache);
			await taskFunction(params);
			this._log.endTask(taskName);
			await this._buildCache.recordTaskResult(taskName,
				workspace.getResourceRequests(),
				dependencies?.getResourceRequests(),
				usingCache ? cacheInfo : undefined,
				supportsDifferentialUpdates);
		};
	}

	/**
	 * Executes a task function with performance tracking
	 *
	 * Wraps task execution with performance measurements and logging.
	 *
	 * @param {string} taskName Name of the task
	 * @param {Function} taskFunction Function which executes the task
	 * @param {object} taskParams Base parameters for all tasks
	 * @returns {Promise<void>} Resolves when task has finished
	 */
	async _executeTask(taskName, taskFunction, taskParams) {
		this._taskStart = performance.now();
		await taskFunction(taskParams, this._log);
		if (this._log.isLevelEnabled("perf")) {
			// FIXME: Standard tasks are currently additionally measured within taskFunction (See _addTask).
			// The measurement here includes the time for checking whether the task can be skipped via cache.
			this._log.perf(`Task ${taskName} finished in ${Math.round((performance.now() - this._taskStart))} ms`);
		}
	}

	/**
	 * Creates a reader collection for the specified project dependencies
	 *
	 * This method:
	 * 1. Returns a cached reader if all direct dependencies are requested and available
	 * 2. Resolves transitive dependencies for the requested dependency names
	 * 3. Creates a reader collection containing readers for all required dependencies
	 * 4. Caches the reader if it covers all direct dependencies
	 *
	 * @public
	 * @param {Set<string>} dependencyNames Set of dependency project names to include
	 * @param {boolean} [forceUpdate=false] Force creation of a new reader even if cached
	 * @returns {Promise<@ui5/fs/ReaderCollection>} Reader collection for the requested dependencies
	 */
	async getDependenciesReader(dependencyNames, forceUpdate = false) {
		if (!forceUpdate && dependencyNames.size === this._directDependencies.size && this._cachedDependenciesReader) {
			// Shortcut: If all direct dependencies are required, just return the already created reader
			return this._cachedDependenciesReader;
		}
		const rootProject = this._project;

		// Collect readers for all requested dependencies
		const readers = [];

		// Add transitive dependencies to set of required dependencies
		const requiredDependencies = new Set(dependencyNames);
		for (const projectName of dependencyNames) {
			this._graph.getTransitiveDependencies(projectName).forEach((depName) => {
				requiredDependencies.add(depName);
			});
		}

		// Collect readers for all (transitive) dependencies
		await this._graph.traverseBreadthFirst(rootProject.getName(), async ({project}) => {
			if (requiredDependencies.has(project.getName())) {
				readers.push(project.getReader());
			}
		});

		// Create a reader collection for that
		const reader = createReaderCollection({
			name: `Reduced dependency reader collection of project ${rootProject.getName()}`,
			readers
		});

		if (dependencyNames.size === this._directDependencies.size) {
			this._cachedDependenciesReader = reader;
		}
		return reader;
	}
}

export default TaskRunner;

import {getLogger} from "@ui5/logger";
import composeTaskList from "./helpers/composeTaskList.js";
import MonitoredTaskUtil from "./helpers/MonitoredTaskUtil.js";
import StepRunner, {validateSteps} from "./helpers/StepRunner.js";
import {getCustomTaskCacheExemption} from "./TaskDefinitions.js";
import {createReaderCollection, createMonitor} from "@ui5/fs/resourceFactory";

// Process-level guard for the single warning about custom tasks that are exempt from the build cache
// because they declare a Specification Version below 5.0. A long-running `ui5 serve` process rebuilds
// many times across many projects; the user needs to be told once, not on every rebuild.
let warnedAboutUncacheableCustomTasks = false;

const EMPTY_RESOURCE_REQUESTS = {paths: [], patterns: []};

/**
 * Concatenates two resource-request recordings into one.
 *
 * <code>base</code> is the recording from a reader the TaskRunner monitors directly (the workspace or
 * dependencies reader); <code>extra</code> is the corresponding bucket recorded by the
 * MonitoredTaskUtil for reads a task made through <code>getProject(name).getReader()</code>.
 *
 * When <code>base</code> is undefined (no reader was provided to the task) the result stays undefined
 * unless the task read resources through the taskUtil, preserving the "intentionally requested no
 * dependencies" signal that recordStageResult distinguishes from an empty request set.
 *
 * @param {{paths: string[], patterns: string[]}|undefined} base Requests from a monitored reader
 * @param {{paths: string[], patterns: string[]}} [extra] Requests recorded via the taskUtil
 * @returns {{paths: string[], patterns: string[]}|undefined} Merged requests, or undefined
 */
function mergeResourceRequests(base, extra = EMPTY_RESOURCE_REQUESTS) {
	if (!base) {
		if (!extra.paths.length && !extra.patterns.length) {
			return undefined;
		}
		return {paths: [...extra.paths], patterns: [...extra.patterns]};
	}
	return {
		paths: [...base.paths, ...extra.paths],
		patterns: [...base.patterns, ...extra.patterns],
	};
}

/**
 * Merges two recorded non-resource input sets, deduping by input type and name (the second argument's
 * entries win on overlap; equal inputs agree either way).
 *
 * @param {Array<{type: string, name: string, value: string|undefined}>} base First input recording
 * @param {Array<{type: string, name: string, value: string|undefined}>} extra Second input recording
 * @returns {Array<{type: string, name: string, value: string|undefined}>} Merged, deduped input recording
 */
function mergeInputRecordings(base, extra) {
	const merged = new Map();
	for (const entry of base) {
		merged.set(`${entry.type}\0${entry.name}`, entry);
	}
	for (const entry of extra) {
		merged.set(`${entry.type}\0${entry.name}`, entry);
	}
	return [...merged.values()];
}

/**
 * Folds a stage's per-key reads (the {@link StepRunner} fold) into the stage-level monitored requests,
 * deduping against what the base recording already requests.
 *
 * The recorder stores resolved paths and the glob patterns an invocation issued, and a path or pattern is commonly
 * read by more than one key (a shared marker probe, a dependency each key resolves, a shared glob) and also
 * recorded at the stage level, so a plain concatenation carried duplicates that only collapse later in the
 * request graph (which keys on a Set). Deduping here keeps the recording the request graph rebuilds minimal;
 * it does not move the stage signature, since the dropped entries are already present. The patterns matter: a
 * cached map-step key does not re-issue its globs, so its patterns reach the request set only through this
 * fold, which is how a newly matching file keeps moving the stage signature.
 *
 * @param {{paths: string[], patterns: string[]}|undefined} base Stage-level monitored requests
 * @param {{paths: string[], patterns: string[]}} fold The stage's folded per-key reads and patterns
 * @returns {{paths: string[], patterns: string[]}|undefined} The base requests with the not-yet-present
 *   fold paths and patterns added, or <code>undefined</code> when there was nothing to record (preserving the
 *   "requested nothing" signal {@link #recordStageResult} distinguishes from an empty request set)
 */
function foldReadsInto(base, fold) {
	const basePaths = base ? base.paths : [];
	const covered = new Set(basePaths);
	const newPaths = [];
	for (const path of fold.paths) {
		if (covered.has(path)) {
			continue; // already requested (by the stage monitor or an earlier fold entry)
		}
		covered.add(path);
		newPaths.push(path);
	}
	const basePatterns = base ? base.patterns : [];
	const coveredPatterns = new Set(basePatterns);
	const newPatterns = [];
	for (const pattern of fold.patterns) {
		if (coveredPatterns.has(pattern)) {
			continue;
		}
		coveredPatterns.add(pattern);
		newPatterns.push(pattern);
	}
	if (!base) {
		if (!newPaths.length && !newPatterns.length) {
			return undefined;
		}
		return {paths: newPaths, patterns: newPatterns};
	}
	return {paths: [...basePaths, ...newPaths], patterns: [...basePatterns, ...newPatterns]};
}

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
	 * @param {@ui5/project/build/TaskDefinitions} parameters.taskDefinitions
	 */
	constructor({graph, project, log, buildCache, taskUtil, taskRepository, buildConfig, taskDefinitions}) {
		if (!graph || !project || !log || !buildCache || !taskUtil || !taskRepository || !buildConfig ||
			!taskDefinitions) {
			throw new Error("TaskRunner: One or more mandatory parameters not provided");
		}
		this._project = project;
		this._graph = graph;
		this._taskUtil = taskUtil;
		this._taskRepository = taskRepository;
		this._buildConfig = buildConfig;
		this._log = log;
		this._buildCache = buildCache;
		this._taskDefinitions = taskDefinitions;

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

		const {standardTasks, customTasks} = await this._taskDefinitions.getTaskDefinitions();

		for (const [taskName, taskDef] of standardTasks) {
			await this._addTask(taskName, taskDef);
		}

		for (const [taskName, {taskDef, task}] of customTasks) {
			await this._addCustomTask(taskName, taskDef, task);
		}
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
		// Kept for the per-task step runner to check between steps.
		this._signal = signal;

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

		// Expand step-based tasks into their per-step stages: each step is its own stage, so the
		// stage list must enumerate a step-based task's step names in step order. The descriptor (and its
		// steps array) was resolved once by TaskDefinitions, shared with the build-signature phase, so read
		// it here rather than calling the factory again. Freeze the array so a custom task cannot mutate the
		// shared value; discovery re-derives it on the next build, so a surviving TaskRunner never serves a
		// stale array.
		const stageTasks = allTasks.map((taskName) => {
			const taskDef = this._tasks[taskName];
			const steps = taskDef.descriptor?.steps;
			const stageTask = {taskName};
			if (steps) {
				// Validate the whole step list before it creates any stage: setTasks below derives a stage id
				// per step name, so a duplicate name or a malformed declaration must be rejected here, not
				// later when the step runs (by then two steps sharing a name have already created two stages
				// with one id).
				validateSteps(steps, {taskName});
				taskDef.steps = Object.freeze(steps);
				stageTask.stepNames = steps.map((step) => step.name);
			}
			// Only flag an exempt task; absence means cacheable (setTasks defaults to true). This keeps the
			// payload minimal and reports the exemption to the user when such a task runs.
			if (taskDef.cacheable === false) {
				stageTask.cacheable = false;
				this.#reportCacheExemption(taskDef.cacheExemption);
			}
			return stageTask;
		});
		this._buildCache.setTasks(stageTasks);

		for (let i = 0; i < allTasks.length; i++) {
			signal?.throwIfAborted();
			const taskName = allTasks[i];
			const taskFunction = this._tasks[taskName].task;

			if (typeof taskFunction === "function") {
				await this._executeTask(taskName, taskFunction);
			}
		}
		signal?.throwIfAborted();
		return await this._buildCache.allTasksCompleted(signal);
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
	 * Tasks can be explicitly skipped by setting <code>skip</code> to true in the definition.
	 *
	 * The task's shape comes from the descriptor its factory (the task module's default export) returns:
	 * a <code>steps</code> array drives the step runner (one stage per step), a <code>task</code> body runs
	 * as a single legacy stage, and <code>requiresDependencies</code> decides whether a dependencies reader
	 * is provided. A definition may instead supply its own <code>taskFunction</code> override (for example the
	 * multi-bundle <code>generateBundle</code> wrapper that cannot live in @ui5/builder); it then runs as the
	 * single-stage body and the definition's own <code>requiresDependencies</code> flag applies.
	 *
	 * @param {string} taskName Name of the task to add
	 * @param {object} [taskDef] Task definition from the build definition
	 * @param {boolean} [taskDef.requiresDependencies=false]
	 *   Whether a <code>taskFunction</code>-overridden task requires access to project dependencies
	 * @param {object} [taskDef.options={}] Options to pass to the task factory
	 * @param {Function} [taskDef.taskFunction] Task body override; runs as the single legacy stage
	 * @param {boolean} [taskDef.skip] Whether the task is explicitly skipped
	 * @returns {Promise<void>}
	 */
	async _addTask(taskName, taskDef = {}) {
		const {options = {}, taskFunction, skip} = taskDef;
		if (this._tasks[taskName]) {
			throw new Error(`Failed to add duplicate task ${taskName} for project ${this._project.getName()}`);
		}
		if (this._taskExecutionOrder.includes(taskName)) {
			throw new Error(`Failed to add task ${taskName} for project ${this._project.getName()}. ` +
				`It has already been scheduled for execution`);
		}

		// projectName/projectNamespace were completed into the options by TaskDefinitions before the first
		// factory call, so the descriptor resolved there matches the options the task body sees here.
		options.projectName = this._project.getName();
		options.projectNamespace = this._project.getNamespace();

		// The descriptor is resolved and memoized by TaskDefinitions (shared with the build-signature phase).
		// A skipped or taskFunction-overridden task has no descriptor.
		const descriptor = await this._taskDefinitions.getStandardDescriptor(taskName, taskDef);
		const steps = descriptor?.steps;
		const stepBased = !!steps;
		// requiresDependencies comes from the descriptor for a normal task, or from the definition for a
		// taskFunction override.
		const requiresDependencies = descriptor ? !!descriptor.requiresDependencies : !!taskDef.requiresDependencies;
		// The single-stage body is the descriptor's task, or the definition's taskFunction override.
		const taskBody = descriptor ? descriptor.task : taskFunction;

		let task;
		if (skip) {
			this._log.verbose(`Task ${taskName} is set to be explicitly skipped in definitions.`);
			task = null;
		} else {
			task = async (log) => {
				if (stepBased) {
					// Step-based task: the descriptor carried a steps array. runTasks already froze it on the
					// task at discovery; reuse it here. Each step is its own pipeline stage; the step runner
					// drives one stage per step via the per-stage hooks below. Every input a step reads arrives
					// through its arguments, so no task body closes over the readers or taskUtil.
					const stepList = this._tasks[taskName].steps ?? steps;
					this._taskStart = performance.now();
					const taskReport = this.#createTaskExecutionReport(taskName);
					const stepDriver = new StepRunner({
						steps: stepList,
						taskName,
						options,
						...this.#createStepStageHooks(taskName, requiresDependencies),
						returnValueStore: this._buildCache.getStepReturnValueStore(),
						resolveInputValue: this._buildCache.getResolveInputValue(),
						applyTagOperations: (tagOperations) =>
							this._project.getProjectResources().replayTagOperations(tagOperations),
						notifyStepExecution: taskReport.started,
						signal: this._signal,
					});
					const {anyStepExecuted, writtenResourcePaths} = await stepDriver.runSteps();
					if (this._log.isLevelEnabled("perf")) {
						this._log.perf(
							`Task ${taskName} finished in ${Math.round((performance.now() - this._taskStart))} ms`);
					}
					// Report the task as skipped when every step was served from cache, else as finished,
					// preserving the task-level reporting contract now that caching is per step. The
					// matching task-start was emitted by the step runner's notification, before the work.
					if (anyStepExecuted) {
						taskReport.finished(writtenResourcePaths);
					} else {
						this._log.skipTask(taskName);
					}
					return;
				}

				// Legacy task: the descriptor's task body (or a definition taskFunction override). Single stage.
				const cacheInfo = await this._buildCache.prepareStageExecutionAndValidateCache(taskName);
				if (cacheInfo === true) {
					this._log.skipTask(taskName);
					return;
				}
				const workspace = createMonitor(this._project.getWorkspace());
				let dependencies;
				if (requiresDependencies) {
					dependencies = createMonitor(this._cachedDependenciesReader);
				}
				const monitoredTaskUtil = new MonitoredTaskUtil(this._taskUtil);

				const params = {
					workspace,
					taskUtil: monitoredTaskUtil,
					options,
				};
				if (dependencies) {
					params.dependencies = dependencies;
				}
				this._log.startTask(taskName, !!cacheInfo);
				this._taskStart = performance.now();
				await taskBody(params);
				if (this._log.isLevelEnabled("perf")) {
					this._log.perf(
						`Task ${taskName} finished in ${Math.round((performance.now() - this._taskStart))} ms`);
				}
				const taskUtilRequests = monitoredTaskUtil.getResourceRequests();
				const projectRequests =
					mergeResourceRequests(workspace.getResourceRequests(), taskUtilRequests.project);
				const dependencyRequests =
					mergeResourceRequests(dependencies?.getResourceRequests(), taskUtilRequests.dependencies);
				const inputRecording = monitoredTaskUtil.getInputRecording();

				const writtenResourcePaths = await this._buildCache.recordStageResult({
					taskName,
					projectResourceRequests: projectRequests,
					dependencyResourceRequests: dependencyRequests,
					inputRecording,
					rootResourceRequests: taskUtilRequests.root,
				});
				this._log.endTask(taskName, !!cacheInfo, writtenResourcePaths);
			};
		}
		this._tasks[taskName] = {
			task,
			stepBased,
			descriptor,
			options,
			// Standard tasks are cacheable. A descriptor may still opt out via cache:false (none of the
			// built-ins do), honored uniformly with custom tasks.
			cacheable: descriptor ? descriptor.cache !== false : true,
			requiredDependencies: requiresDependencies ? this._directDependencies : new Set()
		};
		this._taskExecutionOrder.push(taskName);
	}

	/**
	 * Adds a single custom task to the task execution order
	 *
	 * This method:
	 * 1. Determines required dependencies via callback if provided
	 * 2. Creates a wrapper function for the custom task
	 * 3. Inserts the task at the correct position based on beforeTask/afterTask configuration
	 *
	 * Validation and de-duplication of the task name (incl. resolving the task extension from
	 * the project graph) is handled upstream by
	 * [TaskDefinitions#_addCustomTask]{@link @ui5/project/build/TaskDefinitions#_addCustomTask}.
	 *
	 * @param {string} taskName Unique task name
	 * @param {object} taskDef Custom task definition from project configuration
	 * @param {string} taskDef.name Name of the custom task
	 * @param {string} [taskDef.beforeTask] Name of task to insert before
	 * @param {string} [taskDef.afterTask] Name of task to insert after
	 * @param {object} [taskDef.configuration] Custom task configuration
	 * @param {object} task Task extension instance resolved by TaskDefinitions
	 * @returns {Promise<void>}
	 */
	async _addCustomTask(taskName, taskDef, task) {
		const project = this._project;
		const taskUtil = this._taskUtil;

		const specVersion = task.getSpecVersion();
		// From Specification Version 5.0 the default export is a factory returning a descriptor. Below 5.0 it
		// is the legacy task body invoked directly (any value it returns is ignored), so there is no descriptor.
		// The factory options match those used for the build signature in TaskDefinitions, so Task#getDescriptor
		// memoizes one descriptor shared by both phases.
		const isV5 = specVersion.gte("5.0");
		const descriptorOptions = {
			projectName: project.getName(),
			projectNamespace: project.getNamespace(),
			configuration: taskDef.configuration,
			taskName
		};
		const descriptor = isV5 ? await task.getDescriptor(taskName, descriptorOptions) : undefined;

		// Tasks can provide an optional callback to tell build process which dependencies they require
		const requiredDependenciesCallback =
			await task.getRequiredDependenciesCallback(taskName, descriptorOptions);
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
				taskName
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
		// A custom task is step-based when its descriptor carries a steps array (Specification Version 5.0
		// and later). Below 5.0 there is no descriptor and the task runs as a legacy body.
		const stepBased = !!descriptor?.steps;
		// Decide cache exemption from the same rule the ProjectBuildContext used to disable the result
		// cache, over the same (memoized) descriptor and the isV5 flag already computed above (so no extra
		// Specification Version comparison). An exempt task's stages are always executed and never stored
		// (see ProjectBuildCache); runTasks reports the exemption to the user.
		const cacheExemption = getCustomTaskCacheExemption(isV5, descriptor);
		this._tasks[taskName] = {
			task: this._createCustomTaskWrapper({
				task,
				project,
				taskUtil,
				taskName,
				taskConfiguration: taskDef.configuration,
				provideDependenciesReader,
				descriptor,
				stepBased,
				getDependenciesReaderCb: () => {
					// Create the dependencies reader on-demand
					return this.getDependenciesReader(requiredDependencies);
				},
			}),
			stepBased,
			descriptor,
			options: descriptorOptions,
			cacheable: !cacheExemption,
			cacheExemption: cacheExemption ? {
				reason: cacheExemption.reason,
				extensionName: task.getName(),
				specVersion: specVersion.toString()
			} : undefined,
			requiredDependencies
		};

		if (this._taskExecutionOrder.length) {
			// There is at least one task configured. Use before- and afterTask to add the custom task
			const refTaskName = taskDef.beforeTask || taskDef.afterTask;
			let refTaskIdx = this._taskExecutionOrder.indexOf(refTaskName);
			if (refTaskIdx === -1) {
				if (this._taskRepository.getRemovedTaskNames().includes(refTaskName)) {
					throw new Error(
						`Standard task ${refTaskName}, referenced by custom task ${taskName} ` +
						`in project ${project.getName()}, ` +
						`has been removed in this version of UI5 CLI and can't be referenced anymore. ` +
						`Please see the migration guide at https://ui5.github.io/cli/updates/migrate-v3/`);
				}
				throw new Error(`Could not find task ${refTaskName}, referenced by custom task ${taskName}, ` +
					`to be scheduled for project ${project.getName()}`);
			}
			if (taskDef.afterTask) {
				// Insert after index of referenced task
				refTaskIdx++;
			}
			this._taskExecutionOrder.splice(refTaskIdx, 0, taskName);
		} else {
			// There is no task configured so far. Just add the custom task
			this._taskExecutionOrder.push(taskName);
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
	 * @param {object} [parameters.descriptor]
	 *   The task's resolved descriptor (Specification Version 5.0 and later). Absent below 5.0, where the
	 *   default export is the legacy task body
	 * @param {boolean} parameters.stepBased
	 *   Whether the descriptor carries a steps array (Specification Version 5.0 and later)
	 * @param {@ui5/project/specifications/Extension} parameters.task Task extension instance
	 * @param {string} parameters.taskName Runtime name of the task (may include suffix)
	 * @param {object} [parameters.taskConfiguration] Task configuration from ui5.yaml
	 * @returns {Function} Async wrapper function for the custom task
	 */
	_createCustomTaskWrapper({
		project, taskUtil, getDependenciesReaderCb, provideDependenciesReader, descriptor, stepBased,
		task, taskName, taskConfiguration
	}) {
		return async () => {
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
			const specVersion = task.getSpecVersion();
			const taskUtilInterface = taskUtil.getInterface(specVersion);
			const isSpec3 = specVersion.gte("3.0");

			const options = {
				projectName: project.getName(),
				projectNamespace: project.getNamespace(),
				configuration: taskConfiguration,
			};
			if (isSpec3) {
				options.taskName = taskName;
			}

			if (stepBased) {
				// Step-based custom task (Specification Version 5.0 and later): the descriptor carried a steps
				// array. Each step is its own pipeline stage, driven by the step runner via per-stage hooks.
				// runTasks already froze the step array on the task at discovery; reuse it, falling back to the
				// descriptor's own array for a task invoked outside runTasks.
				const steps = this._tasks[taskName].steps ?? descriptor.steps;
				const taskReport = this.#createTaskExecutionReport(taskName);
				const stepDriver = new StepRunner({
					steps,
					taskName,
					options,
					...this.#createStepStageHooks(taskName, provideDependenciesReader, taskUtilInterface),
					returnValueStore: this._buildCache.getStepReturnValueStore(),
					resolveInputValue: this._buildCache.getResolveInputValue(),
					applyTagOperations: (tagOperations) =>
						this._project.getProjectResources().replayTagOperations(tagOperations),
					notifyStepExecution: taskReport.started,
					signal: this._signal,
				});
				const {anyStepExecuted, writtenResourcePaths} = await stepDriver.runSteps();
				// Report the task as skipped when every step was served from cache, else as finished. The
				// matching task-start was emitted by the step runner's notification, before the work.
				if (anyStepExecuted) {
					taskReport.finished(writtenResourcePaths);
				} else {
					this._log.skipTask(taskName);
				}
				return;
			}

			// Legacy custom task: a single-stage body. From Specification Version 5.0 the body is the
			// descriptor's task; below 5.0 the default export is the body itself (invoked directly), so any
			// value it returns is ignored.
			const taskFunction = descriptor ? descriptor.task : await task.getTask();
			const cacheInfo = await this._buildCache.prepareStageExecutionAndValidateCache(taskName);
			if (cacheInfo === true) {
				this._log.skipTask(taskName);
				return;
			}

			const workspace = createMonitor(this._project.getWorkspace());
			const params = {workspace, options};

			let dependencies;
			if (provideDependenciesReader) {
				dependencies = createMonitor(await getDependenciesReaderCb());
				params.dependencies = dependencies;
			}

			// The interface is undefined for a task that does not support taskUtil (spec version <= 2.1).
			let monitoredTaskUtil;
			if (taskUtilInterface) {
				monitoredTaskUtil = new MonitoredTaskUtil(taskUtilInterface);
				params.taskUtil = monitoredTaskUtil;
			}
			if (isSpec3) {
				params.log = getLogger(`builder:custom-task:${taskName}`);
			}

			this._log.startTask(taskName, !!cacheInfo);
			await taskFunction(params);

			const taskUtilRequests = monitoredTaskUtil?.getResourceRequests();
			const projectRequests = mergeResourceRequests(workspace.getResourceRequests(), taskUtilRequests?.project);
			const dependencyRequests =
				mergeResourceRequests(dependencies?.getResourceRequests(), taskUtilRequests?.dependencies);
			const inputRecording = monitoredTaskUtil ? monitoredTaskUtil.getInputRecording() : [];

			const writtenResourcePaths = await this._buildCache.recordStageResult({
				taskName,
				projectResourceRequests: projectRequests,
				dependencyResourceRequests: dependencyRequests,
				inputRecording,
				rootResourceRequests: taskUtilRequests?.root,
			});
			this._log.endTask(taskName, !!cacheInfo, writtenResourcePaths);
		};
	}

	/**
	 * Reports that a custom task is exempt from the build cache, so the user understands why that task runs
	 * on every build.
	 *
	 * A task below Specification Version 5.0 is exempt implicitly (reason <code>"specVersion"</code>): its
	 * legacy body may perform file I/O outside the resource model that the cache cannot track. This is
	 * warned once per process (a long-running <code>ui5 serve</code> rebuilds repeatedly, and the user needs
	 * telling once, not per rebuild). A Specification Version 5.0 task that set <code>cache: false</code>
	 * (reason <code>"optOut"</code>) made a deliberate choice, so it is only logged at verbose level.
	 *
	 * @param {{reason: string, extensionName: string, specVersion: string}} [exemption] The task's exemption,
	 *   or <code>undefined</code> for a cacheable task
	 */
	#reportCacheExemption(exemption) {
		if (!exemption) {
			return;
		}
		const projectName = this._project.getName();
		if (exemption.reason === "specVersion") {
			if (warnedAboutUncacheableCustomTasks) {
				return;
			}
			warnedAboutUncacheableCustomTasks = true;
			this._log.warn(
				`Custom task ${exemption.extensionName} of project ${projectName} defines Specification ` +
				`Version ${exemption.specVersion} and is therefore not cached. Tasks below Specification ` +
				`Version 5.0 may read or write files outside the build's resource model, which the build ` +
				`cache cannot track, so their results are never cached and such tasks run on every build. ` +
				`This can slow down (incremental) builds. Update affected tasks to Specification Version 5.0 ` +
				`to make them cacheable.`);
		} else {
			this._log.verbose(
				`Custom task ${exemption.extensionName} of project ${projectName} opted out of the build ` +
				`cache (cache: false in its task descriptor); it runs on every build.`);
		}
	}

	/**
	 * Builds the start/end reporting pair for one execution of a step-based task.
	 *
	 * A step-based task's skip verdict is only known once every stage has been driven, so the task cannot
	 * be announced up front like a legacy task. The [StepRunner]{@link StepRunner} instead calls
	 * <code>started</code> from the first stage that stops being a pure cache hit, before that stage runs
	 * anything, so <code>task-start</code> ("Running task ...") precedes the work it announces and a
	 * <code>project-build-status</code> consumer sees the task as running while it runs. A task whose
	 * every stage was served from cache never calls it and is reported skipped instead.
	 *
	 * <code>isDifferentialBuild</code> is taken from the first executing stage's cache verdict, matching
	 * the legacy path's <code>!!cacheInfo</code>, and is latched for the <code>endTask</code> report so
	 * both ends of one execution agree.
	 *
	 * @param {string} taskName Task name
	 * @returns {{started: function(boolean): void, finished: function(string[]): void}} Reporting pair
	 */
	#createTaskExecutionReport(taskName) {
		let hasStarted = false;
		let isDifferentialBuild = false;
		const started = (differential) => {
			if (hasStarted) {
				return;
			}
			hasStarted = true;
			isDifferentialBuild = !!differential;
			this._log.startTask(taskName, isDifferentialBuild);
		};
		return {
			started,
			finished: (writtenResourcePaths) => {
				// A task reported as executed always announced itself first; the guard keeps the logger's
				// start/end pairing intact even if a future caller reports a finish without a start.
				started(isDifferentialBuild);
				this._log.endTask(taskName, isDifferentialBuild, writtenResourcePaths);
			},
		};
	}

	/**
	 * Builds the per-stage hooks the {@link StepRunner} uses to drive one pipeline stage per step of a
	 * step-based task. Shared by the standard-task and custom-task paths.
	 *
	 * <ul>
	 *   <li><code>prepareStage(stepName)</code> switches the project to the step's own stage and returns
	 *     its cache verdict (true = fully cached, an object = map-step internal key-delta, false = run).</li>
	 *   <li><code>getPreviousInvocationData(stepName)</code> returns that stage's previous per-key data.</li>
	 *   <li><code>createStageContext()</code> builds fresh monitored workspace/dependencies readers and a
	 *     MonitoredTaskUtil bound to the stage <code>prepareStage</code> just switched to.</li>
	 *   <li><code>recordStage(stepName, outcome)</code> records the step's stage from its own monitored
	 *     requests, inputs and stale outputs — no cross-step fold.</li>
	 * </ul>
	 *
	 * @param {string} taskName Task name
	 * @param {boolean} requiresDependencies Whether the task's steps read dependencies
	 * @param {object} [taskUtilInterface] TaskUtil interface for a custom task; defaults to the standard
	 *   task util
	 * @returns {object} The step-stage hooks
	 */
	#createStepStageHooks(taskName, requiresDependencies, taskUtilInterface = this._taskUtil) {
		return {
			prepareStage: async (stepName) => {
				const cacheInfo = await this._buildCache.prepareStageExecutionAndValidateCache(taskName, stepName);
				if (cacheInfo === true) {
					this._log.verbose(`Step ${taskName}/${stepName} served from cache`);
				}
				return cacheInfo;
			},
			getPreviousInvocationData: (stepName) =>
				this._buildCache.getStepInvocationData(this._buildCache.getStageId(taskName, stepName)),
			reopenStage: async (stepName) => {
				// A full stage-cache hit whose consumed needs return changed must re-run. Reopen the stage
				// with a fresh live writer (the full hit had installed the cached read-only stage) and run
				// it as a full execution, so its output reflects the changed producer return.
				this._buildCache.reopenStageForRerun(taskName, stepName);
				return false;
			},
			createStageContext: () => {
				// Built after prepareStage switched the stage, so the monitored readers reflect the
				// cumulative output of all earlier stages (the reader stack) with this stage's writer on top.
				const workspace = createMonitor(this._project.getWorkspace());
				const dependencies = requiresDependencies ?
					createMonitor(this._cachedDependenciesReader) : undefined;
				const monitoredTaskUtil = new MonitoredTaskUtil(taskUtilInterface);
				return {workspace, dependencies, taskUtil: monitoredTaskUtil, monitoredTaskUtil};
			},
			recordStage: async (stepName, outcome) => {
				const {ctx, cacheInfo, invocationData, staleOutputs, foldedReads, foldedInputs} = outcome;
				const {workspace, dependencies, monitoredTaskUtil} = ctx;
				const taskUtilRequests = monitoredTaskUtil.getResourceRequests();
				let projectRequests =
					mergeResourceRequests(workspace.getResourceRequests(), taskUtilRequests.project);
				let dependencyRequests =
					mergeResourceRequests(dependencies?.getResourceRequests(), taskUtilRequests.dependencies);
				let inputRecording = monitoredTaskUtil.getInputRecording();

				// Fold the stage's complete per-key reads and inputs (from its invocation data) into the
				// stage-level monitored requests. This covers keys served from cache on a delta build, whose
				// reads and inputs the stage-level monitor never observed, so the stage re-keys on its full
				// input set. On a full build the monitor already saw every path (through the enumerator's own
				// glob or the keys' individual reads), so the fold adds nothing new: foldReadsInto dedups the
				// fold against the monitored paths rather than concatenating duplicates that only collapse
				// later in the request graph.
				if (foldedReads) {
					projectRequests = foldReadsInto(projectRequests, foldedReads.project);
					dependencyRequests = dependencies ?
						foldReadsInto(dependencyRequests, foldedReads.dependencies) : dependencyRequests;
				}
				if (foldedInputs) {
					inputRecording = mergeInputRecordings(inputRecording, foldedInputs);
				}

				this._buildCache.setStepInvocationData(
					this._buildCache.getStageId(taskName, stepName), invocationData);

				// A map step's stage served a partial (key-delta) run: pass its stale outputs alongside the
				// delta's changed paths so recordStageResult drops the outputs its not-re-run keys no longer
				// produce from the carried-forward stage. The verdict object is left unmutated here: the
				// StepRunner still holds it and #selectStepsToRun already read its changed paths before this
				// point, so the extended list is handed over as an explicit field instead.
				const changedProjectResourcePaths = cacheInfo ?
					[...(cacheInfo.changedProjectResourcePaths ?? []), ...staleOutputs] : undefined;

				return this._buildCache.recordStageResult({
					taskName,
					projectResourceRequests: projectRequests,
					dependencyResourceRequests: dependencyRequests,
					cacheInfo: cacheInfo || undefined,
					inputRecording,
					rootResourceRequests: taskUtilRequests.root,
					stepBased: true,
					stepName,
					changedProjectResourcePaths,
				});
			},
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

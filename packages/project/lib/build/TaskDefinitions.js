import crypto from "node:crypto";
import {getLogger} from "@ui5/logger";

export default class TaskDefinitions {
	#graph;
	#project;
	#taskUtil;
	#taskRepository;
	#standardTasks;
	#customTasks;
	#initializingTasks;

	constructor(graph, project, taskUtil, taskRepository) {
		this.#graph = graph;
		this.#project = project;
		this.#taskUtil = taskUtil;
		this.#taskRepository = taskRepository;
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
		if (this.#initializingTasks) {
			return this.#initializingTasks;
		}
		this.#initializingTasks = this._doInitTasks();
		return this.#initializingTasks;
	}

	async _doInitTasks() {
		let buildDefinition;

		switch (this.#project.getType()) {
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
			throw new Error(`Unknown project type ${this.#project.getType()}`);
		}

		const {default: getStandardTasks} = await import(buildDefinition);

		this.#standardTasks = getStandardTasks({
			project: this.#project,
			taskUtil: this.#taskUtil,
			getTask: this.#taskRepository.getTask
		});

		this.#customTasks = await this._getCustomTasks(this.#project, this.#taskUtil);
	}

	async _getCustomTasks() {
		const projectCustomTasks = this.#project.getCustomTasks();
		if (!projectCustomTasks || projectCustomTasks.length === 0) {
			return new Map(); // No custom tasks defined
		}
		const tasks = new Map();
		for (let i = 0; i < projectCustomTasks.length; i++) {
			// Add tasks one-by-one to keep order as defined in project configuration
			await this._addCustomTask(projectCustomTasks[i], tasks);
		}
		return tasks;
	}

	_addCustomTask(taskDef, tasks) {
		const project = this.#project;
		const graph = this.#graph;

		if (!taskDef.name) {
			throw new Error(`Missing name for custom task in configuration of project ${project.getName()}`);
		}
		if (taskDef.beforeTask && taskDef.afterTask) {
			throw new Error(`Custom task definition ${taskDef.name} of project ${project.getName()} ` +
				`defines both "beforeTask" and "afterTask" parameters. Only one must be defined.`);
		}
		if ((this.#standardTasks.size || tasks.size) && !taskDef.beforeTask && !taskDef.afterTask) {
			// Iff there are tasks configured, beforeTask or afterTask must be given
			throw new Error(`Custom task definition ${taskDef.name} of project ${project.getName()} ` +
				`defines neither a "beforeTask" nor an "afterTask" parameter. One must be defined.`);
		}
		const standardTaskNames = this.#taskRepository.getAllTaskNames();
		if (standardTaskNames.includes(taskDef.name)) {
			throw new Error(
				`Custom task configuration of project ${project.getName()} ` +
				`references standard task ${taskDef.name}. Only custom tasks must be provided here.`);
		}

		let newTaskName = taskDef.name;
		if (this.#standardTasks.has(newTaskName) || tasks.has(newTaskName)) {
			// Task is already known
			// => add a suffix to allow for multiple configurations of the same task
			let suffixCounter = 1;
			while (this.#standardTasks.has(newTaskName) || tasks.has(newTaskName)) {
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

		tasks.set(newTaskName, {taskDef, task});
	}

	async getBuildSignatures() {
		await this._initTasks();

		const sigKeys = [];
		for (const taskDef of this.#standardTasks.values()) {
			if (taskDef.determineBuildSignature) {
				const sig = await taskDef.determineBuildSignature();
				if (sig) {
					sigKeys.push(sig);
				}
			} else {
				// Fallback to task options
				sigKeys.push(JSON.stringify(taskDef.options));
			}
		}

		const projectName = this.#project.getName();
		const projectNamespace = this.#project.getNamespace();
		for (const [taskName, {taskDef, task}] of this.#customTasks) {
			const specVersion = task.getSpecVersion();
			const determineBuildSignatureCallback = await task.getDetermineBuildSignatureCallback();
			if (determineBuildSignatureCallback) {
				if (specVersion.lt("5.0")) {
					throw new Error(
						`Custom task ${taskDef.name} of project ${projectName} uses a ` +
						`determineBuildSignature callback, which is not supported for tasks with specVersion < 5.0. ` +
						`Please update the task's specVersion to at least 5.0.`
					);
				}
				const taskUtil = this.#taskUtil.getReadOnlyInterface(specVersion);
				const log = getLogger(`TaskDefinitions:custom-task:${taskName}`);
				const sig = await determineBuildSignatureCallback({
					log,
					options: {
						projectName,
						projectNamespace,
						configuration: taskDef.configuration,
						taskName
					},
					taskUtil
				});
				if (sig) {
					sigKeys.push(sig);
				}
			} else {
				// Fallback to task configuration
				sigKeys.push(JSON.stringify(taskDef.configuration));
			}
		}
		const key = sigKeys.join("|");
		const hash = crypto.createHash("sha256").update(key).digest("hex");
		return hash;
	}

	async getTaskDefinitions() {
		await this._initTasks();
		return {
			standardTasks: this.#standardTasks,
			customTasks: this.#customTasks
		};
	}
}

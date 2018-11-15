/**
 * Base class for the builder implementation of a project type
 *
 * @abstract
 */
class AbstractBuilder {
	/**
	 * Constructor
	 *
	 * @param {object} project Project configuration
	 * @param {GroupLogger} parentLogger Logger to use
	 */
	constructor({project, parentLogger}) {
		this.tasks = {};
		this.log = parentLogger.createSubLogger(project.type + " " + project.metadata.name, 0.2);
		this.taskLog = this.log.createTaskLogger("🔨");
		this.availableTasks = [];
	}

	/**
	 * Adds a executable task to the builder
	 *
	 * This does not ensure the correct build order. The order is maintained through the property
	 * [availableTasks]{@link AbstractBuilder#availableTasks}
	 *
	 * @param {string} taskName Name of the task which should be in the list availableTasks.
	 * @param {function} taskFunction
	 */
	addTask(taskName, taskFunction) {
		if (this.availableTasks.indexOf(taskName) === -1) {
			throw new Error(`Task "${taskName}" does not exist.`);
		}
		this.tasks[taskName] = taskFunction;
	}

	/**
	 * Takes a list of tasks which should be executed from the available task list of the current builder
	 *
	 * @param {array} tasksToRun List of tasks which should be executed
	 * @returns {Promise} Returns promise chain with tasks
	 */
	build(tasksToRun) {
		const allTasksCount = tasksToRun.filter((value) => this.availableTasks.includes(value)).length;
		this.taskLog.addWork(allTasksCount);

		let taskChain = Promise.resolve();
		for (let i = 0; i < this.availableTasks.length; i++) {
			const taskName = this.availableTasks[i];

			if (!tasksToRun.includes(taskName)) {
				continue;
			}

			const taskFunction = this.tasks[taskName];

			if (typeof taskFunction === "function") {
				taskChain = taskChain.then(this.wrapTask(taskName, taskFunction));
			}
		}
		return taskChain;
	}

	/**
	 * Adds progress related functionality to task function.
	 *
	 * @private
	 * @param {string} taskName Name of the task
	 * @param {function} taskFunction Function which executed the task
	 * @returns {function} Wrapped task function
	 */
	wrapTask(taskName, taskFunction) {
		return () => {
			this.taskLog.startWork(`Running task ${taskName}...`);
			return taskFunction().then(() => this.taskLog.completeWork(1));
		};
	}
}

module.exports = AbstractBuilder;

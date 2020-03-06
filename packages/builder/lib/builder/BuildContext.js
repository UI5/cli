/**
 * Context of a build process
 *
 * @private
 * @memberof module:@ui5/builder.builder
 */
class BuildContext {
	constructor({rootProject}) {
		this.projectBuildContexts = [];
		this.rootProject = rootProject;
	}

	getRootProject() {
		return this.rootProject;
	}

	createProjectContext({project, resources}) {
		const projectBuildContext = new ProjectBuildContext({
			buildContext: this,
			project,
			resources
		});
		this.projectBuildContexts.push(projectBuildContext);
		return projectBuildContext;
	}

	async executeCleanupTasks() {
		await Promise.all(this.projectBuildContexts.map((ctx) => {
			return ctx.executeCleanupTasks();
		}));
	}
}


/**
 * Build context of a single project. Always part of an overall
 * [Build Context]{@link module:@ui5/builder.builder.BuildContext}
 *
 * @private
 * @memberof module:@ui5/builder.builder
 */
class ProjectBuildContext {
	constructor({buildContext, project, resources}) {
		this._buildContext = buildContext;
		this._project = project;
		// this.resources = resources;
		this.queues = {
			cleanup: []
		};
	}

	isRootProject() {
		return this._project === this._buildContext.getRootProject();
	}

	registerCleanupTask(callback) {
		this.queues.cleanup.push(callback);
	}

	async executeCleanupTasks() {
		await Promise.all(this.queues.cleanup.map((callback) => {
			return callback();
		}));
	}
}

module.exports = BuildContext;

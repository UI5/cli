const ProjectBuildContext = require("./ProjectBuildContext");

/**
 * Context of a build process
 *
 * @private
 * @memberof module:@ui5/builder.builder
 */
class BuildContext {
	constructor({rootProject}) {
		if (!rootProject) {
			throw new Error(`Missing parameter 'rootProject'`);
		}
		this.rootProject = rootProject;
		this.projectBuildContexts = [];
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

module.exports = BuildContext;

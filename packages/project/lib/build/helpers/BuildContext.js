const ProjectBuildContext = require("./ProjectBuildContext");

/**
 * Context of a build process
 *
 * @private
 * @memberof module:@ui5/builder.builder
 */
class BuildContext {
	constructor({graph, options = {}}) {
		if (!graph) {
			throw new Error(`Missing parameter 'graph'`);
		}
		this._graph = graph;
		this._projectBuildContexts = [];
		this._options = options;
	}

	getRootProject() {
		return this._graph.getRoot();
	}

	getOption(key) {
		return this._options[key];
	}

	createProjectContext({project, log}) {
		const projectBuildContext = new ProjectBuildContext({
			buildContext: this,
			project,
			log
		});
		this._projectBuildContexts.push(projectBuildContext);
		return projectBuildContext;
	}

	async executeCleanupTasks() {
		await Promise.all(this._projectBuildContexts.map((ctx) => {
			return ctx.executeCleanupTasks();
		}));
	}

	/**
	 * Retrieve a single project from the dependency graph
	 *
	 * @param {string} projectName Name of the project to retrieve
	 * @returns {module:@ui5/project.specifications.Project|undefined}
	 *					project instance or undefined if the project is unknown to the graph
	 */
	getProject(projectName) {
		return this._graph.getProject(projectName);
	}
}

module.exports = BuildContext;

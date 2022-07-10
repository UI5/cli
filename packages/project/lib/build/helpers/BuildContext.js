const ProjectBuildContext = require("./ProjectBuildContext");

/**
 * Context of a build process
 *
 * @private
 * @memberof module:@ui5/project.build.helpers
 */
class BuildContext {
	constructor(graph, {
		selfContained = false,
		cssVariables = false,
		jsdoc = false,
		createBuildManifest = false,
		includedTasks = [], excludedTasks = [],
	} = {}) {
		if (!graph) {
			throw new Error(`Missing parameter 'graph'`);
		}

		if (createBuildManifest && !["library", "theme-library"].includes(graph.getRoot().getType())) {
			throw new Error(
				`Build manifest creation is currently not supported for projects of type ` +
				graph.getRoot().getType());
		}

		this._graph = graph;
		this._buildConfig = {
			selfContained,
			cssVariables,
			jsdoc,
			createBuildManifest,
			includedTasks,
			excludedTasks,
		};

		this._options = {
			cssVariables: cssVariables
		};
		this._projectBuildContexts = [];
	}

	getRootProject() {
		return this._graph.getRoot();
	}

	getOption(key) {
		return this._options[key];
	}

	getBuildConfig() {
		return this._buildConfig;
	}

	getGraph() {
		return this._graph;
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
}

module.exports = BuildContext;

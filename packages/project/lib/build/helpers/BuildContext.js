import ProjectBuildContext from "./ProjectBuildContext.js";
import TaskRunner from "../TaskRunner.js";

/**
 * Context of a build process
 *
 * @private
 * @memberof @ui5/project/build/helpers
 */
class BuildContext {
	constructor(graph, taskRepository, { // buildConfig
		selfContained = false,
		cssVariables = false,
		jsdoc = false,
		createBuildManifest = false,
		includedTasks = [], excludedTasks = [],
	} = {}) {
		if (!graph) {
			throw new Error(`Missing parameter 'graph'`);
		}
		if (!taskRepository) {
			throw new Error(`Missing parameter 'taskRepository'`);
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

		this._taskRepository = taskRepository;

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

	getTaskRepository() {
		return this._taskRepository;
	}

	getGraph() {
		return this._graph;
	}

	async createProjectContext({project, log}) {
		const projectBuildContext = new ProjectBuildContext({
			buildContext: this,
			project,
			log
		});
		const taskRunner = await TaskRunner.create({
			graph: this.getGraph(),
			project,
			taskUtil: projectBuildContext.getTaskUtil(),
			taskRepository: this.getTaskRepository(),
			parentLogger: log,
			buildConfig: this.getBuildConfig()
		});
		projectBuildContext.setTaskRunner(taskRunner);
		this._projectBuildContexts.push(projectBuildContext);
		return projectBuildContext;
	}

	async executeCleanupTasks() {
		await Promise.all(this._projectBuildContexts.map((ctx) => {
			return ctx.executeCleanupTasks();
		}));
	}
}

export default BuildContext;

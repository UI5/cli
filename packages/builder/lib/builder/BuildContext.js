const ResourceTagCollection = require("@ui5/fs").ResourceTagCollection;
const ProjectBuildContext = require("./ProjectBuildContext");

// Note: When adding standard tags, always update the public documentation in TaskUtil
// (Type "module:@ui5/builder.tasks.TaskUtil~StandardBuildTags")
const GLOBAL_TAGS = Object.freeze({
	IsDebugVariant: "ui5:IsDebugVariant",
	HasDebugVariant: "ui5:HasDebugVariant",
});

/**
 * Context of a build process
 *
 * @private
 * @memberof module:@ui5/builder.builder
 */
class BuildContext {
	constructor({rootProject, options = {}}) {
		if (!rootProject) {
			throw new Error(`Missing parameter 'rootProject'`);
		}
		this.rootProject = rootProject;
		this.projectBuildContexts = [];
		this._resourceTagCollection = new ResourceTagCollection({
			allowedTags: Object.values(GLOBAL_TAGS)
		});
		this.options = options;
	}

	getRootProject() {
		return this.rootProject;
	}

	getOption(key) {
		return this.options[key];
	}

	createProjectContext({project, resources}) {
		const projectBuildContext = new ProjectBuildContext({
			buildContext: this,
			globalTags: GLOBAL_TAGS,
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

	getResourceTagCollection() {
		return this._resourceTagCollection;
	}
}

module.exports = BuildContext;

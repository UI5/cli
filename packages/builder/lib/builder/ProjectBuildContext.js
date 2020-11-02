const ResourceTagCollection = require("@ui5/fs").ResourceTagCollection;

const STANDARD_TAGS = Object.freeze({
	OmitFromBuildResult: "ui5:OmitFromBuildResult",
	IsBundle: "ui5:IsBundle"
});

/**
 * Build context of a single project. Always part of an overall
 * [Build Context]{@link module:@ui5/builder.builder.BuildContext}
 *
 * @private
 * @memberof module:@ui5/builder.builder
 */
class ProjectBuildContext {
	constructor({buildContext, project, resources}) {
		if (!buildContext || !project || !resources) {
			throw new Error(`One or more mandatory parameters are missing`);
		}
		this._buildContext = buildContext;
		this._project = project;
		// this.resources = resources;
		this.queues = {
			cleanup: []
		};

		this.STANDARD_TAGS = STANDARD_TAGS;

		this._resourceTagCollection = new ResourceTagCollection({
			allowedTags: Object.values(this.STANDARD_TAGS)
		});
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

	getResourceTagCollection() {
		return this._resourceTagCollection;
	}
}

module.exports = ProjectBuildContext;

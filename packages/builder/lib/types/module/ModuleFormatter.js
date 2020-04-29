const log = require("@ui5/logger").getLogger("types:module:ModuleFormatter");
const path = require("path");
const AbstractFormatter = require("../AbstractFormatter");

class ModuleFormatter extends AbstractFormatter {
	format() {
		return this.validate().then(() => {
			const project = this._project;
			log.verbose("Formatting project %s...", project.metadata.name);
			project.resources.pathMappings = project.resources.configuration.paths;
		});
	}

	validate() {
		const project = this._project;
		return Promise.resolve().then(() => {
			if (!project) {
				throw new Error("Project is undefined");
			} else if (!project.metadata || !project.metadata.name) {
				throw new Error(`"metadata.name" configuration is missing for project ${project.id}`);
			} else if (!project.type) {
				throw new Error(`"type" configuration is missing for project ${project.id}`);
			} else if (project.version === undefined) {
				throw new Error(`"version" is missing for project ${project.id}`);
			}

			if (!project.resources) {
				project.resources = {};
			}
			if (!project.resources.configuration) {
				project.resources.configuration = {};
			}
			if (!project.resources.configuration.paths) {
				project.resources.configuration.paths = {
					"/": ""
				};
			}
			const paths = project.resources.configuration.paths;
			const dirChecks =[];
			for (const virPath of Object.keys(paths)) {
				const absolutePath = path.join(project.path, paths[virPath]);
				dirChecks.push(this.dirExists(absolutePath).then((bExists) => {
					if (!bExists) {
						throw new Error(`Could not find "${virPath}" directory of project ${project.id} at ` +
								`${absolutePath}`);
					}
				}));
			}
			return Promise.all(dirChecks);
		});
	}
}

module.exports = ModuleFormatter;

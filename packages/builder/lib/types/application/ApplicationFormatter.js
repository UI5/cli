const log = require("@ui5/logger").getLogger("types:application:ApplicationFormatter");
const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const AbstractFormatter = require("../AbstractFormatter");

class ApplicationFormatter extends AbstractFormatter {
	format(project) {
		return this.validate(project).then(() => {
			log.verbose("Formatting project %s...", project.metadata.name);
			project.resources.pathMappings = {
				"/": project.resources.configuration.paths.webapp
			};

			return this.readManifest(project).then(function(manifest) {
				if (!manifest["sap.app"]) {
					log.verbose("No 'sap.app' configuration found in manifest of project %s", project.metadata.name);
					return;
				}
				if (!manifest["sap.app"].id) {
					log.verbose("No application id found in manifest of project %s", project.metadata.name);
					return;
				}
				project.metadata.namespace = manifest["sap.app"].id.replace(/\./g, "/");
			}).catch((err) => {
				log.verbose(`No manifest found for project ${project.metadata.name}. This might be an error in the future!`);
			});
		});
	}

	readManifest(project) {
		return readFile(path.join(project.path, project.resources.pathMappings["/"], "manifest.json"))
			.then((file) => {
				return JSON.parse(file);
			});
	}

	validate(project) {
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
				project.resources.configuration.paths = {};
			}
			if (!project.resources.configuration.paths.webapp) {
				project.resources.configuration.paths.webapp = "webapp";
			}

			const absolutePath = path.join(project.path, project.resources.configuration.paths.webapp);
			return this.dirExists(absolutePath).then((bExists) => {
				if (!bExists) {
					throw new Error(`Could not find application directory of project ${project.id}: ` +
						`${absolutePath}`);
				}
			});
		});
	}
}

module.exports = ApplicationFormatter;

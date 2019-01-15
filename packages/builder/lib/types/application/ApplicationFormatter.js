const log = require("@ui5/logger").getLogger("types:application:ApplicationFormatter");
const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const AbstractFormatter = require("../AbstractFormatter");

class ApplicationFormatter extends AbstractFormatter {
	/**
	 * Validates the project and retrieves its manifest
  *
	 * @param {Object} project
	 * @returns {Promise} when validated and manifest has been read
	 */
	format(project) {
		return this.validate(project).then(() => {
			log.verbose("Formatting project %s...", project.metadata.name);
			project.resources.pathMappings = {
				"/": project.resources.configuration.paths.webapp
			};

			return this.readManifest(project).then(function(manifest) {
				if (!manifest["sap.app"] || !manifest["sap.app"].id) {
					log.warn(`No "sap.app" ID configuration found in manifest of project ${project.metadata.name}`, );
					return;
				}
				project.metadata.namespace = manifest["sap.app"].id.replace(/\./g, "/");
			}).catch((err) => {
				log.verbose(`No manifest found for project ${project.metadata.name}.`);
			});
		});
	}

	/**
	 * Reads the manifest
  *
	 * @param {Object} project
	 * @returns {Promise<Object>} resolves with the json object
	 */
	readManifest(project) {
		return readFile(path.join(project.path, project.resources.pathMappings["/"], "manifest.json"))
			.then((file) => {
				return JSON.parse(file);
			});
	}

	/**
	 * Validates a project
  *
	 * @param {Object} project
	 * @returns {Promise} resolves if successfully validated
	 * @throws {Error} if validation fails
	 */
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

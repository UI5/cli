const log = require("@ui5/logger").getLogger("types:application:ApplicationFormatter");
const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const AbstractFormatter = require("../AbstractFormatter");
let readXML; // lazy definition of the readXML function (see readPOM)

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

			return this.readManifest(project).then((manifest) => {
				// check for a proper sap.app/id in manifest.json to determine namespace
				const appId = manifest["sap.app"] && manifest["sap.app"].id;
				if (!appId) {
					log.warn(`No "sap.app" ID configuration found in manifest of project ${project.metadata.name}`);
					return;
				}
				return appId;
			}, (err) => {
				log.verbose(`No manifest found for project ${project.metadata.name}.`);
			}).then((appId) => {
				// check app id for being a Maven placeholder and try to read the value from the pom.xml
				const parts = appId && appId.match(/^\$\{(.*)\}$/);
				if (parts) {
					log.verbose(`"sap.app" ID configuration contains Maven placeholder "${parts[1]}". Resolving from pom.xml...`);
					return this.readPOM(project).then((pom) => {
						let mvnAppId;
						if (pom.project && pom.project.properties && pom.project.properties[parts[1]]) {
							mvnAppId = pom.project.properties[parts[1]];
						} else {
							let obj = pom;
							parts[1].split(".").forEach((part) => {
								obj = obj && obj[part];
							});
							mvnAppId = obj;
						}
						if (!mvnAppId) {
							log.warn(`"sap.app" ID configuration couldn't be resolved from Maven property "${parts[1]}" of pom.xml of project ${project.metadata.name}`);
							return;
						}
						return mvnAppId;
					}, (err) => {
						log.verbose(`No or invalid pom.xml found for project ${project.metadata.name}.`);
					});
				}
				return appId;
			}).then((appId) => {
				if (appId) {
					project.metadata.namespace = appId.replace(/\./g, "/");
					log.verbose(`"sap.app" ID configuration found and set as namespace ${project.metadata.namespace} for project ${project.metadata.name}.`);
				}
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
		return readFile(path.join(project.path, project.resources.pathMappings["/"], "manifest.json"), "utf-8")
			.then((file) => {
				return JSON.parse(file);
			});
	}

	/**
	 * Reads the pom.xml file
	 *
	 * @param {Object} project
	 * @returns {Promise<Object>} resolves with the XML document from the pom.xml
	 */
	readPOM(project) {
		if (!readXML) {
			const xml2js = require("xml2js");
			const parser = new xml2js.Parser({
				explicitArray: false,
				ignoreAttrs: true
			});
			readXML = promisify(parser.parseString);
		}
		return readFile(path.join(project.path, "pom.xml"), "utf-8").then(readXML);
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

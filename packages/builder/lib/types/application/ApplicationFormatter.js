const log = require("@ui5/logger").getLogger("types:application:ApplicationFormatter");
const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const slash = require("slash");
const AbstractUi5Formatter = require("../AbstractUi5Formatter");

class ApplicationFormatter extends AbstractUi5Formatter {
	/**
	 * Formats and validates the project
	 *
	 * @returns {Promise}
	 */
	async format() {
		const project = this._project;
		await this.validate();
		log.verbose("Formatting application project %s...", project.metadata.name);
		project.resources.pathMappings = {
			"/": project.resources.configuration.paths.webapp
		};

		project.metadata.namespace = await this.getNamespace();
	}

	/**
	 * Returns the base *source* path of the project. Runtime resources like manifest.json are expected
	 * to be located inside this path.
	 *
	 * @param {boolean} [posix] whether to return a POSIX path
	 * @returns {string} Base source path of the project
	 */
	getSourceBasePath(posix) {
		let p = path;
		let projectPath = this._project.path;
		if (posix) {
			projectPath = slash(projectPath);
			p = path.posix;
		}
		return p.join(projectPath, this._project.resources.pathMappings["/"]);
	}

	/**
	 * Determine application namespace by checking manifest.json.
	 * Any maven placeholders are resolved from the projects pom.xml
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async getNamespace() {
		const {content: manifest} = await this.getManifest();
		let appId;
		// check for a proper sap.app/id in manifest.json to determine namespace
		if (manifest["sap.app"] && manifest["sap.app"].id) {
			appId = manifest["sap.app"] && manifest["sap.app"].id;
		} else {
			throw new Error(
				`No sap.app/id configuration found in manifest.json of project ${this._project.metadata.name}`);
		}

		if (this.hasMavenPlaceholder(appId)) {
			try {
				appId = await this.resolveMavenPlaceholder(appId);
			} catch (err) {
				throw new Error(
					`Failed to resolve namespace of project ${this._project.metadata.name}: ${err.message}`);
			}
		}
		const namespace = appId.replace(/\./g, "/");
		log.verbose(`Namespace of project ${this._project.metadata.name} is ${namespace}`);
		return namespace;
	}

	/**
	 * Reads the projects manifest.json
	 *
	 * @returns {Promise<Object>} resolves with an object containing the <code>content</code> (as JSON) and
	 * 							<code>fsPath</code> (as string) of the manifest.json file
	 */
	async getManifest() {
		if (this._pManifest) {
			return this._pManifest;
		}
		const fsPath = path.join(this.getSourceBasePath(), "manifest.json");
		return this._pManifest = readFile(fsPath)
			.then((content) => {
				return {
					content: JSON.parse(content),
					fsPath
				};
			})
			.catch((err) => {
				throw new Error(
					`Failed to read manifest.json for project ${this._project.metadata.name}: ${err.message}`);
			});
	}

	/**
	 * Validates the project
	 *
	 * @returns {Promise} resolves if successfully validated
	 * @throws {Error} if validation fails
	 */
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
				project.resources.configuration.paths = {};
			}
			if (!project.resources.configuration.paths.webapp) {
				project.resources.configuration.paths.webapp = "webapp";
			}

			// default encoding to "ISO-8859-1" if not specified
			if (!project.resources.configuration.propertiesFileSourceEncoding) {
				project.resources.configuration.propertiesFileSourceEncoding = "ISO-8859-1";
			}
			if (!["ISO-8859-1", "UTF-8"].includes(project.resources.configuration.propertiesFileSourceEncoding)) {
				throw new Error(`Invalid properties file encoding specified for project ${project.id}: ` +
					`encoding provided: ${project.resources.configuration.propertiesFileSourceEncoding}. Must be either "ISO-8859-1" or "UTF-8".`);
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

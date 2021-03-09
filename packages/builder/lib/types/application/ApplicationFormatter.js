const log = require("@ui5/logger").getLogger("types:application:ApplicationFormatter");
const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const AbstractUi5Formatter = require("../AbstractUi5Formatter");

class ApplicationFormatter extends AbstractUi5Formatter {
	/**
	 * Constructor
	 *
	 * @param {object} parameters
	 * @param {object} parameters.project Project
	 */
	constructor(parameters) {
		super(parameters);
		this._pManifests = {};
	}
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
			projectPath = projectPath.replace(/\\/g, "/");
			p = path.posix;
		}
		return p.join(projectPath, this._project.resources.pathMappings["/"]);
	}

	/**
	 * Determine application namespace either based on a project`s
	 * manifest.json or manifest.appdescr_variant (fallback if present)
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async getNamespace() {
		try {
			return await this.getNamespaceFromManifestJson();
		} catch (manifestJsonError) {
			if (manifestJsonError.code !== "ENOENT") {
				throw manifestJsonError;
			}
			// No manifest.json present
			// => attempt fallback to manifest.appdescr_variant (typical for App Variants)
			try {
				return await this.getNamespaceFromManifestAppDescVariant();
			} catch (appDescVarError) {
				if (appDescVarError.code === "ENOENT") {
					// Fallback not possible: No manifest.appdescr_variant present
					// => Throw error indicating missing manifest.json
					// 	(do not mention manifest.appdescr_variant since it is only
					// 	relevant for the rather "uncommon" App Variants)
					throw new Error(
						`Could not find required manifest.json for project ` +
						`${this._project.metadata.name}: ${manifestJsonError.message}`);
				}
				throw appDescVarError;
			}
		}
	}

	/**
	 * Determine application namespace by checking manifest.json.
	 * Any maven placeholders are resolved from the projects pom.xml
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async getNamespaceFromManifestJson() {
		const {content: manifest} = await this.getJson("manifest.json");
		let appId;
		// check for a proper sap.app/id in manifest.json to determine namespace
		if (manifest["sap.app"] && manifest["sap.app"].id) {
			appId = manifest["sap.app"].id;
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
		log.verbose(
			`Namespace of project ${this._project.metadata.name} is ${namespace} (from manifest.json)`);
		return namespace;
	}

	/**
	 * Determine application namespace by checking manifest.appdescr_variant.
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async getNamespaceFromManifestAppDescVariant() {
		const {content: manifest} = await this.getJson("manifest.appdescr_variant");
		let appId;
		// check for the id property in manifest.appdescr_variant to determine namespace
		if (manifest && manifest.id) {
			appId = manifest.id;
		} else {
			throw new Error(
				`No "id" property found in manifest.appdescr_variant of project ${this._project.metadata.name}`);
		}

		const namespace = appId.replace(/\./g, "/");
		log.verbose(
			`Namespace of project ${this._project.metadata.name} is ${namespace} (from manifest.appdescr_variant)`);
		return namespace;
	}

	/**
	 * Reads and parses a JSON file with the provided name from the projects source directory
	 *
	 * @param {string} fileName Name of the JSON file to read. Typically "manifest.json" or "manifest.appdescr_variant"
	 * @returns {Promise<object>} resolves with an object containing the <code>content</code> (as JSON) and
	 * 							<code>fsPath</code> (as string) of the requested file
	 */
	async getJson(fileName) {
		if (this._pManifests[fileName]) {
			return this._pManifests[fileName];
		}
		const fsPath = path.join(this.getSourceBasePath(), fileName);
		return this._pManifests[fileName] = readFile(fsPath)
			.then((content) => {
				return {
					content: JSON.parse(content),
					fsPath
				};
			})
			.catch((err) => {
				if (err.code === "ENOENT") {
					throw err;
				}
				throw new Error(
					`Failed to read ${fileName} for project ` +
					`${this._project.metadata.name}: ${err.message}`);
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

			if (!project.resources.configuration.propertiesFileSourceEncoding) {
				if (["0.1", "1.0", "1.1"].includes(project.specVersion)) {
					// default encoding to "ISO-8859-1" for old specVersions
					project.resources.configuration.propertiesFileSourceEncoding = "ISO-8859-1";
				} else {
					// default encoding to "UTF-8" for all projects starting with specVersion 2.0
					project.resources.configuration.propertiesFileSourceEncoding = "UTF-8";
				}
			}
			if (!["ISO-8859-1", "UTF-8"].includes(project.resources.configuration.propertiesFileSourceEncoding)) {
				throw new Error(`Invalid properties file encoding specified for project ${project.id}. ` +
					`Encoding provided: ${project.resources.configuration.propertiesFileSourceEncoding}. ` +
					`Must be either "ISO-8859-1" or "UTF-8".`);
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

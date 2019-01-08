const log = require("@ui5/logger").getLogger("types:library:LibraryFormatter");
const path = require("path");
const fs = require("graceful-fs");
const AbstractFormatter = require("../AbstractFormatter");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const glob = require("globby");
const xml2js = require("xml2js").parseString;
const xmlParse = promisify(xml2js);


class LibraryFormatter extends AbstractFormatter {
	/**
	 * Formats the given project
	 * @param {object} project
	 * @returns {Promise}
	 */
	format(project) {
		return this.validate(project).then(function() {
			log.verbose("Formatting project %s...", project.metadata.name);
			project.resources.pathMappings = {
				"/resources/": project.resources.configuration.paths.src
			};

			if (project.resources.configuration.paths.test) {
				// Directory 'test' is somewhat optional for libraries
				project.resources.pathMappings["/test-resources/"] = project.resources.configuration.paths.test;
			} else {
				log.verbose(`Ignoring 'test' directory for project ${project.metadata.name}.` +
					"Either no setting was provided or the path not found.");
			}
		}).then(() => {
			if (project.metadata.copyright) {
				return;
			}
			// If no copyright replacment was provided by ui5.yaml,
			// check if the .library file has a valid copyright replacement
			const basePath = path.join(project.path, project.resources.pathMappings["/resources/"]);
			return glob("**/.library", {
				cwd: basePath
			}).then((dotLibraryResources) => {
				if (!dotLibraryResources.length) {
					log.verbose(`Could not find .library file for project ${project.id}`);
					return;
				}
				if (dotLibraryResources.length > 1) {
					throw new Error(`Found multiple (${dotLibraryResources.length}) .library files ` +
						`for project ${project.id}`);
				}
				const fsPath = path.join(basePath, dotLibraryResources[0]);
				return readFile(fsPath)
					.then((content) => xmlParse(content))
					.then((result) => {
						if (result && result.library.copyright) {
							project.metadata.copyright = result.library.copyright[0];
							log.verbose(`Use copyright from .library for project ${project.id}`);
						}
					}, (error) => {
						throw new Error(`Failed to check .library file for project ${project.id}, ` +
							`error: ${error.message}`);
					});
			});
		});
	}

	/**
	 *
	 * @param {object} project
	 * @returns {Promise}
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
			if (!project.resources.configuration.paths.src) {
				project.resources.configuration.paths.src = "src";
			}
			if (!project.resources.configuration.paths.test) {
				project.resources.configuration.paths.test = "test";
			}

			const absoluteSrcPath = path.join(project.path, project.resources.configuration.paths.src);
			const absoluteTestPath = path.join(project.path, project.resources.configuration.paths.test);
			return Promise.all([
				this.dirExists(absoluteSrcPath).then(function(bExists) {
					if (!bExists) {
						throw new Error(`Could not find source directory of project ${project.id}: ` +
							`${absoluteSrcPath}`);
					}
				}),
				this.dirExists(absoluteTestPath).then(function(bExists) {
					if (!bExists) {
						log.verbose(`Could not find (optional) test directory of project ${project.id}: ` +
							`${absoluteSrcPath}`);
						// Current signal to following consumers that "test" is not available is null
						project.resources.configuration.paths.test = null;
					}
				})
			]);
		});
	}
}

module.exports = LibraryFormatter;

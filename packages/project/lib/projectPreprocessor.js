const log = require("@ui5/logger").getLogger("normalizer:projectPreprocessor");
const fs = require("graceful-fs");
const path = require("path");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const parseYaml = require("js-yaml").safeLoad;
const typeRepository = require("@ui5/builder").types.typeRepository;

class ProjectPreprocessor {
	/*
		Adapt and enhance the project tree:
			- Replace duplicate projects further away from the root with those closed to the root
			- Add configuration to projects
	*/
	async processTree(tree) {
		const processedProjects = {};
		const queue = [{
			project: tree,
			parent: null,
			level: 0
		}];
		const configPromises = [];
		let startTime;
		if (log.isLevelEnabled("verbose")) {
			startTime = process.hrtime();
		}

		// Breadth-first search to prefer projects closer to root
		while (queue.length) {
			const {project, parent, level} = queue.shift(); // Get and remove first entry from queue
			if (!project.id) {
				throw new Error("Encountered project with missing id");
			}
			project._level = level;

			// Check whether project ID is already known
			const processedProject = processedProjects[project.id];
			if (processedProject) {
				if (processedProject.ignored) {
					log.verbose(`Dependency of project ${parent.id}, "${project.id}" is flagged as ignored.`);
					parent.dependencies.splice(parent.dependencies.indexOf(project), 1);
					continue;
				}
				log.verbose(`Dependency of project ${parent.id}, "${project.id}": Distance to root of ${level}. Will be `+
					`replaced by project with same ID and distance to root of ${processedProject.project._level}.`);

				// Replace with the already processed project (closer to root -> preferred)
				parent.dependencies[parent.dependencies.indexOf(project)] = processedProject.project;
				processedProject.parents.push(parent);

				// No further processing needed
				continue;
			}

			processedProjects[project.id] = {
				project,
				// If a project is referenced multiple times in the dependency tree,
				//	it is replaced with the occurrence closest to the root.
				// Here we collect the different parents, this single project configuration then has
				parents: [parent]
			};

			configPromises.push(this.configureProject(project).then((config) => {
				if (!config) {
					if (project === tree) {
						throw new Error(`Failed to configure root project "${project.id}". Please check verbose log for details.`);
					}

					// No config available
					// => reject this project by removing it from its parents list of dependencies
					log.verbose(`Ignoring project ${project.id} with missing configuration `+
						"(might be a non-UI5 dependency)");
					const parents = processedProjects[project.id].parents;
					for (var i = parents.length - 1; i >= 0; i--) {
						parents[i].dependencies.splice(parents[i].dependencies.indexOf(project), 1);
					}
					processedProjects[project.id] = {ignored: true};
				}
			}));

			if (project.dependencies) {
				queue.push(...project.dependencies.map((depProject) => {
					return {
						project: depProject,
						parent: project,
						level: level + 1
					};
				}));
			}
		}
		return Promise.all(configPromises).then(() => {
			if (log.isLevelEnabled("verbose")) {
				const prettyHrtime = require("pretty-hrtime");
				const timeDiff = process.hrtime(startTime);
				log.verbose(`Processed ${Object.keys(processedProjects).length} projects in ${prettyHrtime(timeDiff)}`);
			}
			return tree;
		});
	}

	async configureProject(project) {
		if (!project.specVersion) { // Project might already be configured (e.g. via inline configuration)
			// Currently, specVersion is the indicator for configured projects
			const projectConf = await this.getProjectConfiguration(project);

			if (!projectConf) {
				return null;
			}
			// Enhance project with its configuration
			Object.assign(project, projectConf);
		}

		if (!project.specVersion) {
			if (project._level === 0) {
				throw new Error(`No specification version defined for root project ${project.id}`);
			}
			log.verbose(`No specification version defined for project ${project.id}`);
			return; // return with empty config
		}

		if (project.specVersion !== "0.1") {
			throw new Error(
				`Invalid specification version defined for project ${project.id}: ${project.specVersion}. ` +
				"The currently only allowed version is \"0.1\"");
		}

		if (!project.type) {
			if (project._level === 0) {
				throw new Error(`No type configured for root project ${project.id}`);
			}
			log.verbose(`No type configured for project ${project.id} (neither in project configuration, nor in any shim)`);
			return; // return with empty config
		}

		if (project.type === "application" && project._level !== 0) {
			// There is only one project of type application allowed
			// That project needs to be the root project
			log.verbose(`[Warn] Ignoring project ${project.id} with type application`+
					` (distance to root: ${project._level}). Type application is only allowed for the root project`);
			return; // return with empty config
		}

		// Apply type
		await this.applyType(project);
		return project;
	}

	async getProjectConfiguration(project) {
		// A projects configPath property takes precedence over the default "<projectPath>/ui5.yaml" path
		const configPath = project.configPath || path.join(project.path, "/ui5.yaml");

		let config;
		try {
			config = await this.readConfigFile(configPath);
		} catch (err) {
			const errorText = "Failed to read configuration for project " +
					`${project.id} at "${configPath}". Error: ${err.message}`;

			if (err.code !== "ENOENT") { // Something else than "File or directory does not exist"
				throw new Error(errorText);
			}
			log.verbose(errorText);

			/* Disabled shimming until shim-plugin is available
			// If there is a config shim, use it as fallback
			if (configShims[project.id]) {
				// It's ok if there is no project configuration in the project if there is a shim for it
				log.verbose(`Applying shim for project ${project.id}...`);
				config = JSON.parse(JSON.stringify(configShims[project.id]));
			} else {
				// No configuration available -> return empty config
				return null;
			}*/
		}

		return config;
	}

	async readConfigFile(configPath) {
		const configFile = await readFile(configPath);
		return parseYaml(configFile, {
			filename: path
		});
	}

	async applyType(project) {
		let type = typeRepository.getType(project.type);
		return type.format(project);
	}
}

/**
 * The Project Preprocessor enriches the dependency information with project configuration
 *
 * @module normalizer/translators/static
 */
module.exports = {
	/**
	 * Collects project information and its dependencies to enrich it with project configuration
	 *
	 * @param {Object} tree Dependency tree of the project
	 * @returns {Promise} Promise resolving with the dependency tree and enriched project configuration
	 */
	processTree: function(tree) {
		return new ProjectPreprocessor().processTree(tree);
	}
};

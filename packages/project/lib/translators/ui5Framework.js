const log = require("@ui5/logger").getLogger("normalizer:translators:ui5Framework");

class ProjectProcessor {
	constructor({libraryMetadata}) {
		this._libraryMetadata = libraryMetadata;
		this._projectCache = {};
	}
	getProject(libName) {
		log.verbose(`Creating project for library ${libName}...`);

		if (this._projectCache[libName]) {
			log.verbose(`Returning cached project for library ${libName}`);
			return this._projectCache[libName];
		}

		if (!this._libraryMetadata[libName]) {
			throw new Error(`Failed to find library ${libName} in dist packages metadata.json`);
		}

		const depMetadata = this._libraryMetadata[libName];

		const dependencies = [];
		dependencies.push(...depMetadata.dependencies.map((depName) => {
			return this.getProject(depName);
		}));

		if (depMetadata.optionalDependencies) {
			const resolvedOptionals = depMetadata.optionalDependencies.map((depName) => {
				if (this._libraryMetadata[depName]) {
					log.verbose(`Resolving optional dependency ${depName} for project ${libName}...`);
					return this.getProject(depName);
				}
			}).filter(($)=>$);

			dependencies.push(...resolvedOptionals);
		}

		this._projectCache[libName] = {
			id: depMetadata.id,
			version: depMetadata.version,
			path: depMetadata.path,
			dependencies
		};
		return this._projectCache[libName];
	}
}

const utils = {
	getAllNodesOfTree(tree) {
		const nodes = {};
		const queue = [...tree];
		while (queue.length) {
			const project = queue.shift();
			if (!nodes[project.metadata.name]) {
				nodes[project.metadata.name] = project;
				queue.push(...project.dependencies);
			}
		}
		return nodes;
	},
	isFrameworkProject(project) {
		return project.id.startsWith("@openui5/") || project.id.startsWith("@sapui5/");
	},
	shouldIncludeDependency({optional, development}, root) {
		// Root project should include all dependencies
		// Otherwise only non-optional and non-development dependencies should be included
		return root || (optional !== true && development !== true);
	},
	getFrameworkLibrariesFromTree(project, ui5Dependencies = [], root = true) {
		if (utils.isFrameworkProject(project)) {
			// Ignoring UI5 Framework libraries in dependencies
			return ui5Dependencies;
		}

		this._addFrameworkLibrariesFromProject(project, ui5Dependencies, root);

		project.dependencies.map((depProject) => {
			utils.getFrameworkLibrariesFromTree(depProject, ui5Dependencies, false);
		});
		return ui5Dependencies;
	},
	_addFrameworkLibrariesFromProject(project, ui5Dependencies, root) {
		if (!project.framework) {
			return;
		}
		if (
			project.specVersion !== "2.0" && project.specVersion !== "2.1" &&
			project.specVersion !== "2.2" && project.specVersion !== "2.3" &&
			project.specVersion !== "2.4"
		) {
			log.warn(`Project ${project.metadata.name} defines invalid ` +
				`specification version ${project.specVersion} for framework.libraries configuration`);
			return;
		}

		if (!project.framework.libraries || !project.framework.libraries.length) {
			log.verbose(`Project ${project.metadata.name} defines no framework.libraries configuration`);
			// Possible future enhancement: Fallback to detect OpenUI5 framework dependencies in package.json
			return;
		}

		project.framework.libraries.forEach((dependency) => {
			if (!ui5Dependencies.includes(dependency.name) &&
					utils.shouldIncludeDependency(dependency, root)) {
				ui5Dependencies.push(dependency.name);
			}
		});
	},
	ProjectProcessor
};

/**
 *
 *
 * @private
 * @namespace
 * @alias module:@ui5/project.translators.ui5Framework
 */
module.exports = {
	/**
	 *
	 *
	 * @public
	 * @param {object} tree
	 * @param {object} [options]
	 * @param {string} [options.versionOverride] Framework version to use instead of the root projects framework
	 *   version from the provided <code>tree</code>
	 * @returns {Promise<object|null>} Promise
	 */
	generateDependencyTree: async function(tree, options = {}) {
		// Don't create a tree when root project doesn't have a framework configuration
		if (!tree.framework) {
			return null;
		}

		const frameworkName = tree.framework.name;
		if (frameworkName !== "SAPUI5" && frameworkName !== "OpenUI5") {
			throw new Error(
				`Unknown framework.name "${frameworkName}" for project ${tree.id}. Must be "OpenUI5" or "SAPUI5"`
			);
		}

		let Resolver;
		if (frameworkName === "OpenUI5") {
			Resolver = require("../ui5Framework/Openui5Resolver");
		} else if (frameworkName === "SAPUI5") {
			Resolver = require("../ui5Framework/Sapui5Resolver");
		}

		let version;
		if (!tree.framework.version) {
			throw new Error(
				`framework.version is not defined for project ${tree.id}`
			);
		} else if (options.versionOverride) {
			version = await Resolver.resolveVersion(options.versionOverride, {cwd: tree.path});
			log.info(
				`Overriding configured ${frameworkName} version ` +
				`${tree.framework.version} with version ${version}`
			);
		} else {
			version = tree.framework.version;
		}

		const referencedLibraries = utils.getFrameworkLibrariesFromTree(tree);
		if (!referencedLibraries.length) {
			log.verbose(`No ${frameworkName} libraries referenced in project ${tree.id} or its dependencies`);
			return null;
		}

		log.info(`Using ${frameworkName} version: ${version}`);

		const resolver = new Resolver({cwd: tree.path, version});

		let startTime;
		if (log.isLevelEnabled("verbose")) {
			startTime = process.hrtime();
		}

		const {libraryMetadata} = await resolver.install(referencedLibraries);

		if (log.isLevelEnabled("verbose")) {
			const timeDiff = process.hrtime(startTime);
			const prettyHrtime = require("pretty-hrtime");
			log.verbose(
				`${frameworkName} dependencies ${referencedLibraries.join(", ")} ` +
				`resolved in ${prettyHrtime(timeDiff)}`);
		}

		const projectProcessor = new utils.ProjectProcessor({
			libraryMetadata
		});

		const libraries = referencedLibraries.map((libName) => {
			return projectProcessor.getProject(libName);
		});

		// Use root project (=requesting project) as root of framework tree
		// For this we clone all properties of the root project,
		// except the dependencies since they will be overwritten anyways
		const frameworkTree = {};
		for (const attribute of Object.keys(tree)) {
			if (attribute !== "dependencies") {
				frameworkTree[attribute] = JSON.parse(JSON.stringify(tree[attribute]));
			}
		}

		// Overwrite dependencies to exclusively contain framework libraries
		frameworkTree.dependencies = libraries;
		// Flag as transparent so that the project type is not applied again
		frameworkTree._transparentProject = true;
		return frameworkTree;
	},

	mergeTrees: function(projectTree, frameworkTree) {
		const frameworkLibs = utils.getAllNodesOfTree(frameworkTree.dependencies);

		log.verbose(`Merging framework tree into project tree "${projectTree.metadata.name}"`);

		const queue = [projectTree];
		const processedProjects = [];
		while (queue.length) {
			const project = queue.shift();
			if (project.deduped) {
				// Deduped projects have certainly already been processed
				// Note: Deduped dependencies don't have any metadata or other configuration.
				continue;
			}
			if (processedProjects.includes(project.id)) {
				// projectTree must be duplicate free. A second occurrence of the same project
				//	is always the same object. Therefore a single processing needs to be ensured.
				// Otherwise the isFrameworkProject check would detect framework dependencies added
				//	at an earlier processing of the project and yield incorrect logging.
				log.verbose(`Project ${project.metadata.name} (${project.id}) has already been processed`);
				continue;
			}
			processedProjects.push(project.id);

			project.dependencies = project.dependencies.filter((depProject) => {
				if (utils.isFrameworkProject(depProject)) {
					log.verbose(
						`A translator has already added the UI5 framework library ${depProject.metadata.name} ` +
						`(id: ${depProject.id}) to the dependencies of project ${project.metadata.name}. ` +
						`This dependency will be ignored.`);
					log.info(`If project ${project.metadata.name} contains a package.json in which it defines a ` +
						`dependency to the UI5 framework library ${depProject.id}, this dependency should be removed.`);
					return false;
				}
				return true;
			});
			queue.push(...project.dependencies);

			if (
				(
					project.specVersion === "2.0" || project.specVersion === "2.1" ||
					project.specVersion === "2.2" || project.specVersion === "2.3" ||
					project.specVersion === "2.4"
				) && project.framework && project.framework.libraries) {
				const frameworkDeps = project.framework.libraries
					.filter((dependency) => {
						if (dependency.optional && frameworkLibs[dependency.name]) {
							// Resolved optional dependencies shall be used
							return true;
						}
						// Filter out development and unresolved optional dependencies for non-root projects
						return utils.shouldIncludeDependency(dependency, project._isRoot);
					})
					.map((dependency) => {
						if (!frameworkLibs[dependency.name]) {
							throw new Error(`Missing framework library ${dependency.name} ` +
								`required by project ${project.metadata.name}`);
						}
						return frameworkLibs[dependency.name];
					});
				if (frameworkDeps.length) {
					project.dependencies.push(...frameworkDeps);
				}
			}
		}
		return projectTree;
	},

	// Export for testing only
	_utils: process.env.NODE_ENV === "test" ? utils : undefined
};

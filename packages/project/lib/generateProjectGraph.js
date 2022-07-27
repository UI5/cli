const path = require("path");
const projectGraphBuilder = require("./graph/projectGraphBuilder");
const ui5Framework = require("./graph/helpers/ui5Framework");
const log = require("@ui5/logger").getLogger("generateProjectGraph");

function resolveProjectPaths(cwd, project) {
	if (!project.path) {
		throw new Error(`Missing or empty attribute 'path' for project ${project.id}`);
	}
	project.path = path.resolve(cwd, project.path);

	if (!project.id) {
		throw new Error(`Missing or empty attribute 'id' for project with path ${project.path}`);
	}
	if (!project.version) {
		throw new Error(`Missing or empty attribute 'version' for project ${project.id}`);
	}

	if (project.dependencies) {
		project.dependencies.forEach((project) => resolveProjectPaths(cwd, project));
	}
	return project;
}

/**
 * Helper module to create a [@ui5/project.graph.ProjectGraph]{@link module:@ui5/project.graph.ProjectGraph}
 * from a directory
 *
 * @public
 * @alias module:@ui5/project.generateProjectGraph
 * @param {TreeNode} tree Dependency tree as returned by a translator
 * @returns {module:@ui5/project.graph.ProjectGraph} A new project graph instance
 */
const generateProjectGraph = {
	/**
	 * Generates a [@ui5/project.graph.ProjectGraph]{@link module:@ui5/project.graph.ProjectGraph} by resolving
	 * dependencies from package.json files and configuring projects from ui5.yaml files
	 *
	 * @public
	 * @param {object} [options]
	 * @param {string} [options.cwd=process.cwd()] Directory to start searching for the root module
	 * @param {object} [options.rootConfiguration]
	 *		Configuration object to use for the root module instead of reading from a configuration file
	 * @param {string} [options.rootConfigPath]
	 *		Configuration file to use for the root module instead the default ui5.yaml
	 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
	 * @param {string} [options.resolveFrameworkDependencies=true]
	 * 						Whether framework dependencies should be added to the graph
	 * @returns {Promise<module:@ui5/project.graph.ProjectGraph>} Promise resolving to a Project Graph instance
	 */
	usingNodePackageDependencies: async function({
		cwd, rootConfiguration, rootConfigPath,
		versionOverride, resolveFrameworkDependencies = true
	}) {
		log.verbose(`Creating project graph using npm provider...`);
		const NpmProvider = require("./graph/providers/NodePackageDependencies");

		const provider = new NpmProvider({
			cwd: cwd ? path.resolve(cwd) : process.cwd(),
			rootConfiguration,
			rootConfigPath
		});

		const projectGraph = await projectGraphBuilder(provider);

		if (resolveFrameworkDependencies) {
			await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride});
		}

		return projectGraph;
	},

	/**
	 * Generates a [@ui5/project.graph.ProjectGraph]{@link module:@ui5/project.graph.ProjectGraph} from a
	 * YAML file following the structure of the
	 * [@ui5/project.graph.projectGraphFromTree]{@link module:@ui5/project.graph.projectGraphFromTree} API
	 *
	 * @public
	 * @param {object} options
	 * @param {object} [options.filePath=projectDependencies.yaml] Path to the dependency configuration file
	 * @param {string} [options.cwd=process.cwd()] Directory to resolve relative paths to
	 * @param {object} [options.rootConfiguration]
	 *		Configuration object to use for the root module instead of reading from a configuration file
	 * @param {string} [options.rootConfigPath]
	 *		Configuration file to use for the root module instead the default ui5.yaml
	 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
	 * @param {string} [options.resolveFrameworkDependencies=true]
	 * 						Whether framework dependencies should be added to the graph
	 * @returns {Promise<module:@ui5/project.graph.ProjectGraph>} Promise resolving to a Project Graph instance
	 */
	usingStaticFile: async function({
		cwd, filePath = "projectDependencies.yaml",
		rootConfiguration, rootConfigPath,
		versionOverride, resolveFrameworkDependencies = true
	}) {
		log.verbose(`Creating project graph using static file...`);

		const dependencyTree = await generateProjectGraph
			._readDependencyConfigFile(cwd ? path.resolve(cwd) : process.cwd(), filePath);

		const DependencyTreeProvider = require("./graph/providers/DependencyTree");
		const provider = new DependencyTreeProvider({
			dependencyTree,
			rootConfiguration,
			rootConfigPath
		});

		const projectGraph = await projectGraphBuilder(provider);

		if (resolveFrameworkDependencies) {
			await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride});
		}

		return projectGraph;
	},

	/**
	 * Generates a [@ui5/project.graph.ProjectGraph]{@link module:@ui5/project.graph.ProjectGraph} from a
	 * YAML file following the structure of the
	 * [@ui5/project.graph.projectGraphFromTree]{@link module:@ui5/project.graph.projectGraphFromTree} API
	 *
	 * @public
	 * @param {object} options
	 * @param {module:@ui5/project.graph.providers.DependencyTree.TreeNode} options.dependencyTree
	 * @param {object} [options.rootConfiguration]
	 *		Configuration object to use for the root module instead of reading from a configuration file
	 * @param {string} [options.rootConfigPath]
	 *		Configuration file to use for the root module instead the default ui5.yaml
	 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
	 * @param {string} [options.resolveFrameworkDependencies=true]
	 * 						Whether framework dependencies should be added to the graph
	 * @returns {Promise<module:@ui5/project.graph.ProjectGraph>} Promise resolving to a Project Graph instance
	 */
	usingObject: async function({
		dependencyTree,
		rootConfiguration, rootConfigPath,
		versionOverride, resolveFrameworkDependencies = true
	}) {
		log.verbose(`Creating project graph using object...`);

		const DependencyTreeProvider = require("./graph/providers/DependencyTree");
		const dependencyTreeProvider = new DependencyTreeProvider({
			dependencyTree,
			rootConfiguration,
			rootConfigPath
		});

		const projectGraph = await projectGraphBuilder(dependencyTreeProvider);

		if (resolveFrameworkDependencies) {
			await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride});
		}

		return projectGraph;
	},

	async _readDependencyConfigFile(cwd, filePath) {
		const fs = require("graceful-fs");
		const {promisify} = require("util");
		const readFile = promisify(fs.readFile);
		const parseYaml = require("js-yaml").load;

		if (!path.isAbsolute(filePath)) {
			filePath = path.join(cwd, filePath);
		}

		let dependencyTree;
		try {
			const contents = await readFile(filePath, {encoding: "utf-8"});
			dependencyTree = parseYaml(contents, {
				filename: filePath
			});
			resolveProjectPaths(cwd, dependencyTree);
		} catch (err) {
			throw new Error(
				`Failed to load dependency tree configuration from path ${filePath}: ${err.message}`);
		}
		return dependencyTree;
	}
};

module.exports = generateProjectGraph;

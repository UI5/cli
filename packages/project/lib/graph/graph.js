import path from "node:path";
import projectGraphBuilder from "./projectGraphBuilder.js";
import ui5Framework from "./helpers/ui5Framework.js";
import logger from "@ui5/logger";
const log = logger.getLogger("generateProjectGraph");

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
 * Helper module to create a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph}
 * from a directory
 *
 * @public
 * @module @ui5/project/graph
 */

/**
 * Generates a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph} by resolving
 * dependencies from package.json files and configuring projects from ui5.yaml files
 *
 * @public
 * @static
 * @param {object} [options]
 * @param {string} [options.cwd=process.cwd()] Directory to start searching for the root module
 * @param {object} [options.rootConfiguration]
 *		Configuration object to use for the root module instead of reading from a configuration file
 * @param {string} [options.rootConfigPath]
 *		Configuration file to use for the root module instead the default ui5.yaml
 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
 * @param {string} [options.resolveFrameworkDependencies=true]
 * 		Whether framework dependencies should be added to the graph
 * @returns {Promise<@ui5/project/graph/ProjectGraph>} Promise resolving to a Project Graph instance
 */
export async function graphFromPackageDependencies({
	cwd, rootConfiguration, rootConfigPath,
	versionOverride, resolveFrameworkDependencies = true
}) {
	log.verbose(`Creating project graph using npm provider...`);
	const {
		default: NpmProvider
	} = await import("./providers/NodePackageDependencies.js");

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
}

/**
 * Generates a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph} from a
 * YAML file following the structure of the
 * [@ui5/project/graph/ProjectGraphFromTree]{@link @ui5/project/graph/ProjectGraphFromTree} API
 *
 * @public
 * @static
 * @param {object} options
 * @param {object} [options.filePath=projectDependencies.yaml] Path to the dependency configuration file
 * @param {string} [options.cwd=process.cwd()] Directory to resolve relative paths to
 * @param {object} [options.rootConfiguration]
 *		Configuration object to use for the root module instead of reading from a configuration file
 * @param {string} [options.rootConfigPath]
 *		Configuration file to use for the root module instead the default ui5.yaml
 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
 * @param {string} [options.resolveFrameworkDependencies=true]
 *		Whether framework dependencies should be added to the graph
 * @returns {Promise<@ui5/project/graph/ProjectGraph>} Promise resolving to a Project Graph instance
 */
export async function graphFromStaticFile({
	cwd, filePath = "projectDependencies.yaml",
	rootConfiguration, rootConfigPath,
	versionOverride, resolveFrameworkDependencies = true
}) {
	log.verbose(`Creating project graph using static file...`);

	const dependencyTree = await utils.readDependencyConfigFile(cwd ? path.resolve(cwd) : process.cwd(), filePath);

	const {
		default: DependencyTreeProvider
	} = await import("./providers/DependencyTree.js");
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
}

/**
 * Generates a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph} from the
 * given <code>dependencyTree</code> following the structure of the
 * [@ui5/project/graph/providers/DependencyTree~TreeNode]{@link @ui5/project/graph/providers/DependencyTree~TreeNode}
 *
 * @public
 * @static
 * @param {object} options
 * @param {@ui5/project/graph/providers/DependencyTree~TreeNode} options.dependencyTree
 * @param {object} [options.rootConfiguration]
 *		Configuration object to use for the root module instead of reading from a configuration file
 * @param {string} [options.rootConfigPath]
 *		Configuration file to use for the root module instead the default ui5.yaml
 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
 * @param {string} [options.resolveFrameworkDependencies=true]
 *		Whether framework dependencies should be added to the graph
 * @returns {Promise<@ui5/project/graph/ProjectGraph>} Promise resolving to a Project Graph instance
*/
export async function graphFromObject({
	dependencyTree,
	rootConfiguration, rootConfigPath,
	versionOverride, resolveFrameworkDependencies = true
}) {
	log.verbose(`Creating project graph using object...`);

	const {
		default: DependencyTreeProvider
	} = await import("./providers/DependencyTree.js");
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
}

const utils = {
	readDependencyConfigFile: async function(cwd, filePath) {
		const {
			default: fs
		} = await import("graceful-fs");
		const {promisify} = await import("util");
		const readFile = promisify(fs.readFile);
		const parseYaml =(await import("js-yaml")).load;

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

// Export function for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	graphFromStaticFile._utils = utils;
}

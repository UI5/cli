import path from "node:path";
import projectGraphBuilder from "./projectGraphBuilder.js";
import ui5Framework from "./helpers/ui5Framework.js";
import createWorkspace from "./helpers/createWorkspace.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("generateProjectGraph");

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
 *		Configuration file to use for the root module instead the default ui5.yaml. Either a path relative to
 *		<code>cwd</code> or an absolute path. In both case, platform-specific path segment separators must be used.
 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
 * @param {string} [options.resolveFrameworkDependencies=true]
 * 		Whether framework dependencies should be added to the graph
 * @param {string} [options.workspaceName]
 * 		Name of the workspace configuration that should be used if any is provided
 * @param {module:@ui5/project/ui5Framework/maven/CacheMode} [options.cacheMode]
 *      Cache mode to use when consuming SNAPSHOT versions of a framework
 * @param {string} [options.workspaceConfigPath=ui5-workspace.yaml]
 * 		Workspace configuration file to use if no object has been provided
 * @param {@ui5/project/graph/Workspace~Configuration} [options.workspaceConfiguration]
 * 		Workspace configuration object to use instead of reading from a configuration file.
 * 		Parameter <code>workspaceName</code> can either be omitted or has to match with the given configuration name
 * @returns {Promise<@ui5/project/graph/ProjectGraph>} Promise resolving to a Project Graph instance
 */
export async function graphFromPackageDependencies({
	cwd, rootConfiguration, rootConfigPath,
	versionOverride, cacheMode, resolveFrameworkDependencies = true,
	workspaceName /* TODO 4.0: default workspaceName to "default" ? */,
	workspaceConfiguration, workspaceConfigPath = "ui5-workspace.yaml"
}) {
	log.verbose(`Creating project graph using npm provider...`);
	const {
		default: NpmProvider
	} = await import("./providers/NodePackageDependencies.js");

	cwd = cwd ? path.resolve(cwd) : process.cwd();
	rootConfigPath = utils.resolveConfigPath(cwd, rootConfigPath);

	let workspace;
	if (workspaceName || workspaceConfiguration) {
		workspace = await createWorkspace({
			cwd,
			name: workspaceName,
			configObject: workspaceConfiguration,
			configPath: workspaceConfigPath
		});
	}

	const provider = new NpmProvider({
		cwd,
		rootConfiguration,
		rootConfigPath
	});

	const projectGraph = await projectGraphBuilder(provider, workspace);

	if (resolveFrameworkDependencies) {
		await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride, cacheMode, workspace});
	}

	return projectGraph;
}

/**
 * Generates a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph} from a
 * YAML file following the structure of
 * [@ui5/project/graph/providers/DependencyTree~TreeNode]{@link @ui5/project/graph/providers/DependencyTree~TreeNode}.
 *
 * Documentation:
 * [Static Dependency Definition]{@link https://sap.github.io/ui5-tooling/stable/pages/Overview/#static-dependency-definition}
 *
 * @public
 * @static
 * @param {object} options
 * @param {object} [options.filePath=projectDependencies.yaml] Path to the dependency configuration file
 * @param {string} [options.cwd=process.cwd()] Directory to resolve relative paths to
 * @param {object} [options.rootConfiguration]
 *		Configuration object to use for the root module instead of reading from a configuration file
 * @param {string} [options.rootConfigPath]
 *		Configuration file to use for the root module instead the default ui5.yaml. Either a path relative to
 *		<code>cwd</code> or an absolute path. In both case, platform-specific path segment separators must be used.
 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
 * @param {module:@ui5/project/ui5Framework/maven/CacheMode} [options.cacheMode]
 *      Cache mode to use when consuming SNAPSHOT versions of a framework
 * @param {string} [options.resolveFrameworkDependencies=true]
 *		Whether framework dependencies should be added to the graph
 * @returns {Promise<@ui5/project/graph/ProjectGraph>} Promise resolving to a Project Graph instance
 */
export async function graphFromStaticFile({
	filePath = "projectDependencies.yaml", cwd,
	rootConfiguration, rootConfigPath,
	versionOverride, cacheMode, resolveFrameworkDependencies = true
}) {
	log.verbose(`Creating project graph using static file...`);
	const {
		default: DependencyTreeProvider
	} = await import("./providers/DependencyTree.js");

	cwd = cwd ? path.resolve(cwd) : process.cwd();
	rootConfigPath = utils.resolveConfigPath(cwd, rootConfigPath);

	const dependencyTree = await utils.readDependencyConfigFile(cwd, filePath);

	const provider = new DependencyTreeProvider({
		dependencyTree,
		rootConfiguration,
		rootConfigPath
	});

	const projectGraph = await projectGraphBuilder(provider);

	if (resolveFrameworkDependencies) {
		await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride, cacheMode});
	}

	return projectGraph;
}

/**
 * Generates a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph} from the
 * given <code>dependencyTree</code> following the structure of
 * [@ui5/project/graph/providers/DependencyTree~TreeNode]{@link @ui5/project/graph/providers/DependencyTree~TreeNode}
 *
 * @public
 * @static
 * @param {object} options
 * @param {@ui5/project/graph/providers/DependencyTree~TreeNode} options.dependencyTree
 * @param {string} [options.cwd=process.cwd()] Directory to resolve relative paths to
 * @param {object} [options.rootConfiguration]
 *		Configuration object to use for the root module instead of reading from a configuration file
 * @param {string} [options.rootConfigPath]
 *		Configuration file to use for the root module instead the default ui5.yaml. Either a path relative to
 *		<code>cwd</code> or an absolute path. In both case, platform-specific path segment separators must be used.
 * @param {string} [options.versionOverride] Framework version to use instead of the one defined in the root project
 * @param {module:@ui5/project/ui5Framework/maven/CacheMode} [options.cacheMode]
 *      Cache mode to use when consuming SNAPSHOT versions of a framework
 * @param {string} [options.resolveFrameworkDependencies=true]
 *		Whether framework dependencies should be added to the graph
 * @returns {Promise<@ui5/project/graph/ProjectGraph>} Promise resolving to a Project Graph instance
*/
export async function graphFromObject({
	dependencyTree, cwd,
	rootConfiguration, rootConfigPath,
	versionOverride, cacheMode, resolveFrameworkDependencies = true
}) {
	log.verbose(`Creating project graph using object...`);
	const {
		default: DependencyTreeProvider
	} = await import("./providers/DependencyTree.js");

	cwd = cwd ? path.resolve(cwd) : process.cwd();
	rootConfigPath = utils.resolveConfigPath(cwd, rootConfigPath);

	const dependencyTreeProvider = new DependencyTreeProvider({
		dependencyTree,
		rootConfiguration,
		rootConfigPath
	});

	const projectGraph = await projectGraphBuilder(dependencyTreeProvider);

	if (resolveFrameworkDependencies) {
		await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride, cacheMode});
	}

	return projectGraph;
}

const utils = {
	resolveConfigPath: function(cwd, configPath) {
		if (configPath && !path.isAbsolute(configPath)) {
			configPath = path.join(cwd, configPath);
		}
		return configPath;
	},
	readDependencyConfigFile: async function(cwd, filePath) {
		const {
			default: fs
		} = await import("graceful-fs");
		const {promisify} = await import("util");
		const readFile = promisify(fs.readFile);
		const parseYaml =(await import("js-yaml")).load;

		filePath = utils.resolveConfigPath(cwd, filePath);

		let dependencyTree;
		try {
			const contents = await readFile(filePath, {encoding: "utf-8"});
			dependencyTree = parseYaml(contents, {
				filename: filePath
			});
			utils.resolveProjectPaths(cwd, dependencyTree);
		} catch (err) {
			throw new Error(
				`Failed to load dependency tree configuration from path ${filePath}: ${err.message}`);
		}
		return dependencyTree;
	},

	resolveProjectPaths: function(cwd, project) {
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
			project.dependencies.forEach((project) => utils.resolveProjectPaths(cwd, project));
		}
		return project;
	}
};

// Export function for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	graphFromStaticFile._utils = utils;
}

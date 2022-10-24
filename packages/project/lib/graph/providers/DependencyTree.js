/**
 * Tree node
 *
 * @public
 * @class
 * @typedef {object} @ui5/project/graph/providers/DependencyTree~TreeNode
 * @property {string} node.id Unique ID for the project
 * @property {string} node.version Version of the project
 * @property {string} node.path File System path to access the projects resources
 * @property {object|object[]} [node.configuration]
 *	Configuration object or array of objects to use instead of reading from a configuration file
 * @property {string} [node.configPath] Configuration file to use instead the default ui5.yaml
 * @property {@ui5/project/graph/providers/DependencyTree~TreeNode[]} dependencies
 */

/**
 * Helper module to create a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph}
 * from a dependency tree as returned by translators.
 *
 * @public
 * @class
 * @alias @ui5/project/graph/providers/DependencyTree
 */
class DependencyTree {
	/**
	 * @param {object} options
	 * @param {@ui5/project/graph/providers/DependencyTree~TreeNode} options.dependencyTree
 	 * 		Dependency tree as returned by a translator
	 * @param {object} [options.rootConfiguration]
	 *		Configuration object to use for the root module instead of reading from a configuration file
	 * @param {string} [options.rootConfigPath]
	 *		Configuration file to use for the root module instead the default ui5.yaml
	 */
	constructor({dependencyTree, rootConfiguration, rootConfigPath}) {
		if (!dependencyTree) {
			throw new Error(`Failed to instantiate DependencyTree provider: Missing parameter 'dependencyTree'`);
		}
		this._tree = dependencyTree;
		if (rootConfiguration) {
			this._tree.configuration = rootConfiguration;
		}
		if (rootConfigPath) {
			this._tree.configPath = rootConfigPath;
		}
	}

	async getRootNode() {
		return this._tree;
	}

	async getDependencies(node) {
		if (node.deduped || !node.dependencies) {
			return [];
		}
		return node.dependencies;
	}
}

export default DependencyTree;

import HashTree from "./HashTree.js";
import TreeNode from "./TreeNode.js";

/**
 * Shared HashTree that coordinates updates through a TreeRegistry.
 *
 * This variant of HashTree is designed for scenarios where multiple trees need
 * to share nodes and coordinate batch updates. All modifications (upserts and removals)
 * are delegated to the registry, which applies them atomically across all registered trees.
 *
 * Key differences from base HashTree:
 * - Requires a TreeRegistry instance
 * - upsertResources() and removeResources() return undefined (results available via registry.flush())
 * - Derived trees share the same registry
 * - Changes to shared nodes propagate to all trees
 *
 * @extends HashTree
 */
export default class SharedHashTree extends HashTree {
	/**
	 * Create a new SharedHashTree
	 *
	 * @param {Array<ResourceMetadata>|null} resources
	 *   Initial resources to populate the tree. Each resource should have a path and optional metadata.
	 * @param {TreeRegistry} registry Required registry for coordinated batch updates across multiple trees
	 * @param {object} options
	 * @param {number} [options.indexTimestamp] Timestamp of the latest resource metadata update
	 * @param {TreeNode} [options._root] Internal: pre-existing root node for derived trees (enables structural sharing)
	 */
	constructor(resources = null, registry, options = {}) {
		if (!registry) {
			throw new Error("SharedHashTree requires a registry option");
		}

		super(resources, options);

		this.registry = registry;
		this.registry.register(this);
	}

	/**
	 * Schedule resource upserts (insert or update) to be applied during registry flush.
	 *
	 * Unlike base HashTree, this method doesn't immediately modify the tree.
	 * Instead, it schedules operations with the registry for batch processing.
	 * Call registry.flush() to apply all pending operations atomically.
	 *
	 * @param {Array<@ui5/fs/Resource>} resources - Array of Resource instances to upsert
	 * @param {number} newIndexTimestamp Timestamp at which the provided resources have been indexed
	 * @returns {Promise<undefined>} Returns undefined; results available via registry.flush()
	 */
	async upsertResources(resources, newIndexTimestamp) {
		if (!resources || resources.length === 0) {
			return;
		}

		for (const resource of resources) {
			this.registry.scheduleUpsert(resource, newIndexTimestamp);
		}
	}

	/**
	 * Schedule resource removals to be applied during registry flush.
	 *
	 * Unlike base HashTree, this method doesn't immediately modify the tree.
	 * Instead, it schedules operations with the registry for batch processing.
	 * Call registry.flush() to apply all pending operations atomically.
	 *
	 * @param {Array<string>} resourcePaths - Array of resource paths to remove
	 * @returns {Promise<undefined>} Returns undefined; results available via registry.flush()
	 */
	async removeResources(resourcePaths) {
		if (!resourcePaths || resourcePaths.length === 0) {
			return;
		}

		for (const resourcePath of resourcePaths) {
			this.registry.scheduleRemoval(resourcePath);
		}
	}

	/**
	 * Create a derived shared tree that shares subtrees with this tree.
	 *
	 * The derived tree shares the same registry and will participate in
	 * coordinated batch updates. Changes to shared nodes propagate to all trees.
	 *
	 * @param {Array<ResourceMetadata>} additionalResources
	 *   Resources to add to the derived tree (in addition to shared resources from parent)
	 * @returns {SharedHashTree} New shared tree sharing subtrees and registry with this tree
	 */
	deriveTree(additionalResources = []) {
		// Shallow copy root to allow adding new top-level directories
		const derivedRoot = this._shallowCopyDirectory(this.root);

		// Create derived tree with shared root and same registry
		const derived = new SharedHashTree(additionalResources, this.registry, {
			_root: derivedRoot
		});

		return derived;
	}

	/**
	 * Deserialize tree from JSON
	 *
	 * @param {object} data
	 * @param {TreeRegistry} registry Required registry for coordinated batch updates across multiple trees
	 * @param {object} [options]
	 * @returns {HashTree}
	 */
	static fromCache(data, registry, options = {}) {
		if (data.version !== 1) {
			throw new Error(`Unsupported version: ${data.version}`);
		}

		const tree = new SharedHashTree(null, registry, options);
		tree.root = TreeNode.fromJSON(data.root);

		return tree;
	}
}

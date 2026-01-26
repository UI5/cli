import path from "node:path/posix";
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
			this.registry.scheduleUpsert(resource, newIndexTimestamp, this);
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

		// Register the derived tree with parent tree reference
		if (this.registry) {
			this.registry.register(derived, this);
		}

		return derived;
	}

	/**
	 * For a tree derived from a base tree, get the list of resource nodes
	 * that were added compared to the base tree.
	 *
	 * @param {HashTree} rootTree - The base tree to compare against
	 * @returns {Array<ResourceMetadata>}
	 * Array of added resource metadata
	 */
	getAddedResources(rootTree) {
		const added = [];

		const traverse = (node, currentPath, implicitlyAdded = false) => {
			if (implicitlyAdded) {
				// We're in a subtree that's entirely new - add all resources
				if (node.type === "resource") {
					added.push({
						path: currentPath,
						integrity: node.integrity,
						size: node.size,
						lastModified: node.lastModified,
						inode: node.inode
					});
				}
			} else {
				const baseNode = rootTree._findNode(currentPath);
				if (baseNode && baseNode === node) {
					// Node exists in base tree and is the same object (structural sharing)
					// Neither node nor children are added
					return;
				} else if (baseNode && node.type === "directory") {
					// Directory exists in both trees but may have been shallow-copied
					// Check children individually - only process children that differ
					for (const [name, child] of node.children) {
						const childPath = currentPath ? path.join(currentPath, name) : name;
						const baseChild = baseNode.children.get(name);

						if (!baseChild || baseChild !== child) {
							// Child doesn't exist in base or is different - determine if added
							if (!baseChild) {
								// Entirely new - all descendants are added
								traverse(child, childPath, true);
							} else {
								// Child was modified/replaced - recurse normally
								traverse(child, childPath, false);
							}
						}
						// If baseChild === child, skip it (shared)
					}
					return; // Don't continue with normal traversal
				} else if (!baseNode && node.type === "resource") {
					// Resource doesn't exist in base tree - it's added
					added.push({
						path: currentPath,
						integrity: node.integrity,
						size: node.size,
						lastModified: node.lastModified,
						inode: node.inode
					});
					return;
				} else if (!baseNode && node.type === "directory") {
					// Directory doesn't exist in base tree - all children are added
					implicitlyAdded = true;
				}
			}

			if (node.type === "directory") {
				for (const [name, child] of node.children) {
					const childPath = currentPath ? path.join(currentPath, name) : name;
					traverse(child, childPath, implicitlyAdded);
				}
			}
		};
		traverse(this.root, "/");
		return added;
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

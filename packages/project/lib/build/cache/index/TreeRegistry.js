import path from "node:path/posix";
import TreeNode from "./TreeNode.js";
import {matchResourceMetadataStrict} from "../utils.js";

/**
 * Registry for coordinating batch updates across multiple Merkle trees that share nodes by reference.
 *
 * When multiple trees (e.g., derived trees) share directory and resource nodes through structural sharing,
 * direct mutations would be visible to all trees simultaneously. The TreeRegistry provides a transaction-like
 * mechanism to batch and coordinate updates:
 *
 * 1. Changes are scheduled via scheduleUpsert() and scheduleRemoval() without immediately modifying trees
 * 2. During flush(), all pending operations are applied atomically across all registered trees
 * 3. Shared nodes are modified only once, with changes propagating to all trees that reference them
 * 4. Directory hashes are recomputed efficiently in a single bottom-up pass
 *
 * This approach ensures consistency when multiple trees represent filtered views of the same underlying data.
 *
 * @property {Set<import('./SharedHashTree.js').default>} trees - All registered HashTree/SharedHashTree instances
 * @property {Map<string, @ui5/fs/Resource>} pendingUpserts - Resource path to resource mappings for scheduled upserts
 * @property {Set<string>} pendingRemovals - Resource paths scheduled for removal
 */
export default class TreeRegistry {
	trees = new Set();
	pendingUpserts = new Map();
	pendingRemovals = new Set();
	pendingTimestampUpdate;

	/**
	 * Register a HashTree or SharedHashTree instance with this registry for coordinated updates.
	 *
	 * Once registered, the tree will participate in all batch operations triggered by flush().
	 * Multiple trees can share the same underlying nodes through structural sharing.
	 *
	 * @param {import('./SharedHashTree.js').default} tree - HashTree or SharedHashTree instance to register
	 */
	register(tree) {
		this.trees.add(tree);
	}

	/**
	 * Remove a HashTree or SharedHashTree instance from this registry.
	 *
	 * After unregistering, the tree will no longer participate in batch operations.
	 * Any pending operations scheduled before unregistration will still be applied during flush().
	 *
	 * @param {import('./SharedHashTree.js').default} tree - HashTree or SharedHashTree instance to unregister
	 */
	unregister(tree) {
		this.trees.delete(tree);
	}

	/**
	 * Schedule a resource upsert (insert or update) to be applied during flush().
	 *
	 * If a resource with the same path doesn't exist, it will be inserted (including creating
	 * any necessary parent directories). If it exists, its metadata will be updated if changed.
	 * Scheduling an upsert cancels any pending removal for the same resource path.
	 *
	 * @param {@ui5/fs/Resource} resource - Resource instance to upsert
	 * @param {number} newIndexTimestamp Timestamp at which the provided resources have been indexed
	 */
	scheduleUpsert(resource, newIndexTimestamp) {
		const resourcePath = resource.getOriginalPath();
		this.pendingUpserts.set(resourcePath, resource);
		// Cancel any pending removal for this path
		this.pendingRemovals.delete(resourcePath);
		this.pendingTimestampUpdate = newIndexTimestamp;
	}

	/**
	 * Schedule a resource removal to be applied during flush().
	 *
	 * The resource will be removed from all registered trees that contain it.
	 * Scheduling a removal cancels any pending upsert for the same resource path.
	 * Removals are processed before upserts during flush() to handle replacement scenarios.
	 *
	 * @param {string} resourcePath - POSIX-style path to the resource (e.g., "src/main.js")
	 */
	scheduleRemoval(resourcePath) {
		this.pendingRemovals.add(resourcePath);
		// Cancel any pending upsert for this path
		this.pendingUpserts.delete(resourcePath);
	}

	/**
	 * Apply all pending upserts and removals atomically across all registered trees.
	 *
	 * This method processes scheduled operations in three phases:
	 *
	 * Phase 1: Process removals
	 * - Delete resource nodes from all trees that contain them
	 * - Mark affected ancestor directories for hash recomputation
	 *
	 * Phase 2: Process upserts (inserts and updates)
	 * - Group operations by parent directory for efficiency
	 * - Create missing parent directories as needed
	 * - Insert new resources or update existing ones
	 * - Skip updates for resources with unchanged metadata
	 * - Track modified nodes to avoid duplicate updates to shared nodes
	 *
	 * Phase 3: Recompute directory hashes
	 * - Sort affected directories by depth (deepest first)
	 * - Recompute hashes bottom-up to root
	 * - Each shared node is updated once, visible to all trees
	 *
	 * After successful completion, all pending operations are cleared.
	 *
	 * @returns {Promise<{added: string[], updated: string[], unchanged: string[], removed: string[],
	 * treeStats: Map<import('./SharedHashTree.js').default,
	 * {added: string[], updated: string[], unchanged: string[], removed: string[]}>}>}
	 *          Object containing arrays of resource paths categorized by operation result,
	 *          plus per-tree statistics showing which resource paths were added/updated/unchanged/removed in each tree
	 */
	async flush() {
		if (this.pendingUpserts.size === 0 && this.pendingRemovals.size === 0) {
			return {
				added: [],
				updated: [],
				unchanged: [],
				removed: [],
				treeStats: new Map()
			};
		}

		// Track added, updated, unchanged, and removed resources
		const addedResources = [];
		const updatedResources = [];
		const unchangedResources = [];
		const removedResources = [];

		// Track per-tree statistics
		const treeStats = new Map();
		for (const tree of this.trees) {
			treeStats.set(tree, {added: [], updated: [], unchanged: [], removed: []});
		}

		// Track which resource nodes we've already modified to handle shared nodes
		const modifiedNodes = new Set();

		// Track all affected trees and the paths that need recomputation
		const affectedTrees = new Map(); // tree -> Set of directory paths needing recomputation

		// 1. Handle removals first
		for (const resourcePath of this.pendingRemovals) {
			const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);
			const resourceName = parts[parts.length - 1];
			const parentPath = parts.slice(0, -1).join(path.sep);

			// Track which trees have this resource before deletion (for shared nodes)
			const treesWithResource = [];
			for (const tree of this.trees) {
				const parentNode = tree._findNode(parentPath);
				if (parentNode && parentNode.type === "directory" && parentNode.children.has(resourceName)) {
					treesWithResource.push({tree, parentNode, pathNodes: this._getPathNodes(tree, parts)});
				}
			}

			// Perform deletion once and track for all trees that had it
			if (treesWithResource.length > 0) {
				const {parentNode} = treesWithResource[0];
				parentNode.children.delete(resourceName);

				// Clean up empty parent directories in all affected trees
				for (const {tree, pathNodes} of treesWithResource) {
					// Clean up empty parent directories bottom-up
					for (let i = parts.length - 1; i > 0; i--) {
						const currentDirNode = pathNodes[i];
						if (currentDirNode && currentDirNode.children.size === 0) {
							// Directory is empty, remove it from its parent
							const parentDirNode = pathNodes[i - 1];
							if (parentDirNode) {
								parentDirNode.children.delete(parts[i - 1]);
							}
						} else {
							// Directory still has children, stop cleanup for this tree
							break;
						}
					}

					if (!affectedTrees.has(tree)) {
						affectedTrees.set(tree, new Set());
					}

					// Mark ancestors for recomputation (only up to where directories still exist)
					for (let i = 0; i < parts.length; i++) {
						const ancestorPath = parts.slice(0, i).join(path.sep);
						if (tree._findNode(ancestorPath)) {
							affectedTrees.get(tree).add(ancestorPath);
						}
					}

					// Track per-tree removal
					treeStats.get(tree).removed.push(resourcePath);
				}

				if (!removedResources.includes(resourcePath)) {
					removedResources.push(resourcePath);
				}
			}
		}

		// 2. Handle upserts - group by directory
		const upsertsByDir = new Map(); // parentPath -> [{resourceName, resource, fullPath}]

		for (const [resourcePath, resource] of this.pendingUpserts) {
			const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);
			const resourceName = parts[parts.length - 1];
			const parentPath = parts.slice(0, -1).join(path.sep);

			if (!upsertsByDir.has(parentPath)) {
				upsertsByDir.set(parentPath, []);
			}
			upsertsByDir.get(parentPath).push({resourceName, resource, fullPath: resourcePath});
		}

		// Apply upserts
		for (const [parentPath, upserts] of upsertsByDir) {
			for (const tree of this.trees) {
				// Ensure parent directory exists
				let parentNode = tree._findNode(parentPath);
				if (!parentNode) {
					parentNode = this._ensureDirectoryPath(
						tree, parentPath.split(path.sep).filter((p) => p.length > 0));
				}

				if (parentNode.type !== "directory") {
					continue;
				}

				let dirModified = false;
				for (const upsert of upserts) {
					let resourceNode = parentNode.children.get(upsert.resourceName);

					if (!resourceNode) {
						// INSERT: Create new resource node
						resourceNode = new TreeNode(upsert.resourceName, "resource", {
							integrity: await upsert.resource.getIntegrity(),
							lastModified: upsert.resource.getLastModified(),
							size: await upsert.resource.getSize(),
							inode: upsert.resource.getInode()
						});
						parentNode.children.set(upsert.resourceName, resourceNode);
						modifiedNodes.add(resourceNode);
						dirModified = true;

						// Track per-tree addition
						treeStats.get(tree).added.push(upsert.fullPath);

						if (!addedResources.includes(upsert.fullPath)) {
							addedResources.push(upsert.fullPath);
						}
					} else if (resourceNode.type === "resource") {
						// UPDATE: Check if modified
						if (!modifiedNodes.has(resourceNode)) {
							const currentMetadata = {
								integrity: resourceNode.integrity,
								lastModified: resourceNode.lastModified,
								size: resourceNode.size,
								inode: resourceNode.inode
							};

							const isUnchanged = await matchResourceMetadataStrict(
								upsert.resource,
								currentMetadata,
								tree.getIndexTimestamp()
							);

							if (!isUnchanged) {
								resourceNode.integrity = await upsert.resource.getIntegrity();
								resourceNode.lastModified = upsert.resource.getLastModified();
								resourceNode.size = await upsert.resource.getSize();
								resourceNode.inode = upsert.resource.getInode();
								modifiedNodes.add(resourceNode);
								dirModified = true;

								// Track per-tree update
								treeStats.get(tree).updated.push(upsert.fullPath);

								if (!updatedResources.includes(upsert.fullPath)) {
									updatedResources.push(upsert.fullPath);
								}
							} else {
								// Track per-tree unchanged
								treeStats.get(tree).unchanged.push(upsert.fullPath);

								if (!unchangedResources.includes(upsert.fullPath)) {
									unchangedResources.push(upsert.fullPath);
								}
							}
						} else {
							// Node was already modified by another tree (shared node)
							// Still count it as an update for this tree since the change affects it
							treeStats.get(tree).updated.push(upsert.fullPath);
							dirModified = true;
						}
					}
				}

				if (dirModified) {
					// Compute hashes for modified/new resources
					for (const upsert of upserts) {
						const resourceNode = parentNode.children.get(upsert.resourceName);
						if (resourceNode && resourceNode.type === "resource" && modifiedNodes.has(resourceNode)) {
							tree._computeHash(resourceNode);
						}
					}

					if (!affectedTrees.has(tree)) {
						affectedTrees.set(tree, new Set());
					}

					tree._computeHash(parentNode);
					this._markAncestorsAffected(
						tree, parentPath.split(path.sep).filter((p) => p.length > 0), affectedTrees);
				}
			}
		}

		// Recompute ancestor hashes for all affected trees
		for (const [tree, affectedPaths] of affectedTrees) {
			// Sort paths by depth (deepest first) to recompute bottom-up
			const sortedPaths = Array.from(affectedPaths).sort((a, b) => {
				const depthA = a ? a.split(path.sep).length : 0;
				const depthB = b ? b.split(path.sep).length : 0;
				if (depthA !== depthB) return depthB - depthA; // deeper first
				return a.localeCompare(b);
			});

			for (const dirPath of sortedPaths) {
				const node = tree._findNode(dirPath);
				if (node && node.type === "directory") {
					tree._computeHash(node);
				}
			}
			if (this.pendingTimestampUpdate) {
				tree.setIndexTimestamp(this.pendingTimestampUpdate);
			}
		}

		// Clear all pending operations
		this.pendingUpserts.clear();
		this.pendingRemovals.clear();
		this.pendingTimestampUpdate = null;

		return {
			added: addedResources,
			updated: updatedResources,
			unchanged: unchangedResources,
			removed: removedResources,
			treeStats
		};
	}

	/**
	 * Get all nodes along a path from root to the target.
	 *
	 * Returns an array of TreeNode objects representing the full path,
	 * starting with root at index 0 and ending with the target node.
	 *
	 * @param {import('./SharedHashTree.js').default} tree - Tree to traverse
	 * @param {string[]} pathParts - Path components to follow
	 * @returns {Array<TreeNode>} Array of TreeNode objects along the path
	 */
	_getPathNodes(tree, pathParts) {
		const nodes = [tree.root];
		let current = tree.root;

		for (let i = 0; i < pathParts.length - 1; i++) {
			if (!current.children.has(pathParts[i])) {
				break;
			}
			current = current.children.get(pathParts[i]);
			nodes.push(current);
		}

		return nodes;
	}

	/**
	 * Mark all ancestor directories in a tree as requiring hash recomputation.
	 *
	 * When a resource or directory is modified, all ancestor directories up to the root
	 * need their hashes recomputed to reflect the change. This method tracks those paths
	 * in the affectedTrees map for later batch processing.
	 *
	 * @param {import('./SharedHashTree.js').default} tree - Tree containing the affected path
	 * @param {string[]} pathParts - Path components of the modified resource/directory
	 * @param {Map<import('./SharedHashTree.js').default, Set<string>>} affectedTrees
	 * 	 Map tracking affected paths per tree
	 */
	_markAncestorsAffected(tree, pathParts, affectedTrees) {
		if (!affectedTrees.has(tree)) {
			affectedTrees.set(tree, new Set());
		}

		for (let i = 0; i <= pathParts.length; i++) {
			affectedTrees.get(tree).add(pathParts.slice(0, i).join(path.sep));
		}
	}

	/**
	 * Ensure a directory path exists in a tree, creating missing directories as needed.
	 *
	 * This method walks down the path from root, creating any missing directory nodes.
	 * It's used during upsert operations to automatically create parent directories
	 * when inserting resources into paths that don't yet exist.
	 *
	 * @param {import('./SharedHashTree.js').default} tree - Tree to create directory path in
	 * @param {string[]} pathParts - Path components of the directory to ensure exists
	 * @returns {TreeNode} The directory node at the end of the path
	 */
	_ensureDirectoryPath(tree, pathParts) {
		let current = tree.root;

		for (const part of pathParts) {
			if (!current.children.has(part)) {
				const dirNode = new TreeNode(part, "directory");
				current.children.set(part, dirNode);
			}
			current = current.children.get(part);
		}

		return current;
	}

	/**
	 * Get the number of HashTree instances currently registered with this registry.
	 *
	 * @returns {number} Count of registered trees
	 */
	getTreeCount() {
		return this.trees.size;
	}

	/**
	 * Get the total number of pending operations (upserts + removals) waiting to be applied.
	 *
	 * @returns {number} Count of pending upserts and removals combined
	 */
	getPendingUpdateCount() {
		return this.pendingUpserts.size + this.pendingRemovals.size;
	}

	/**
	 * Check if there are any pending operations waiting to be applied.
	 *
	 * @returns {boolean} True if there are pending upserts or removals, false otherwise
	 */
	hasPendingUpdates() {
		return this.pendingUpserts.size > 0 || this.pendingRemovals.size > 0;
	}
}

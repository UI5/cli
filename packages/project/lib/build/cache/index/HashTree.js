import crypto from "node:crypto";
import path from "node:path/posix";
import {matchResourceMetadataStrict} from "../utils.js";

/**
 * @typedef {object} @ui5/project/build/cache/index/HashTree~ResourceMetadata
 * @property {number} size - File size in bytes
 * @property {number} lastModified - Last modification timestamp
 * @property {number|undefined} inode - File inode identifier
 * @property {string} integrity - Content hash
 */

/**
 * Represents a node in the directory-based Merkle tree
 */
class TreeNode {
	constructor(name, type, options = {}) {
		this.name = name; // resource name or directory name
		this.type = type; // 'resource' | 'directory'
		this.hash = options.hash || null; // Buffer

		// Resource node properties
		this.integrity = options.integrity; // Resource content hash
		this.lastModified = options.lastModified; // Last modified timestamp
		this.size = options.size; // File size in bytes
		this.inode = options.inode; // File system inode number

		// Directory node properties
		this.children = options.children || new Map(); // name -> TreeNode
	}

	/**
	 * Get full path from root to this node
	 *
	 * @param {string} parentPath
	 * @returns {string}
	 */
	getPath(parentPath = "") {
		return parentPath ? path.join(parentPath, this.name) : this.name;
	}

	/**
	 * Serialize to JSON
	 *
	 * @returns {object}
	 */
	toJSON() {
		const obj = {
			name: this.name,
			type: this.type,
			hash: this.hash ? this.hash.toString("hex") : null
		};

		if (this.type === "resource") {
			obj.integrity = this.integrity;
			obj.lastModified = this.lastModified;
			obj.size = this.size;
			obj.inode = this.inode;
		} else {
			obj.children = {};
			for (const [name, child] of this.children) {
				obj.children[name] = child.toJSON();
			}
		}

		return obj;
	}

	/**
	 * Deserialize from JSON
	 *
	 * @param {object} data
	 * @returns {TreeNode}
	 */
	static fromJSON(data) {
		const options = {
			hash: data.hash ? Buffer.from(data.hash, "hex") : null,
			integrity: data.integrity,
			lastModified: data.lastModified,
			size: data.size,
			inode: data.inode
		};

		if (data.type === "directory" && data.children) {
			options.children = new Map();
			for (const [name, childData] of Object.entries(data.children)) {
				options.children.set(name, TreeNode.fromJSON(childData));
			}
		}

		return new TreeNode(data.name, data.type, options);
	}

	/**
	 * Create a deep copy of this node
	 *
	 * @returns {TreeNode}
	 */
	clone() {
		const options = {
			hash: this.hash ? Buffer.from(this.hash) : null,
			integrity: this.integrity,
			lastModified: this.lastModified,
			size: this.size,
			inode: this.inode
		};

		if (this.type === "directory") {
			options.children = new Map();
			for (const [name, child] of this.children) {
				options.children.set(name, child.clone());
			}
		}

		return new TreeNode(this.name, this.type, options);
	}
}

/**
 * Directory-based Merkle Tree for efficient resource tracking with hierarchical structure.
 *
 * Computes deterministic SHA256 hashes for resources and directories, enabling:
 * - Fast change detection via root hash comparison
 * - Structural sharing through derived trees (memory efficient)
 * - Coordinated multi-tree updates via TreeRegistry
 * - Batch upsert and removal operations
 *
 * Primary use case: Build caching systems where multiple related resource trees
 * (e.g., source files, build artifacts) need to be tracked and synchronized efficiently.
 */
export default class HashTree {
	#indexTimestamp;
	/**
	 * Create a new HashTree
	 *
	 * @param {Array<ResourceMetadata>|null} resources
	 *   Initial resources to populate the tree. Each resource should have a path and optional metadata.
	 * @param {object} options
	 * @param {TreeRegistry} [options.registry] - Optional registry for coordinated batch updates across multiple trees
	 * @param {number} [options.indexTimestamp] - Timestamp when the resource index was created (for metadata comparison)
	 * @param {TreeNode} [options._root] - Internal: pre-existing root node for derived trees (enables structural sharing)
	 */
	constructor(resources = null, options = {}) {
		this.registry = options.registry || null;
		this.root = options._root || new TreeNode("", "directory");
		this.#indexTimestamp = options.indexTimestamp || Date.now();

		// Register with registry if provided
		if (this.registry) {
			this.registry.register(this);
		}

		if (resources && !options._root) {
			this._buildTree(resources);
		} else if (resources && options._root) {
			// Derived tree: insert additional resources into shared structure
			for (const resource of resources) {
				this._insertResourceWithSharing(resource.path, resource);
			}
			// Recompute hashes for newly added paths
			this._computeHash(this.root);
		}
	}

	/**
	 * Shallow copy a directory node (copies node, shares children)
	 *
	 * @param {TreeNode} dirNode
	 * @returns {TreeNode}
	 * @private
	 */
	_shallowCopyDirectory(dirNode) {
		if (dirNode.type !== "directory") {
			throw new Error("Can only shallow copy directory nodes");
		}

		const copy = new TreeNode(dirNode.name, "directory", {
			hash: dirNode.hash ? Buffer.from(dirNode.hash) : null,
			children: new Map(dirNode.children) // Shallow copy of Map (shares TreeNode references)
		});

		return copy;
	}

	/**
	 * Build tree from resource list
	 *
	 * @param {Array<{path: string, integrity?: string}>} resources
	 * @private
	 */
	_buildTree(resources) {
		// Sort resources by path for deterministic ordering
		const sortedResources = [...resources].sort((a, b) => a.path.localeCompare(b.path));

		// Insert each resource into the tree
		for (const resource of sortedResources) {
			this._insertResource(resource.path, resource);
		}

		// Compute all hashes bottom-up
		this._computeHash(this.root);
	}

	/**
	 * Insert a resource with structural sharing for derived trees
	 * Implements copy-on-write: only copies directories that will be modified
	 *
	 * Key optimization: When adding "a/b/c/file.js", only copies:
	 * - Directory "c" (will get new child)
	 * Directories "a" and "b" remain shared references if they existed.
	 *
	 * This preserves memory efficiency when derived trees have different
	 * resources in some paths but share others.
	 *
	 * @param {string} resourcePath
	 * @param {object} resourceData
	 * @private
	 */
	_insertResourceWithSharing(resourcePath, resourceData) {
		const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);
		let current = this.root;
		const pathToCopy = []; // Track path that needs copy-on-write

		// Phase 1: Navigate to find where we need to start copying
		for (let i = 0; i < parts.length - 1; i++) {
			const dirName = parts[i];

			if (!current.children.has(dirName)) {
				// New directory needed - we'll create from here
				break;
			}

			const existing = current.children.get(dirName);
			if (existing.type !== "directory") {
				throw new Error(`Path conflict: ${dirName} exists as resource but expected directory`);
			}

			pathToCopy.push({parent: current, dirName, node: existing});
			current = existing;
		}

		// Phase 2: Copy path from root down (copy-on-write)
		// Only copy directories that will have their children modified
		current = this.root;
		let needsNewChild = false;

		for (let i = 0; i < parts.length - 1; i++) {
			const dirName = parts[i];

			if (!current.children.has(dirName)) {
				// Create new directory from here
				const newDir = new TreeNode(dirName, "directory");
				current.children.set(dirName, newDir);
				current = newDir;
				needsNewChild = true;
			} else if (i === parts.length - 2) {
				// This is the parent directory that will get the new resource
				// Copy it to avoid modifying shared structure
				const existing = current.children.get(dirName);
				const copiedDir = this._shallowCopyDirectory(existing);
				current.children.set(dirName, copiedDir);
				current = copiedDir;
			} else {
				// Just traverse - don't copy intermediate directories
				// They remain shared with the source tree (structural sharing)
				current = current.children.get(dirName);
			}
		}

		// Insert the resource
		const resourceName = parts[parts.length - 1];

		if (current.children.has(resourceName)) {
			throw new Error(`Duplicate resource path: ${resourcePath}`);
		}

		const resourceNode = new TreeNode(resourceName, "resource", {
			integrity: resourceData.integrity,
			lastModified: resourceData.lastModified,
			size: resourceData.size,
			inode: resourceData.inode
		});

		current.children.set(resourceName, resourceNode);
	}

	/**
	 * Insert a resource into the directory tree
	 *
	 * @param {string} resourcePath
	 * @param {object} resourceData
	 * @param {string} [resourceData.integrity] - Content hash for regular resources
	 * @param {number} [resourceData.lastModified] - Last modified timestamp
	 * @param {number} [resourceData.size] - File size in bytes
	 * @param {number} [resourceData.inode] - File system inode number
	 * @private
	 */
	_insertResource(resourcePath, resourceData) {
		const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);
		let current = this.root;

		// Navigate/create directory structure
		for (let i = 0; i < parts.length - 1; i++) {
			const dirName = parts[i];

			if (!current.children.has(dirName)) {
				current.children.set(dirName, new TreeNode(dirName, "directory"));
			}

			current = current.children.get(dirName);

			if (current.type !== "directory") {
				throw new Error(`Path conflict: ${dirName} exists as resource but expected directory`);
			}
		}

		// Insert the resource
		const resourceName = parts[parts.length - 1];

		if (current.children.has(resourceName)) {
			throw new Error(`Duplicate resource path: ${resourcePath}`);
		}

		const resourceNode = new TreeNode(resourceName, "resource", {
			integrity: resourceData.integrity,
			lastModified: resourceData.lastModified,
			size: resourceData.size,
			inode: resourceData.inode
		});

		current.children.set(resourceName, resourceNode);
	}

	/**
	 * Compute hash for a node and all its children (recursive)
	 *
	 * @param {TreeNode} node
	 * @returns {Buffer}
	 * @private
	 */
	_computeHash(node) {
		if (node.type === "resource") {
			// Resource hash
			node.hash = this._hashData(`resource:${node.name}:${node.integrity}`);
		} else {
			// Directory hash - compute from sorted children
			const childHashes = [];

			// Sort children by name for deterministic ordering
			const sortedChildren = Array.from(node.children.entries())
				.sort((a, b) => a[0].localeCompare(b[0]));

			for (const [, child] of sortedChildren) {
				this._computeHash(child); // Recursively compute child hashes
				childHashes.push(child.hash);
			}

			// Combine all child hashes
			if (childHashes.length === 0) {
				// Empty directory
				node.hash = this._hashData(`dir:${node.name}:empty`);
			} else {
				const combined = Buffer.concat(childHashes);
				node.hash = crypto.createHash("sha256")
					.update(`dir:${node.name}:`)
					.update(combined)
					.digest();
			}
		}

		return node.hash;
	}

	/**
	 * Hash a string
	 *
	 * @param {string} data
	 * @returns {Buffer}
	 * @private
	 */
	_hashData(data) {
		return crypto.createHash("sha256").update(data).digest();
	}

	/**
	 * Get the root hash as a hex string
	 *
	 * @returns {string}
	 */
	getRootHash() {
		if (!this.root.hash) {
			this._computeHash(this.root);
		}
		return this.root.hash.toString("hex");
	}

	/**
	 * Get the index timestamp
	 *
	 * @returns {number}
	 */
	getIndexTimestamp() {
		return this.#indexTimestamp;
	}

	/**
	 * Find a node by path
	 *
	 * @param {string} resourcePath
	 * @returns {TreeNode|null}
	 * @private
	 */
	_findNode(resourcePath) {
		if (!resourcePath || resourcePath === "" || resourcePath === ".") {
			return this.root;
		}

		const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);
		let current = this.root;

		for (const part of parts) {
			if (!current.children.has(part)) {
				return null;
			}
			current = current.children.get(part);
		}

		return current;
	}

	/**
	 * Create a derived tree that shares subtrees with this tree.
	 *
	 * Derived trees are filtered views on shared data - they share node references with the parent tree,
	 * enabling efficient memory usage. Changes propagate through the TreeRegistry to all derived trees.
	 *
	 * Use case: Represent different resource sets (e.g., debug vs. production builds) that share common files.
	 *
	 * @param {Array<ResourceMetadata>} additionalResources
	 *   Resources to add to the derived tree (in addition to shared resources from parent)
	 * @returns {HashTree} New tree sharing subtrees with this tree
	 */
	deriveTree(additionalResources = []) {
		// Shallow copy root to allow adding new top-level directories
		const derivedRoot = this._shallowCopyDirectory(this.root);

		// Create derived tree with shared root and same registry
		const derived = new HashTree(additionalResources, {
			registry: this.registry,
			_root: derivedRoot
		});

		return derived;
	}

	/**
	 * Update a single resource and recompute affected hashes.
	 *
	 * When a registry is attached, schedules the update for batch processing.
	 * Otherwise, applies the update immediately and recomputes ancestor hashes.
	 * Skips update if resource metadata hasn't changed (optimization).
	 *
	 * @param {@ui5/fs/Resource} resource - Resource instance to update
	 * @returns {Promise<Array<string>>} Array containing the resource path if changed, empty array if unchanged
	 */
	async updateResource(resource) {
		const resourcePath = resource.getOriginalPath();

		// If registry is attached, schedule update instead of applying immediately
		if (this.registry) {
			this.registry.scheduleUpdate(resource);
			return [resourcePath]; // Will be determined after flush
		}

		// Fall back to immediate update
		const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);

		if (parts.length === 0) {
			throw new Error("Cannot update root directory");
		}

		// Navigate to parent directory
		let current = this.root;
		const pathToRoot = [current];

		for (let i = 0; i < parts.length - 1; i++) {
			const dirName = parts[i];

			if (!current.children.has(dirName)) {
				throw new Error(`Directory not found: ${parts.slice(0, i + 1).join("/")}`);
			}

			current = current.children.get(dirName);
			pathToRoot.push(current);
		}

		// Update the resource
		const resourceName = parts[parts.length - 1];
		const resourceNode = current.children.get(resourceName);

		if (!resourceNode) {
			throw new Error(`Resource not found: ${resourcePath}`);
		}

		if (resourceNode.type !== "resource") {
			throw new Error(`Path is not a resource: ${resourcePath}`);
		}

		// Create metadata object from current node state
		const currentMetadata = {
			integrity: resourceNode.integrity,
			lastModified: resourceNode.lastModified,
			size: resourceNode.size,
			inode: resourceNode.inode
		};

		// Check whether resource actually changed
		const isUnchanged = await matchResourceMetadataStrict(resource, currentMetadata, this.#indexTimestamp);
		if (isUnchanged) {
			return []; // No change
		}

		// Update resource metadata
		resourceNode.integrity = await resource.getIntegrity();
		resourceNode.lastModified = resource.getLastModified();
		resourceNode.size = await resource.getSize();
		resourceNode.inode = resource.getInode();

		// Recompute hashes from resource up to root
		this._computeHash(resourceNode);

		for (let i = pathToRoot.length - 1; i >= 0; i--) {
			this._computeHash(pathToRoot[i]);
		}

		return [resourcePath];
	}

	/**
	 * Update multiple resources efficiently.
	 *
	 * When a registry is attached, schedules updates for batch processing.
	 * Otherwise, updates all resources immediately, collecting affected directories
	 * and recomputing hashes bottom-up for optimal performance.
	 *
	 * Skips resources whose metadata hasn't changed (optimization).
	 *
	 * @param {Array<@ui5/fs/Resource>} resources - Array of Resource instances to update
	 * @returns {Promise<Array<string>>} Paths of resources that actually changed
	 */
	async updateResources(resources) {
		if (!resources || resources.length === 0) {
			return [];
		}

		const changedResources = [];
		const affectedPaths = new Set();

		// Update all resources and collect affected directory paths
		for (const resource of resources) {
			const resourcePath = resource.getOriginalPath();
			const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);

			// Find the resource node
			const node = this._findNode(resourcePath);
			if (!node || node.type !== "resource") {
				throw new Error(`Resource not found: ${resourcePath}`);
			}

			// Create metadata object from current node state
			const currentMetadata = {
				integrity: node.integrity,
				lastModified: node.lastModified,
				size: node.size,
				inode: node.inode
			};

			// Check whether resource actually changed
			const isUnchanged = await matchResourceMetadataStrict(resource, currentMetadata, this.#indexTimestamp);
			if (isUnchanged) {
				continue; // Skip unchanged resources
			}

			// Update resource metadata
			node.integrity = await resource.getIntegrity();
			node.lastModified = resource.getLastModified();
			node.size = await resource.getSize();
			node.inode = resource.getInode();
			changedResources.push(resourcePath);

			// Recompute resource hash
			this._computeHash(node);

			// Mark all ancestor directories as needing recomputation
			for (let i = 0; i < parts.length; i++) {
				affectedPaths.add(parts.slice(0, i).join(path.sep));
			}
		}

		// Recompute directory hashes bottom-up
		const sortedPaths = Array.from(affectedPaths).sort((a, b) => {
			// Sort by depth (deeper first) and then alphabetically
			const depthA = a.split(path.sep).length;
			const depthB = b.split(path.sep).length;
			if (depthA !== depthB) return depthB - depthA;
			return a.localeCompare(b);
		});

		for (const dirPath of sortedPaths) {
			const node = this._findNode(dirPath);
			if (node && node.type === "directory") {
				this._computeHash(node);
			}
		}

		return changedResources;
	}

	/**
	 * Upsert multiple resources (insert if new, update if exists).
	 *
	 * Intelligently determines whether each resource is new (insert) or existing (update).
	 * When a registry is attached, schedules operations for batch processing.
	 * Otherwise, applies operations immediately with optimized hash recomputation.
	 *
	 * Automatically creates missing parent directories during insertion.
	 * Skips resources whose metadata hasn't changed (optimization).
	 *
	 * @param {Array<@ui5/fs/Resource>} resources - Array of Resource instances to upsert
	 * @returns {Promise<{added: Array<string>, updated: Array<string>, unchanged: Array<string>}|undefined>}
	 *   Status report: arrays of paths by operation type.
	 * Undefined if using registry (results determined during flush).
	 */
	async upsertResources(resources) {
		if (!resources || resources.length === 0) {
			return {added: [], updated: [], unchanged: []};
		}

		if (this.registry) {
			for (const resource of resources) {
				this.registry.scheduleUpsert(resource);
			}
			// When using registry, actual results are determined during flush
			return;
		}

		// Immediate mode
		const added = [];
		const updated = [];
		const unchanged = [];
		const affectedPaths = new Set();

		for (const resource of resources) {
			const resourcePath = resource.getOriginalPath();
			const existingNode = this.getResourceByPath(resourcePath);

			if (!existingNode) {
				// Insert new resource
				const resourceData = {
					integrity: await resource.getIntegrity(),
					lastModified: resource.getLastModified(),
					size: await resource.getSize(),
					inode: resource.getInode()
				};
				this._insertResource(resourcePath, resourceData);

				const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);
				const resourceNode = this._findNode(resourcePath);
				this._computeHash(resourceNode);

				added.push(resourcePath);

				// Mark ancestors for recomputation
				for (let i = 0; i < parts.length; i++) {
					affectedPaths.add(parts.slice(0, i).join(path.sep));
				}
			} else {
				// Check if unchanged
				const currentMetadata = {
					integrity: existingNode.integrity,
					lastModified: existingNode.lastModified,
					size: existingNode.size,
					inode: existingNode.inode
				};

				const isUnchanged = await matchResourceMetadataStrict(resource, currentMetadata, this.#indexTimestamp);
				if (isUnchanged) {
					unchanged.push(resourcePath);
					continue;
				}

				// Update existing resource
				existingNode.integrity = await resource.getIntegrity();
				existingNode.lastModified = resource.getLastModified();
				existingNode.size = await resource.getSize();
				existingNode.inode = resource.getInode();

				this._computeHash(existingNode);
				updated.push(resourcePath);

				// Mark ancestors for recomputation
				const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);
				for (let i = 0; i < parts.length; i++) {
					affectedPaths.add(parts.slice(0, i).join(path.sep));
				}
			}
		}

		// Recompute directory hashes bottom-up
		const sortedPaths = Array.from(affectedPaths).sort((a, b) => {
			const depthA = a ? a.split(path.sep).length : 0;
			const depthB = b ? b.split(path.sep).length : 0;
			if (depthA !== depthB) return depthB - depthA;
			return a.localeCompare(b);
		});

		for (const dirPath of sortedPaths) {
			const node = this._findNode(dirPath);
			if (node && node.type === "directory") {
				this._computeHash(node);
			}
		}

		return {added, updated, unchanged};
	}

	/**
	 * Remove multiple resources efficiently.
	 *
	 * When a registry is attached, schedules removals for batch processing.
	 * Otherwise, removes resources immediately and recomputes affected ancestor hashes.
	 *
	 * Note: When using a registry with derived trees, removals propagate to all trees
	 * sharing the affected directories (intentional for the shared view model).
	 *
	 * @param {Array<string>} resourcePaths - Array of resource paths to remove
	 * @returns {Promise<{removed: Array<string>, notFound: Array<string>}|undefined>}
	 *   Status report: 'removed' contains successfully removed paths, 'notFound' contains paths that didn't exist.
	 *   Undefined if using registry (results determined during flush).
	 */
	async removeResources(resourcePaths) {
		if (!resourcePaths || resourcePaths.length === 0) {
			return {removed: [], notFound: []};
		}

		if (this.registry) {
			for (const resourcePath of resourcePaths) {
				this.registry.scheduleRemoval(resourcePath);
			}
			return;
		}

		// Immediate mode
		const removed = [];
		const notFound = [];
		const affectedPaths = new Set();

		for (const resourcePath of resourcePaths) {
			const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);

			if (parts.length === 0) {
				throw new Error("Cannot remove root");
			}

			// Navigate to parent
			let current = this.root;
			let pathExists = true;
			for (let i = 0; i < parts.length - 1; i++) {
				if (!current.children.has(parts[i])) {
					pathExists = false;
					break;
				}
				current = current.children.get(parts[i]);
			}

			if (!pathExists) {
				notFound.push(resourcePath);
				continue;
			}

			// Remove resource
			const resourceName = parts[parts.length - 1];
			const wasRemoved = current.children.delete(resourceName);

			if (wasRemoved) {
				removed.push(resourcePath);
				// Mark ancestors for recomputation
				for (let i = 0; i < parts.length; i++) {
					affectedPaths.add(parts.slice(0, i).join(path.sep));
				}
			} else {
				notFound.push(resourcePath);
			}
		}

		// Recompute directory hashes bottom-up
		const sortedPaths = Array.from(affectedPaths).sort((a, b) => {
			const depthA = a ? a.split(path.sep).length : 0;
			const depthB = b ? b.split(path.sep).length : 0;
			if (depthA !== depthB) return depthB - depthA;
			return a.localeCompare(b);
		});

		for (const dirPath of sortedPaths) {
			const node = this._findNode(dirPath);
			if (node && node.type === "directory") {
				this._computeHash(node);
			}
		}

		return {removed, notFound};
	}

	/**
	 * Recompute hashes for all ancestor directories up to root.
	 *
	 * Used after modifications to ensure the entire path from the modified
	 * resource/directory up to the root has correct hash values.
	 *
	 * @param {string} resourcePath - Path to resource or directory that was modified
	 * @private
	 */
	_recomputeAncestorHashes(resourcePath) {
		const parts = resourcePath.split(path.sep).filter((p) => p.length > 0);

		// Recompute from deepest to root
		for (let i = parts.length; i >= 0; i--) {
			const dirPath = parts.slice(0, i).join(path.sep);
			const node = this._findNode(dirPath);
			if (node && node.type === "directory") {
				this._computeHash(node);
			}
		}
	}

	/**
	 * Get hash for a specific directory.
	 *
	 * Useful for checking if a specific subtree has changed without comparing the entire tree.
	 *
	 * @param {string} dirPath - Path to directory
	 * @returns {string} Directory hash as hex string
	 * @throws {Error} If path not found or path is not a directory
	 */
	getDirectoryHash(dirPath) {
		const node = this._findNode(dirPath);
		if (!node) {
			throw new Error(`Path not found: ${dirPath}`);
		}
		if (node.type !== "directory") {
			throw new Error(`Path is not a directory: ${dirPath}`);
		}
		return node.hash.toString("hex");
	}

	/**
	 * Check if a directory's contents have changed by comparing hashes.
	 *
	 * Efficient way to detect changes in a subtree without comparing individual files.
	 *
	 * @param {string} dirPath - Path to directory
	 * @param {string} previousHash - Previous hash to compare against
	 * @returns {boolean} true if directory contents changed, false otherwise
	 */
	hasDirectoryChanged(dirPath, previousHash) {
		const currentHash = this.getDirectoryHash(dirPath);
		return currentHash !== previousHash;
	}

	/**
	 * Get all resources in a directory (non-recursive).
	 *
	 * Useful for inspecting directory contents or performing directory-level operations.
	 *
	 * @param {string} dirPath - Path to directory
	 * @returns {Array<{name: string, path: string, type: string, hash: string}>} Array of directory entries sorted by name
	 * @throws {Error} If directory not found or path is not a directory
	 */
	listDirectory(dirPath) {
		const node = this._findNode(dirPath);
		if (!node) {
			throw new Error(`Directory not found: ${dirPath}`);
		}
		if (node.type !== "directory") {
			throw new Error(`Path is not a directory: ${dirPath}`);
		}

		const items = [];
		for (const [name, child] of node.children) {
			items.push({
				name,
				path: path.join(dirPath, name),
				type: child.type,
				hash: child.hash.toString("hex")
			});
		}

		return items.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Get all resources recursively.
	 *
	 * Returns complete resource metadata including paths, integrity hashes, and file stats.
	 * Useful for full tree inspection or export.
	 *
	 * @returns {Array<{path: string, integrity?: string, hash: string, lastModified?: number, size?: number, inode?: number}>}
	 *   Array of all resources with metadata, sorted by path
	 */
	getAllResources() {
		const resources = [];

		const traverse = (node, currentPath) => {
			if (node.type === "resource") {
				resources.push({
					path: currentPath,
					integrity: node.integrity,
					hash: node.hash.toString("hex"),
					lastModified: node.lastModified,
					size: node.size,
					inode: node.inode
				});
			} else {
				for (const [name, child] of node.children) {
					const childPath = currentPath ? path.join(currentPath, name) : name;
					traverse(child, childPath);
				}
			}
		};

		traverse(this.root, "/");
		return resources.sort((a, b) => a.path.localeCompare(b.path));
	}

	/**
	 * Get tree statistics.
	 *
	 * Provides summary information about tree size and structure.
	 *
	 * @returns {{resources: number, directories: number, maxDepth: number, rootHash: string}}
	 *   Statistics object with counts and root hash
	 */
	getStats() {
		let resourceCount = 0;
		let dirCount = 0;
		let maxDepth = 0;

		const traverse = (node, depth) => {
			maxDepth = Math.max(maxDepth, depth);

			if (node.type === "resource") {
				resourceCount++;
			} else {
				dirCount++;
				for (const child of node.children.values()) {
					traverse(child, depth + 1);
				}
			}
		};

		traverse(this.root, 0);

		return {
			resources: resourceCount,
			directories: dirCount,
			maxDepth,
			rootHash: this.getRootHash()
		};
	}

	/**
	 * Serialize tree to JSON
	 *
	 * @returns {object}
	 */
	toCacheObject() {
		return {
			version: 1,
			root: this.root.toJSON(),
		};
	}

	/**
	 * Deserialize tree from JSON
	 *
	 * @param {object} data
	 * @param {object} [options]
	 * @returns {HashTree}
	 */
	static fromCache(data, options = {}) {
		if (data.version !== 1) {
			throw new Error(`Unsupported version: ${data.version}`);
		}

		const tree = new HashTree(null, options);
		tree.root = TreeNode.fromJSON(data.root);

		return tree;
	}

	/**
	 * Validate tree structure and hashes
	 *
	 * @returns {boolean}
	 */
	validate() {
		const errors = [];

		const validateNode = (node, currentPath) => {
			// Recompute hash
			const originalHash = node.hash;
			this._computeHash(node);

			if (!originalHash.equals(node.hash)) {
				errors.push(`Hash mismatch at ${currentPath || "root"}`);
			}

			// Restore original (in case validation is non-destructive)
			node.hash = originalHash;

			// Recurse for directories
			if (node.type === "directory") {
				for (const [name, child] of node.children) {
					const childPath = currentPath ? path.join(currentPath, name) : name;
					validateNode(child, childPath);
				}
			}
		};

		validateNode(this.root, "");

		if (errors.length > 0) {
			throw new Error(`Validation failed:\n${errors.join("\n")}`);
		}

		return true;
	}
	/**
	 * Create a deep clone of this tree.
	 *
	 * Unlike deriveTree(), this creates a completely independent copy
	 * with no shared node references.
	 *
	 * @returns {HashTree} New independent tree instance
	 */
	clone() {
		const cloned = new HashTree();
		cloned.root = this.root.clone();
		return cloned;
	}

	/**
	 * Get resource node by path
	 *
	 * @param {string} resourcePath
	 * @returns {TreeNode|null}
	 */
	getResourceByPath(resourcePath) {
		const node = this._findNode(resourcePath);
		return node && node.type === "resource" ? node : null;
	}

	/**
	 * Check if a path exists in the tree
	 *
	 * @param {string} resourcePath
	 * @returns {boolean}
	 */
	hasPath(resourcePath) {
		return this._findNode(resourcePath) !== null;
	}

	/**
	 * Get all resource paths in sorted order
	 *
	 * @returns {Array<string>}
	 */
	getResourcePaths() {
		const paths = [];

		const traverse = (node, currentPath) => {
			if (node.type === "resource") {
				paths.push(currentPath);
			} else {
				for (const [name, child] of node.children) {
					const childPath = currentPath ? path.join(currentPath, name) : name;
					traverse(child, childPath);
				}
			}
		};

		traverse(this.root, "/");
		return paths.sort();
	}

	/**
	 * For a tree derived from a base tree, get the list of resource nodes
	 * that were added compared to the base tree.
	 *
	 * @param {HashTree} rootTree - The base tree to compare against
	 * @returns {Array<TreeNode>} Array of added resource nodes
	 */
	getAddedResources(rootTree) {
		const added = [];

		const traverse = (node, currentPath, implicitlyAdded = false) => {
			if (implicitlyAdded) {
				if (node.type === "resource") {
					added.push(node);
				}
			} else {
				const baseNode = rootTree._findNode(currentPath);
				if (baseNode && baseNode === node) {
					// Node exists in base tree and is the same (structural sharing)
					// Neither node nor children are added
					return;
				} else {
					// Node doesn't exist in base tree - it's added
					if (node.type === "resource") {
						added.push(node);
					} else {
						// Directory - all children are added
						implicitlyAdded = true;
					}
				}
			}

			if (node.type === "directory") {
				for (const [name, child] of node.children) {
					const childPath = currentPath ? path.join(currentPath, name) : name;
					traverse(child, childPath, implicitlyAdded);
				}
			}
		};

		traverse(this.root, "");
		return added;
	}
}

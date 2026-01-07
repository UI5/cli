import micromatch from "micromatch";
import {getLogger} from "@ui5/logger";
import ResourceRequestGraph, {Request} from "./ResourceRequestGraph.js";
import ResourceIndex from "./index/ResourceIndex.js";
import TreeRegistry from "./index/TreeRegistry.js";
const log = getLogger("build:cache:BuildTaskCache");

/**
 * @typedef {object} @ui5/project/build/cache/BuildTaskCache~ResourceRequests
 * @property {Set<string>} paths - Specific resource paths that were accessed
 * @property {Set<string>} patterns - Glob patterns used to access resources
 */

/**
 * @typedef {object} TaskCacheMetadata
 * @property {object} requestSetGraph - Serialized resource request graph
 * @property {Array<object>} requestSetGraph.nodes - Graph nodes representing request sets
 * @property {number} requestSetGraph.nextId - Next available node ID
 */

/**
 * Manages the build cache for a single task
 *
 * This class tracks all resources accessed by a task (both project and dependency resources)
 * and maintains a graph of resource request sets. Each request set represents a unique
 * combination of resource accesses, enabling efficient cache invalidation and reuse.
 *
 * Key features:
 * - Tracks resource reads using paths and glob patterns
 * - Maintains resource indices for different request combinations
 * - Supports incremental updates when resources change
 * - Provides cache invalidation based on changed resources
 * - Serializes/deserializes cache metadata for persistence
 *
 * The request graph allows derived request sets (when a task reads additional resources)
 * to reuse existing resource indices, optimizing both memory and computation.
 */
export default class BuildTaskCache {
	#taskName;
	#projectName;

	#resourceRequests;
	#readTaskMetadataCache;
	#treeRegistries = [];
	#useDifferentialUpdate = true;

	// ===== LIFECYCLE =====

	/**
	 * Creates a new BuildTaskCache instance
	 *
	 * @param {string} taskName - Name of the task this cache manages
	 * @param {string} projectName - Name of the project this task belongs to
	 * @param {Function} readTaskMetadataCache - Function to read cached task metadata
	 */
	constructor(taskName, projectName, readTaskMetadataCache) {
		this.#taskName = taskName;
		this.#projectName = projectName;
		this.#readTaskMetadataCache = readTaskMetadataCache;
	}

	async #initResourceRequests() {
		if (this.#resourceRequests) {
			return; // Already initialized
		}
		if (!this.#readTaskMetadataCache) {
			// No cache reader provided, start with empty graph
			this.#resourceRequests = new ResourceRequestGraph();
			return;
		}

		const taskMetadata =
			await this.#readTaskMetadataCache();
		if (!taskMetadata) {
			throw new Error(`No cached metadata found for task '${this.#taskName}' ` +
				`of project '${this.#projectName}'`);
		}
		this.#resourceRequests = this.#restoreGraphFromCache(taskMetadata);
	}

	// ===== METADATA ACCESS =====

	/**
	 * Gets the name of the task
	 *
	 * @returns {string} Task name
	 */
	getTaskName() {
		return this.#taskName;
	}

	/**
	 * Updates resource indices for request sets affected by changed resources
	 *
	 * This method:
	 * 1. Traverses the request graph to find request sets matching changed resources
	 * 2. Restores missing resource indices if needed
	 * 3. Updates or removes resources in affected indices
	 * 4. Flushes all tree registries to apply batched changes
	 *
	 * Changes propagate from parent to child nodes in the request graph, ensuring
	 * all derived request sets are updated consistently.
	 *
	 * @param {Set<string>} changedProjectResourcePaths - Set of changed project resource paths
	 * @param {Set<string>} changedDepResourcePaths - Set of changed dependency resource paths
	 * @param {module:@ui5/fs.AbstractReader} projectReader - Reader for accessing project resources
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader - Reader for accessing dependency resources
	 * @returns {Promise<void>}
	 */
	async updateIndices(changedProjectResourcePaths, changedDepResourcePaths, projectReader, dependencyReader) {
		await this.#initResourceRequests();
		// Filter relevant resource changes and update the indices if necessary
		const matchingRequestSetIds = [];
		const updatesByRequestSetId = new Map();
		const changedProjectResourcePathsArray = Array.from(changedProjectResourcePaths);
		const changedDepResourcePathsArray = Array.from(changedDepResourcePaths);
		// Process all nodes, parents before children
		for (const {nodeId, node, parentId} of this.#resourceRequests.traverseByDepth()) {
			const addedRequests = node.getAddedRequests(); // Resource requests added at this level
			let relevantUpdates;
			if (addedRequests.length) {
				relevantUpdates = this.#matchResourcePaths(
					addedRequests, changedProjectResourcePathsArray, changedDepResourcePathsArray);
			} else {
				relevantUpdates = [];
			}
			if (parentId) {
				// Include updates from parent nodes
				const parentUpdates = updatesByRequestSetId.get(parentId);
				if (parentUpdates && parentUpdates.length) {
					relevantUpdates.push(...parentUpdates);
				}
			}
			if (relevantUpdates.length) {
				updatesByRequestSetId.set(nodeId, relevantUpdates);
				matchingRequestSetIds.push(nodeId);
			}
		}

		const resourceCache = new Map();
		// Update matching resource indices
		for (const requestSetId of matchingRequestSetIds) {
			const {resourceIndex} = this.#resourceRequests.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Missing resource index for request set ID ${requestSetId}`);
			}

			const resourcePathsToUpdate = updatesByRequestSetId.get(requestSetId);
			const resourcesToUpdate = [];
			const removedResourcePaths = [];
			for (const resourcePath of resourcePathsToUpdate) {
				let resource;
				if (resourceCache.has(resourcePath)) {
					resource = resourceCache.get(resourcePath);
				} else {
					if (changedDepResourcePaths.has(resourcePath)) {
						resource = await dependencyReader.byPath(resourcePath);
					} else {
						resource = await projectReader.byPath(resourcePath);
					}
					resourceCache.set(resourcePath, resource);
				}
				if (resource) {
					resourcesToUpdate.push(resource);
				} else {
					// Resource has been removed
					removedResourcePaths.push(resourcePath);
				}
			}
			if (removedResourcePaths.length) {
				await resourceIndex.removeResources(removedResourcePaths);
			}
			if (resourcesToUpdate.length) {
				await resourceIndex.upsertResources(resourcesToUpdate);
			}
		}
		if (this.#useDifferentialUpdate) {
			return await this.#flushTreeChangesWithDiff(changedProjectResourcePaths);
		} else {
			return await this.#flushTreeChanges(changedProjectResourcePaths);
		}
	}

	/**
	 * Matches changed resources against a set of requests
	 *
	 * Tests each request against the changed resource paths using exact path matching
	 * for 'path'/'dep-path' requests and glob pattern matching for 'patterns'/'dep-patterns' requests.
	 *
	 * @private
	 * @param {Request[]} resourceRequests - Array of resource requests to match against
	 * @param {string[]} projectResourcePaths - Changed project resource paths
	 * @param {string[]} dependencyResourcePaths - Changed dependency resource paths
	 * @returns {string[]} Array of matched resource paths
	 * @throws {Error} If an unknown request type is encountered
	 */
	#matchResourcePaths(resourceRequests, projectResourcePaths, dependencyResourcePaths) {
		const matchedResources = [];
		for (const {type, value} of resourceRequests) {
			switch (type) {
			case "path":
				if (projectResourcePaths.includes(value)) {
					matchedResources.push(value);
				}
				break;
			case "patterns":
				matchedResources.push(...micromatch(projectResourcePaths, value));
				break;
			case "dep-path":
				if (dependencyResourcePaths.includes(value)) {
					matchedResources.push(value);
				}
				break;
			case "dep-patterns":
				matchedResources.push(...micromatch(dependencyResourcePaths, value));
				break;
			default:
				throw new Error(`Unknown request type: ${type}`);
			}
		}
		return matchedResources;
	}

	/**
	 * Gets all possible stage signatures for this task
	 *
	 * Returns signatures from all recorded request sets. Each signature represents
	 * a unique combination of resources that were accessed during task execution.
	 * Used to look up cached build stages.
	 *
	 * @param {module:@ui5/fs.AbstractReader} [projectReader] - Reader for project resources (currently unused)
	 * @param {module:@ui5/fs.AbstractReader} [dependencyReader] - Reader for dependency resources (currently unused)
	 * @returns {Promise<string[]>} Array of stage signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	async getPossibleStageSignatures(projectReader, dependencyReader) {
		await this.#initResourceRequests();
		const requestSetIds = this.#resourceRequests.getAllNodeIds();
		const signatures = requestSetIds.map((requestSetId) => {
			const {resourceIndex} = this.#resourceRequests.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Resource index missing for request set ID ${requestSetId}`);
			}
			return resourceIndex.getSignature();
		});
		return signatures;
	}

	/**
	 * Calculates a signature for the task based on accessed resources
	 *
	 * This method:
	 * 1. Converts resource requests to Request objects
	 * 2. Searches for an exact match in the request graph
	 * 3. If found, returns the existing index signature
	 * 4. If not found, creates a new request set and resource index
	 * 5. Uses tree derivation when possible to reuse parent indices
	 *
	 * The signature uniquely identifies the set of resources accessed and their
	 * content, enabling cache lookup for previously executed task results.
	 *
	 * @param {ResourceRequests} projectRequests - Project resource requests (paths and patterns)
	 * @param {ResourceRequests} [dependencyRequests] - Dependency resource requests (paths and patterns)
	 * @param {module:@ui5/fs.AbstractReader} projectReader - Reader for accessing project resources
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader - Reader for accessing dependency resources
	 * @returns {Promise<string>} Signature hash string of the resource index
	 */
	async calculateSignature(projectRequests, dependencyRequests, projectReader, dependencyReader) {
		await this.#initResourceRequests();
		const requests = [];
		for (const pathRead of projectRequests.paths) {
			requests.push(new Request("path", pathRead));
		}
		for (const patterns of projectRequests.patterns) {
			requests.push(new Request("patterns", patterns));
		}
		if (dependencyRequests) {
			for (const pathRead of dependencyRequests.paths) {
				requests.push(new Request("dep-path", pathRead));
			}
			for (const patterns of dependencyRequests.patterns) {
				requests.push(new Request("dep-patterns", patterns));
			}
		}
		let setId = this.#resourceRequests.findExactMatch(requests);
		let resourceIndex;
		if (setId) {
			resourceIndex = this.#resourceRequests.getMetadata(setId).resourceIndex;
			// await resourceIndex.updateResources(resourcesRead); // Index was already updated before the task executed
		} else {
			// New request set, check whether we can create a delta
			const metadata = {}; // Will populate with resourceIndex below
			setId = this.#resourceRequests.addRequestSet(requests, metadata);


			const requestSet = this.#resourceRequests.getNode(setId);
			const parentId = requestSet.getParentId();
			if (parentId) {
				const {resourceIndex: parentResourceIndex} = this.#resourceRequests.getMetadata(parentId);
				// Add resources from delta to index
				const addedRequests = requestSet.getAddedRequests();
				const resourcesToAdd =
					await this.#getResourcesForRequests(addedRequests, projectReader, dependencyReader);
				resourceIndex = await parentResourceIndex.deriveTree(resourcesToAdd);
				// await newIndex.add(resourcesToAdd);
			} else {
				const resourcesRead =
					await this.#getResourcesForRequests(requests, projectReader, dependencyReader);
				resourceIndex = await ResourceIndex.create(resourcesRead, this.#newTreeRegistry());
			}
			metadata.resourceIndex = resourceIndex;
		}
		return resourceIndex.getSignature();
	}

	/**
	 * Creates and registers a new tree registry
	 *
	 * Tree registries enable batched updates across multiple derived trees,
	 * improving performance when multiple indices share common subtrees.
	 *
	 * @private
	 * @returns {TreeRegistry} New tree registry instance
	 */
	#newTreeRegistry() {
		const registry = new TreeRegistry();
		this.#treeRegistries.push(registry);
		return registry;
	}

	/**
	 * Flushes all tree registries to apply batched updates
	 *
	 * Commits all pending tree modifications across all registries in parallel.
	 * Must be called after operations that schedule updates via registries.
	 *
	 * @private
	 * @returns {Promise<object>} Object containing sets of added, updated, and removed resource paths
	 */
	async #flushTreeChanges() {
		return await Promise.all(this.#treeRegistries.map((registry) => registry.flush()));
	}

	/**
	 * Flushes all tree registries to apply batched updates
	 *
	 * Commits all pending tree modifications across all registries in parallel.
	 * Must be called after operations that schedule updates via registries.
	 *
	 * @param {Set<string>} projectResourcePaths Set of changed project resource paths
	 * @private
	 * @returns {Promise<object>} Object containing sets of added, updated, and removed resource paths
	 */
	async #flushTreeChangesWithDiff(projectResourcePaths) {
		const requestSetIds = this.#resourceRequests.getAllNodeIds();
		const trees = new Map();
		// Record current signatures and create mapping between trees and request sets
		requestSetIds.map((requestSetId) => {
			const {resourceIndex} = this.#resourceRequests.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Resource index missing for request set ID ${requestSetId}`);
			}
			trees.set(resourceIndex.getTree(), {
				requestSetId,
				signature: resourceIndex.getSignature(),
			});
		});

		let greatestNumberOfChanges = 0;
		let relevantTree;
		let relevantStats;
		const res = await this.#flushTreeChanges();

		// Based on the returned stats, find the tree with the greatest difference
		// If none of the updated trees lead to a valid cache, this tree can be used to execute a differential
		// build (assuming there's a cache for its previous signature)
		for (const {treeStats} of res) {
			for (const [tree, stats] of treeStats) {
				if (stats.removed.length > 0) {
					// If resources have been removed, we currently decide to not rely on any cache
					return;
				}
				const numberOfChanges = stats.added.length + stats.updated.length;
				if (numberOfChanges > greatestNumberOfChanges) {
					greatestNumberOfChanges = numberOfChanges;
					relevantTree = tree;
					relevantStats = stats;
				}
			}
		}

		if (!relevantTree) {
			return;
		}
		// Update signatures for affected request sets
		const {requestSetId, signature: originalSignature} = trees.get(relevantTree);
		const newSignature = relevantTree.getRootHash();
		log.verbose(`Task '${this.#taskName}' of project '${this.#projectName}' ` +
			`updated resource index for request set ID ${requestSetId} ` +
			`from signature ${originalSignature} ` +
			`to ${newSignature}`);

		const changedProjectResourcePaths = new Set();
		const changedDependencyResourcePaths = new Set();
		for (const path of relevantStats.added) {
			if (projectResourcePaths.has(path)) {
				changedProjectResourcePaths.add(path);
			} else {
				changedDependencyResourcePaths.add(path);
			}
		}
		for (const path of relevantStats.updated) {
			if (projectResourcePaths.has(path)) {
				changedProjectResourcePaths.add(path);
			} else {
				changedDependencyResourcePaths.add(path);
			}
		}

		return {
			originalSignature,
			newSignature,
			changedProjectResourcePaths,
			changedDependencyResourcePaths,
		};
	}

	/**
	 * Retrieves resources for a set of resource requests
	 *
	 * Processes different request types:
	 * - 'path': Retrieves single resource by path from project reader
	 * - 'patterns': Retrieves resources matching glob patterns from project reader
	 * - 'dep-path': Retrieves single resource by path from dependency reader
	 * - 'dep-patterns': Retrieves resources matching glob patterns from dependency reader
	 *
	 * @private
	 * @param {Request[]|Array<{type: string, value: string|string[]}>} resourceRequests - Resource requests to process
	 * @param {module:@ui5/fs.AbstractReader} projectReader - Reader for project resources
	 * @param {module:@ui5/fs.AbstractReader} dependencyReder - Reader for dependency resources
	 * @returns {Promise<IterableIterator<module:@ui5/fs.Resource>>} Iterator of retrieved resources
	 * @throws {Error} If an unknown request type is encountered
	 */
	async #getResourcesForRequests(resourceRequests, projectReader, dependencyReder) {
		const resourcesMap = new Map();
		for (const {type, value} of resourceRequests) {
			switch (type) {
			case "path": {
				const resource = await projectReader.byPath(value);
				if (resource) {
					resourcesMap.set(value, resource);
				}
				break;
			}
			case "patterns": {
				const matchedResources = await projectReader.byGlob(value);
				for (const resource of matchedResources) {
					resourcesMap.set(resource.getOriginalPath(), resource);
				}
				break;
			}
			case "dep-path": {
				const resource = await dependencyReder.byPath(value);
				if (resource) {
					resourcesMap.set(value, resource);
				}
				break;
			}
			case "dep-patterns": {
				const matchedResources = await dependencyReder.byGlob(value);
				for (const resource of matchedResources) {
					resourcesMap.set(resource.getOriginalPath(), resource);
				}
				break;
			}
			default:
				throw new Error(`Unknown request type: ${type}`);
			}
		}
		return resourcesMap.values();
	}

	/**
	 * Checks if changed resources match this task's tracked resources
	 *
	 * This is a fast check that determines if the task *might* be invalidated
	 * based on path matching and glob patterns.
	 *
	 * @param {string[]} projectResourcePaths - Changed project resource paths
	 * @param {string[]} dependencyResourcePaths - Changed dependency resource paths
	 * @returns {boolean} True if any changed resources match this task's tracked resources
	 */
	async matchesChangedResources(projectResourcePaths, dependencyResourcePaths) {
		await this.#initResourceRequests();
		const resourceRequests = this.#resourceRequests.getAllRequests();
		return resourceRequests.some(({type, value}) => {
			if (type === "path") {
				return projectResourcePaths.includes(value);
			}
			if (type === "patterns") {
				return micromatch(projectResourcePaths, value).length > 0;
			}
			if (type === "dep-path") {
				return dependencyResourcePaths.includes(value);
			}
			if (type === "dep-patterns") {
				return micromatch(dependencyResourcePaths, value).length > 0;
			}
			throw new Error(`Unknown request type: ${type}`);
		});
	}

	/**
	 * Serializes the task cache to a plain object for persistence
	 *
	 * Exports the resource request graph in a format suitable for JSON serialization.
	 * The serialized data can be passed to the constructor to restore the cache state.
	 *
	 * @returns {TaskCacheMetadata} Serialized cache metadata containing the request set graph
	 */
	toCacheObject() {
		const rootIndices = [];
		const deltaIndices = [];
		for (const {nodeId, parentId} of this.#resourceRequests.traverseByDepth()) {
			const {resourceIndex} = this.#resourceRequests.getMetadata(nodeId);
			if (!resourceIndex) {
				throw new Error(`Missing resource index for node ID ${nodeId}`);
			}
			if (!parentId) {
				rootIndices.push({
					nodeId,
					resourceIndex: resourceIndex.toCacheObject(),
				});
			} else {
				const {resourceIndex: rootResourceIndex} = this.#resourceRequests.getMetadata(parentId);
				if (!rootResourceIndex) {
					throw new Error(`Missing root resource index for parent ID ${parentId}`);
				}
				const addedResourceIndex = resourceIndex.getAddedResourceIndex(rootResourceIndex);
				deltaIndices.push({
					nodeId,
					addedResourceIndex,
				});
			}
		}
		return {
			requestSetGraph: this.#resourceRequests.toCacheObject(),
			rootIndices,
			deltaIndices,
		};
	}

	#restoreGraphFromCache({requestSetGraph, rootIndices, deltaIndices}) {
		const resourceRequests = ResourceRequestGraph.fromCacheObject(requestSetGraph);
		const registries = new Map();
		// Restore root resource indices
		for (const {nodeId, resourceIndex: serializedIndex} of rootIndices) {
			const metadata = resourceRequests.getMetadata(nodeId);
			const registry = this.#newTreeRegistry();
			registries.set(nodeId, registry);
			metadata.resourceIndex = ResourceIndex.fromCache(serializedIndex, registry);
		}
		// Restore delta resource indices
		if (deltaIndices) {
			for (const {nodeId, addedResourceIndex} of deltaIndices) {
				const node = resourceRequests.getNode(nodeId);
				const {resourceIndex: parentResourceIndex} = resourceRequests.getMetadata(node.getParentId());
				const registry = registries.get(node.getParentId());
				if (!registry) {
					throw new Error(`Missing tree registry for parent of node ID ${nodeId}`);
				}
				const resourceIndex = parentResourceIndex.deriveTreeWithIndex(addedResourceIndex, registry);

				resourceRequests.setMetadata(nodeId, {
					resourceIndex,
				});
			}
		}
		return resourceRequests;
	}
}

import crypto from "node:crypto";
import micromatch from "micromatch";
import ResourceRequestGraph, {Request} from "./ResourceRequestGraph.js";
import ResourceIndex from "./index/ResourceIndex.js";
import TreeRegistry from "./index/TreeRegistry.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:cache:ResourceRequestManager");

/**
 * Restores an unresolved-requests marker from its serialized (array) form onto a metadata object.
 * No-op for a missing or empty array, keeping the marker absent rather than an empty Set.
 *
 * @param {object} metadata Request-set node metadata (mutated in place)
 * @param {string[]|undefined} serialized Serialized unresolved request keys
 */
function deserializeUnresolvedRequests(metadata, serialized) {
	if (serialized?.length) {
		metadata.unresolvedRequests = new Set(serialized);
	}
}

/**
 * Serializes an unresolved-requests marker to its array form onto a cache entry.
 * No-op for a missing or empty Set, keeping the marker out of the serialized output.
 *
 * @param {object} entry Cache entry (mutated in place)
 * @param {Set<string>|undefined} unresolvedRequests Set of unresolved request keys
 */
function serializeUnresolvedRequests(entry, unresolvedRequests) {
	if (unresolvedRequests?.size) {
		entry.unresolvedRequests = Array.from(unresolvedRequests);
	}
}

/**
 * Manages resource requests and their associated indices for a single task
 *
 * Tracks all resources accessed by a task during execution and maintains resource indices
 * for cache validation and differential updates. Supports both full and delta-based caching
 * strategies.
 *
 * @class
 */
class ResourceRequestManager {
	#taskName;
	#projectName;
	#requestGraph;

	#treeRegistries = [];
	#treeUpdateDeltas = new Map();

	#hasNewOrModifiedCacheEntries;
	#useDifferentialUpdate;
	#unusedAtLeastOnce;

	/**
	 * Creates a new ResourceRequestManager instance
	 *
	 * @param {string} projectName Name of the project
	 * @param {string} taskName Name of the task
	 * @param {boolean} useDifferentialUpdate Whether to track differential updates
	 * @param {ResourceRequestGraph} [requestGraph] Optional pre-existing request graph from cache
	 * @param {boolean} [unusedAtLeastOnce=false] Whether the task has been unused at least once
	 */
	constructor(projectName, taskName, useDifferentialUpdate, requestGraph, unusedAtLeastOnce = false) {
		this.#projectName = projectName;
		this.#taskName = taskName;
		this.#useDifferentialUpdate = useDifferentialUpdate;
		this.#unusedAtLeastOnce = unusedAtLeastOnce;
		if (requestGraph) {
			this.#requestGraph = requestGraph;
			this.#hasNewOrModifiedCacheEntries = false; // Using cache
		} else {
			this.#requestGraph = new ResourceRequestGraph();
			this.#hasNewOrModifiedCacheEntries = true;
		}
	}

	/**
	 * Factory method to restore a ResourceRequestManager from cached data
	 *
	 * Deserializes a previously cached request graph and its associated resource indices,
	 * including both root indices and delta indices for differential updates.
	 *
	 * @param {string} projectName Name of the project
	 * @param {string} taskName Name of the task
	 * @param {boolean} useDifferentialUpdate Whether to track differential updates
	 * @param {object} cacheData Cached metadata object
	 * @param {object} cacheData.requestSetGraph Serialized request graph
	 * @param {Array<object>} cacheData.rootIndices Array of root resource indices
	 * @param {Array<object>} [cacheData.deltaIndices] Array of delta resource indices
	 * @param {boolean} [cacheData.unusedAtLeastOnce] Whether the task has been unused
	 * @returns {ResourceRequestManager} Restored manager instance
	 */
	static fromCache(projectName, taskName, useDifferentialUpdate, {
		requestSetGraph, rootIndices, deltaIndices, unusedAtLeastOnce
	}) {
		const requestGraph = ResourceRequestGraph.fromCache(requestSetGraph);
		const resourceRequestManager = new ResourceRequestManager(
			projectName, taskName, useDifferentialUpdate, requestGraph, unusedAtLeastOnce);
		const registries = new Map();
		// Restore root resource indices
		for (const {nodeId, resourceIndex: serializedIndex, unresolvedRequests} of rootIndices) {
			const metadata = requestGraph.getMetadata(nodeId);
			const registry = resourceRequestManager.#newTreeRegistry();
			registries.set(nodeId, registry);
			metadata.resourceIndex = ResourceIndex.fromCacheShared(serializedIndex, registry);
			deserializeUnresolvedRequests(metadata, unresolvedRequests);
		}
		// Restore delta resource indices
		if (deltaIndices) {
			for (const {nodeId, addedResourceIndex, unresolvedRequests} of deltaIndices) {
				const node = requestGraph.getNode(nodeId);
				const {resourceIndex: parentResourceIndex} = requestGraph.getMetadata(node.getParentId());
				const registry = registries.get(node.getParentId());
				if (!registry) {
					throw new Error(`Missing tree registry for parent of node ID ${nodeId} of task ` +
					`'${taskName}' of project '${projectName}'`);
				}
				const resourceIndex = parentResourceIndex.deriveTreeWithIndex(addedResourceIndex);

				const metadata = {resourceIndex};
				deserializeUnresolvedRequests(metadata, unresolvedRequests);
				requestGraph.setMetadata(nodeId, metadata);
			}
		}
		return resourceRequestManager;
	}

	/**
	 * Gets all project index signatures for this task
	 *
	 * Returns signatures from all recorded project-request sets. Each signature represents
	 * a unique combination of resources belonging to the current project that were accessed
	 * during task execution. This can be used to form cache keys for restoring cached task results.
	 *
	 * @public
	 * @returns {string[]} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getIndexSignatures() {
		const requestSetIds = this.#requestGraph.getAllNodeIds();
		const signatures = requestSetIds.map((requestSetId) => {
			const {resourceIndex, unresolvedRequests} = this.#requestGraph.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Resource index missing for request set ID ${requestSetId}`);
			}
			return this.#computeNodeSignature(resourceIndex, unresolvedRequests);
		});
		if (this.#unusedAtLeastOnce) {
			signatures.push("X"); // Signature for when no requests were made
		}
		return signatures;
	}

	/**
	 * Updates all indices based on current resources without delta tracking
	 *
	 * Performs a full refresh of all resource indices by fetching current resources
	 * and updating or removing indexed resources as needed. Does not track changes
	 * between the old and new state.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @returns {Promise<void>}
	 */
	async refreshIndices(reader) {
		if (this.#requestGraph.getSize() === 0) {
			// No requests recorded -> No updates necessary
			return;
		}

		const refreshStart = log.isLevelEnabled("perf") ? performance.now() : 0;
		let totalResourcesFetched = 0;
		let totalResourcesRemoved = 0;
		const resourceCache = new Map();
		const nodeEntries = Array.from(this.#requestGraph.traverseByDepth());

		await Promise.all(nodeEntries.map(async ({nodeId}) => {
			const {resourceIndex} = this.#requestGraph.getMetadata(nodeId);
			if (!resourceIndex) {
				throw new Error(`Missing resource index for request set ID ${nodeId}`);
			}
			const addedRequests = this.#requestGraph.getNode(nodeId).getAddedRequests();
			const resourcesToUpdate = await this.#getResourcesForRequests(addedRequests, reader, resourceCache);

			// Determine resources to remove
			const indexedResourcePaths = resourceIndex.getResourcePaths();
			const currentResourcePaths = resourcesToUpdate.map((res) => res.getOriginalPath());
			const resourcesToRemove = indexedResourcePaths.filter((resPath) => {
				return !currentResourcePaths.includes(resPath);
			});
			totalResourcesRemoved += resourcesToRemove.length;
			if (resourcesToRemove.length) {
				await resourceIndex.removeResources(resourcesToRemove);
			}
			totalResourcesFetched += resourcesToUpdate.length;
			if (resourcesToUpdate.length) {
				await resourceIndex.upsertResources(resourcesToUpdate);
			}
		}));
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`refreshIndices for task '${this.#taskName}' of project '${this.#projectName}' ` +
				`completed in ${(performance.now() - refreshStart).toFixed(2)} ms: ` +
				`${totalResourcesFetched} resources fetched, ${totalResourcesRemoved} resources removed`);
		}

		await this.#flushTreeChangesWithoutDiffTracking();
	}

	/**
	 * Filters relevant resource changes and updates the indices if necessary
	 *
	 * Processes changed resource paths, identifies which request sets are affected,
	 * and updates their resource indices accordingly. Supports both full updates and
	 * differential tracking based on the manager configuration.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @param {string[]} changedResourcePaths Array of changed project resource paths
	 * @returns {Promise<boolean>} True if any changes were detected, false otherwise
	 */
	async updateIndices(reader, changedResourcePaths) {
		const matchingRequestSetIds = [];
		const updatesByRequestSetId = new Map();
		if (this.#requestGraph.getSize() === 0) {
			// No requests recorded -> No updates necessary
			return false;
		}

		// Process all nodes, parents before children
		for (const {nodeId, node, parentId} of this.#requestGraph.traverseByDepth()) {
			const addedRequests = node.getAddedRequests(); // Resource requests added at this level
			let relevantUpdates;
			if (addedRequests.length) {
				relevantUpdates = this.#matchResourcePaths(addedRequests, changedResourcePaths);
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
		if (!matchingRequestSetIds.length) {
			return false; // No relevant changes for any request set
		}

		const resourceCache = new Map();

		const fetchStart = log.isLevelEnabled("perf") ? performance.now() : 0;
		let cacheHits = 0;
		let cacheMisses = 0;

		// Phase 1: Collect all unique paths to fetch
		const allPathsToFetch = new Set();
		for (const requestSetId of matchingRequestSetIds) {
			const resourcePathsToUpdate = updatesByRequestSetId.get(requestSetId);
			for (const resourcePath of resourcePathsToUpdate) {
				if (!resourceCache.has(resourcePath)) {
					allPathsToFetch.add(resourcePath);
					cacheMisses++;
				} else {
					cacheHits++;
				}
			}
		}

		// Phase 2: Batch-fetch in parallel
		if (allPathsToFetch.size > 0) {
			await Promise.all(Array.from(allPathsToFetch).map(async (resourcePath) => {
				const resource = await reader.byPath(resourcePath);
				resourceCache.set(resourcePath, resource ?? null);
			}));
		}
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`updateIndices for task '${this.#taskName}' of project '${this.#projectName}' ` +
				`resource fetch completed in ${(performance.now() - fetchStart).toFixed(2)} ms: ` +
				`${cacheHits} cache hits, ${cacheMisses} cache misses`);
		}

		// Phase 3: Process each request set from cache
		for (const requestSetId of matchingRequestSetIds) {
			const metadata = this.#requestGraph.getMetadata(requestSetId);
			const {resourceIndex} = metadata;
			if (!resourceIndex) {
				throw new Error(`Missing resource index for request set ID ${requestSetId}`);
			}

			const resourcePathsToUpdate = updatesByRequestSetId.get(requestSetId);
			const resourcesToUpdate = [];
			const removedResourcePaths = [];
			for (const resourcePath of resourcePathsToUpdate) {
				const resource = resourceCache.get(resourcePath);
				if (resource) {
					resourcesToUpdate.push(resource);
				} else {
					removedResourcePaths.push(resourcePath);
				}
			}
			if (removedResourcePaths.length) {
				await resourceIndex.removeResources(removedResourcePaths);
			}
			if (resourcesToUpdate.length) {
				await resourceIndex.upsertResources(resourcesToUpdate);
			}
			// Drain unresolved markers: any recorded added-request that now resolves
			// to at least one resource is no longer unresolved. Only inspect
			// added-requests (the ones this node contributes); inherited requests
			// are the parent's responsibility.
			if (metadata.unresolvedRequests?.size &&
				resourcesToUpdate.length) {
				this.#drainUnresolvedRequests(
					metadata, this.#requestGraph.getNode(requestSetId).getAddedRequests(),
					resourcesToUpdate.map((res) => res.getOriginalPath()));
			}
		}
		let hasChanges;
		if (this.#useDifferentialUpdate) {
			hasChanges = await this.#flushTreeChangesWithDiffTracking();
		} else {
			hasChanges = await this.#flushTreeChangesWithoutDiffTracking();
		}
		if (hasChanges) {
			this.#hasNewOrModifiedCacheEntries = true;
		}
		return hasChanges;
	}

	/**
	 * Returns whether any resource requests have been recorded
	 *
	 * @public
	 * @returns {boolean}
	 */
	hasRequests() {
		return this.#requestGraph.getSize() > 0;
	}

	/**
	 * Matches changed resources against a set of requests
	 *
	 * Tests each request against the changed resource paths using exact path matching
	 * for 'path'/'dep-path' requests and glob pattern matching for 'patterns'/'dep-patterns' requests.
	 *
	 * @param {Request[]} resourceRequests - Array of resource requests to match against
	 * @param {string[]} resourcePaths - Changed project resource paths
	 * @returns {string[]} Array of matched resource paths
	 */
	#matchResourcePaths(resourceRequests, resourcePaths) {
		const matchedResources = [];
		for (const {type, value} of resourceRequests) {
			if (type === "path") {
				if (resourcePaths.includes(value) && !matchedResources.includes(value)) {
					matchedResources.push(value);
				}
			} else {
				const globMatches = micromatch(resourcePaths, value, {
					dot: true
				});
				for (const match of globMatches) {
					if (!matchedResources.includes(match)) {
						matchedResources.push(match);
					}
				}
			}
		}
		return matchedResources;
	}

	/**
	 * Flushes all tree registries to apply batched updates without tracking changes
	 *
	 * Commits all pending tree modifications but does not record the specific changes
	 * (added, updated, removed resources). Used when differential updates are disabled.
	 *
	 * @returns {Promise<boolean>} True if any changes were detected, false otherwise
	 */
	async #flushTreeChangesWithoutDiffTracking() {
		const results = await this.#flushTreeChanges();

		// Check for changes
		for (const res of results) {
			if (res.added.length || res.updated.length || res.unchanged.length || res.removed.length) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Flushes all tree registries to apply batched updates while tracking changes
	 *
	 * Commits all pending tree modifications and records detailed information about
	 * which resources were added, updated, or removed. Used when differential updates
	 * are enabled to support incremental cache invalidation.
	 *
	 * @returns {Promise<boolean>} True if any changes were detected, false otherwise
	 */
	async #flushTreeChangesWithDiffTracking() {
		const requestSetIds = this.#requestGraph.getAllNodeIds();
		const previousTreeSignatures = new Map();
		// Record current signatures and create mapping between trees and request sets
		requestSetIds.map((requestSetId) => {
			const {resourceIndex} = this.#requestGraph.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Resource index missing for request set ID ${requestSetId}`);
			}
			// Remember the original signature
			previousTreeSignatures.set(resourceIndex.getTree(), [requestSetId, resourceIndex.getSignature()]);
		});
		const results = await this.#flushTreeChanges();
		let hasChanges = false;
		for (const res of results) {
			if (res.added.length || res.updated.length || res.unchanged.length || res.removed.length) {
				hasChanges = true;
			}
			for (const [tree, diff] of res.treeStats) {
				const [requestSetId, originalSignature] = previousTreeSignatures.get(tree);
				const newSignature = tree.getRootHash();
				this.#addDeltaEntry(requestSetId, originalSignature, newSignature, diff);
			}
		}
		return hasChanges;
	}

	/**
	 * Flushes all tree registries to apply batched updates
	 *
	 * Commits all pending tree modifications across all registries in parallel.
	 * Must be called after operations that schedule updates via registries.
	 *
	 * @returns {Promise<Array<object>>} Array of flush results from all registries,
	 *   each containing added, updated, unchanged, and removed resource paths
	 */
	async #flushTreeChanges() {
		const flushStart = log.isLevelEnabled("perf") ? performance.now() : 0;
		const results = await Promise.all(this.#treeRegistries.map((registry) => registry.flush()));
		if (log.isLevelEnabled("perf")) {
			log.perf(
				`#flushTreeChanges for task '${this.#taskName}' of project '${this.#projectName}' ` +
				`completed in ${(performance.now() - flushStart).toFixed(2)} ms ` +
				`across ${this.#treeRegistries.length} registries`);
		}
		return results;
	}

	/**
	 * Adds or updates a delta entry for tracking resource index changes
	 *
	 * Records the transition from an original signature to a new signature along with
	 * the specific resources that changed. Accumulates changes across multiple updates.
	 *
	 * @param {string} requestSetId Identifier of the request set
	 * @param {string} originalSignature Original resource index signature
	 * @param {string} newSignature New resource index signature
	 * @param {object} diff Object containing arrays of added, updated, unchanged, and removed resource paths
	 */
	#addDeltaEntry(requestSetId, originalSignature, newSignature, diff) {
		if (!this.#treeUpdateDeltas.has(requestSetId)) {
			this.#treeUpdateDeltas.set(requestSetId, {
				originalSignature,
				newSignature,
				diff
			});
			return;
		}
		const entry = this.#treeUpdateDeltas.get(requestSetId);

		entry.previousSignatures ??= [];
		entry.previousSignatures.push(entry.originalSignature);
		entry.originalSignature = originalSignature;
		entry.newSignature = newSignature;

		const {added, updated, unchanged, removed} = entry.diff;
		for (const resourcePath of diff.added) {
			if (!added.includes(resourcePath)) {
				added.push(resourcePath);
			}
		}
		for (const resourcePath of diff.updated) {
			if (!updated.includes(resourcePath)) {
				updated.push(resourcePath);
			}
		}
		for (const resourcePath of diff.unchanged) {
			if (!unchanged.includes(resourcePath)) {
				unchanged.push(resourcePath);
			}
		}
		for (const resourcePath of diff.removed) {
			if (!removed.includes(resourcePath)) {
				removed.push(resourcePath);
			}
		}
	}

	/**
	 * Gets all delta entries for differential cache updates
	 *
	 * Returns a map of signature transitions and their associated changed resource paths.
	 * Only includes deltas where no resources were removed, as removed resources prevent
	 * differential updates.
	 *
	 * @public
	 * @returns {Map<string, object>} Map from original signature to delta information
	 *   containing newSignature and changedPaths array
	 */
	getDeltas() {
		const deltas = new Map();
		for (const {originalSignature, newSignature, diff} of this.#treeUpdateDeltas.values()) {
			let changedPaths;
			if (diff) {
				const {added, updated, removed} = diff;
				if (removed.length) {
					// Cannot use differential build if a resource has been removed
					continue;
				}
				changedPaths = Array.from(new Set([...added, ...updated]));
			} else {
				changedPaths = [];
			}
			deltas.set(originalSignature, {
				newSignature,
				changedPaths,
			});
		}
		return deltas;
	}

	/**
	 * Adds a new set of resource requests and returns their signature
	 *
	 * Processes recorded resource requests (both path and pattern-based), creates or reuses
	 * a request set in the graph, and returns the resulting resource index signature.
	 *
	 * @public
	 * @param {object} requestRecording Project resource requests
	 * @param {string[]} requestRecording.paths Array of requested resource paths
	 * @param {Array<string[]>} requestRecording.patterns Array of glob pattern arrays
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @returns {Promise<object>} Object containing setId and signature of the resource index
	 */
	async addRequests(requestRecording, reader) {
		const projectRequests = [];
		for (const pathRead of requestRecording.paths) {
			projectRequests.push(new Request("path", pathRead));
		}
		for (const patterns of requestRecording.patterns) {
			projectRequests.push(new Request("patterns", patterns));
		}
		return await this.#addRequestSet(projectRequests, reader);
	}

	/**
	 * Records that a task made no resource requests
	 *
	 * Marks the manager as having been unused at least once and returns a special
	 * signature indicating no requests were made.
	 *
	 * @public
	 * @returns {string} Special signature "X" indicating no requests
	 */
	recordNoRequests() {
		if (!this.#unusedAtLeastOnce) {
			this.#hasNewOrModifiedCacheEntries = true;
		}
		this.#unusedAtLeastOnce = true;
		return "X"; // Signature for when no requests were made
	}

	/**
	 * Adds a request set and creates or reuses a resource index
	 *
	 * Attempts to find an existing matching request set to reuse. If not found, creates
	 * a new request set with either a derived or fresh resource index based on whether
	 * a parent request set exists.
	 *
	 * @param {Request[]} requests Array of resource requests
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @returns {Promise<object>} Object containing setId and signature of the resource index
	 */
	async #addRequestSet(requests, reader) {
		this.#hasNewOrModifiedCacheEntries = true;
		// Try to find an existing request set that we can reuse
		let setId = this.#requestGraph.findExactMatch(requests);
		let resourceIndex;
		let unresolvedRequests;
		if (setId) {
			// Reuse existing resource index.
			// Note: This index has already been updated before the task executed, so no update is necessary here
			const existingMetadata = this.#requestGraph.getMetadata(setId);
			resourceIndex = existingMetadata.resourceIndex;
			unresolvedRequests = existingMetadata.unresolvedRequests;
		} else {
			// New request set, check whether we can create a delta
			const metadata = {}; // Will populate with resourceIndex below
			setId = this.#requestGraph.addRequestSet(requests, metadata);

			const requestSet = this.#requestGraph.getNode(setId);
			const parentId = requestSet.getParentId();
			if (parentId) {
				const {resourceIndex: parentResourceIndex} = this.#requestGraph.getMetadata(parentId);
				// Add resources from delta to index
				const addedRequests = requestSet.getAddedRequests();
				const resourcesToAdd =
					await this.#getResourcesForRequests(addedRequests, reader);
				log.verbose(`Task '${this.#taskName}' of project '${this.#projectName}' ` +
					`created derived resource index for request set ID ${setId} ` +
					`based on parent ID ${parentId} with ${resourcesToAdd.length} additional resources`);
				resourceIndex = await parentResourceIndex.deriveTree(resourcesToAdd);
				// Some added requests may resolve to no resource (e.g. a byPath probe for an
				// optional file, or every request after a branch switch deletes probed files).
				// Those reads still influence task output, so record the unresolved requests to
				// keep the exposed signature distinct from the parent's until they resolve.
				unresolvedRequests = this.#collectUnresolvedRequests(addedRequests, resourcesToAdd);
			} else {
				const resourcesRead =
					await this.#getResourcesForRequests(requests, reader);
				resourceIndex = await ResourceIndex.createShared(resourcesRead, Date.now(), this.#newTreeRegistry());
				// Same handling for the root case: distinguish independent recordings that
				// happen to resolve to zero resources today.
				unresolvedRequests = this.#collectUnresolvedRequests(requests, resourcesRead);
			}
			metadata.resourceIndex = resourceIndex;
			if (unresolvedRequests?.size) {
				metadata.unresolvedRequests = unresolvedRequests;
			}
		}
		return {
			setId,
			signature: this.#computeNodeSignature(resourceIndex, unresolvedRequests),
		};
	}

	/**
	 * Computes the exposed signature for a request-set node
	 *
	 * With no unresolved requests, returns the underlying tree signature. When some
	 * recorded requests resolved to no resources (byPath probes for files that don't
	 * exist yet, or byGlob patterns matching nothing), those reads still influence
	 * task output, so the exposed signature must stay distinct from the tree hash of
	 * an otherwise-identical index. The signature therefore hashes the tree signature
	 * together with the sorted unresolved keys.
	 *
	 * Once all unresolved requests drain (a later updateIndices upserts each probed
	 * resource as it appears), the composite falls back to the tree signature,
	 * matching what a fresh recording with the resource present would produce.
	 *
	 * @param {ResourceIndex} resourceIndex Resource index of the node
	 * @param {Set<string>|undefined} unresolvedRequests Set of unresolved request keys
	 * @returns {string} Exposed signature
	 */
	#computeNodeSignature(resourceIndex, unresolvedRequests) {
		const treeSignature = resourceIndex.getSignature();
		if (!unresolvedRequests?.size) {
			return treeSignature;
		}
		const sortedKeys = Array.from(unresolvedRequests).sort();
		// Separate the fields with NUL so the concatenation is unambiguous: the tree
		// signature is hex and request keys are UTF-8 paths/patterns, so neither can
		// contain a NUL byte. Without it, sha256("ab" + ["c"]) and sha256("a" + ["bc"])
		// would collide. sortedKeys is joined on NUL for the same reason.
		return crypto.createHash("sha256")
			.update(treeSignature)
			.update("\0")
			.update(sortedKeys.join("\0"))
			.digest("hex");
	}

	/**
	 * Determines which recorded requests did not resolve to any resource
	 *
	 * A 'path' request is unresolved if no fetched resource has that exact path.
	 * A 'patterns' request is unresolved if no fetched resource path matches any
	 * pattern in the array.
	 *
	 * @param {Request[]} recordedRequests Requests as recorded by the MonitoredReader
	 * @param {Array<module:@ui5/fs.Resource>} fetchedResources Resources actually returned
	 * @returns {Set<string>} Set of unresolved request keys (Request.toKey() form)
	 */
	#collectUnresolvedRequests(recordedRequests, fetchedResources) {
		const fetchedPaths = fetchedResources.map((res) => res.getOriginalPath());
		const fetchedPathSet = new Set(fetchedPaths);
		const unresolved = new Set();
		for (const request of recordedRequests) {
			if (!this.#requestResolvesAgainstPaths(request, fetchedPathSet, fetchedPaths)) {
				unresolved.add(request.toKey());
			}
		}
		return unresolved;
	}

	/**
	 * Drops keys from metadata.unresolvedRequests whose recorded request now resolves to
	 * at least one of the given paths.
	 *
	 * Called from updateIndices after upserting newly-appeared resources into a
	 * node's index. Once every key drains, the node's exposed signature collapses
	 * back to the pure tree hash, matching what a fresh recording with the
	 * resource present would have produced.
	 *
	 * @param {object} metadata Request-set node metadata (mutated in place)
	 * @param {Request[]} addedRequests Recorded added-requests for this node
	 * @param {string[]} resolvedPaths Paths that now resolve to a resource
	 */
	#drainUnresolvedRequests(metadata, addedRequests, resolvedPaths) {
		const resolvedPathSet = new Set(resolvedPaths);
		for (const request of addedRequests) {
			const key = request.toKey();
			if (!metadata.unresolvedRequests.has(key)) {
				continue;
			}
			if (this.#requestResolvesAgainstPaths(request, resolvedPathSet, resolvedPaths)) {
				metadata.unresolvedRequests.delete(key);
			}
		}
		if (metadata.unresolvedRequests.size === 0) {
			delete metadata.unresolvedRequests;
		}
	}

	/**
	 * Whether a recorded request would resolve against the given set of resource paths.
	 * 'path' requests hit the Set for O(1) lookup; 'patterns' requests fall back to
	 * micromatch, which needs the array form.
	 *
	 * @param {Request} request
	 * @param {Set<string>} pathSet Set of resource paths
	 * @param {string[]} pathList Same paths in array form, for micromatch
	 * @returns {boolean}
	 */
	#requestResolvesAgainstPaths(request, pathSet, pathList) {
		if (request.type === "path") {
			return pathSet.has(request.value);
		}
		return micromatch(pathList, request.value, {dot: true}).length > 0;
	}

	/**
	 * Associates a request set from this manager with one from another manager
	 *
	 * @public
	 * @param {string} ourRequestSetId Request set ID from this manager
	 * @param {string} foreignRequestSetId Request set ID from another manager
	 * @todo Implementation pending
	 */
	addAffiliatedRequestSet(ourRequestSetId, foreignRequestSetId) {
		// TODO
	}

	/**
	 * Creates and registers a new tree registry
	 *
	 * Tree registries enable batched updates across multiple derived trees,
	 * improving performance when multiple indices share common subtrees.
	 *
	 * @returns {TreeRegistry} New tree registry instance
	 */
	#newTreeRegistry() {
		const registry = new TreeRegistry();
		this.#treeRegistries.push(registry);
		return registry;
	}

	/**
	 * Retrieves resources for a set of resource requests
	 *
	 * Processes different request types:
	 * - 'path': Retrieves single resource by path from the given reader
	 * - 'patterns': Retrieves resources matching glob patterns from the given reader
	 *
	 * @param {Request[]|Array<{type: string, value: string|string[]}>} resourceRequests - Resource requests to process
	 * @param {module:@ui5/fs.AbstractReader} reader - Resource reader
	 * @param {Map<string, module:@ui5/fs.Resource>} [resourceCache]
	 * @returns {Promise<Array<module:@ui5/fs.Resource>>} Array of matched resources
	 */
	async #getResourcesForRequests(resourceRequests, reader, resourceCache) {
		const resourcesMap = new Map();
		await Promise.all(resourceRequests.map(async ({type, value}) => {
			if (type === "path") {
				if (resourcesMap.has(value)) {
					// Resource already found
					return;
				}
				if (resourceCache?.has(value)) {
					const cachedResource = resourceCache.get(value);
					resourcesMap.set(cachedResource.getOriginalPath(), cachedResource);
				}
				const resource = await reader.byPath(value);
				if (resource) {
					resourcesMap.set(resource.getOriginalPath(), resource);
				}
			} else if (type === "patterns") {
				const matchedResources = await reader.byGlob(value);
				for (const resource of matchedResources) {
					resourcesMap.set(resource.getOriginalPath(), resource);
				}
			}
		}));
		return Array.from(resourcesMap.values());
	}

	/**
	 * Checks whether new or modified cache entries exist
	 *
	 * Returns false if the manager was restored from cache and no modifications were made.
	 * Returns true if this is a new manager or if new request sets have been added.
	 *
	 * @public
	 * @returns {boolean} True if cache entries need to be written
	 */
	hasNewOrModifiedCacheEntries() {
		return this.#hasNewOrModifiedCacheEntries;
	}

	/**
	 * Serializes the manager to a plain object for persistence
	 *
	 * Exports the resource request graph and all resource indices in a format suitable
	 * for JSON serialization. The serialized data can be passed to fromCache() to restore
	 * the manager state. Returns undefined if no new or modified cache entries exist.
	 *
	 * @public
	 * @returns {object|undefined} Serialized cache metadata or undefined if no changes
	 * @returns {object} return.requestSetGraph Serialized request graph
	 * @returns {Array<object>} return.rootIndices Array of root resource indices with node IDs
	 * @returns {Array<object>} return.deltaIndices Array of delta resource indices with node IDs
	 * @returns {boolean} return.unusedAtLeastOnce Whether the task has been unused
	 */
	toCacheObject() {
		if (!this.#hasNewOrModifiedCacheEntries) {
			return;
		}
		const rootIndices = [];
		const deltaIndices = [];
		for (const {nodeId, parentId} of this.#requestGraph.traverseByDepth()) {
			const {resourceIndex, unresolvedRequests} = this.#requestGraph.getMetadata(nodeId);
			if (!resourceIndex) {
				throw new Error(`Missing resource index for node ID ${nodeId}`);
			}
			if (!parentId) {
				const entry = {
					nodeId,
					resourceIndex: resourceIndex.toCacheObject(),
				};
				serializeUnresolvedRequests(entry, unresolvedRequests);
				rootIndices.push(entry);
			} else {
				const {resourceIndex: rootResourceIndex} = this.#requestGraph.getMetadata(parentId);
				if (!rootResourceIndex) {
					throw new Error(`Missing root resource index for parent ID ${parentId}`);
				}
				// Store the metadata for all added resources. Note: Those resources might not be available
				// in the current tree. In that case we store an empty array.
				const addedResourceIndex = resourceIndex.getAddedResourceIndex(rootResourceIndex);
				const entry = {
					nodeId,
					addedResourceIndex,
				};
				serializeUnresolvedRequests(entry, unresolvedRequests);
				deltaIndices.push(entry);
			}
		}
		return {
			requestSetGraph: this.#requestGraph.toCacheObject(),
			rootIndices,
			deltaIndices,
			unusedAtLeastOnce: this.#unusedAtLeastOnce,
		};
	}
}

export default ResourceRequestManager;

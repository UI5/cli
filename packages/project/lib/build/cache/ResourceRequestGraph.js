const ALLOWED_REQUEST_TYPES = new Set(["path", "patterns", "dep-path", "dep-patterns"]);

/**
 * Represents a single request with type and value
 */
export class Request {
	/**
	 * @param {string} type - Either 'path', 'pattern', "dep-path" or "dep-pattern"
	 * @param {string|string[]} value - The request value (string for path types, array for pattern types)
	 */
	constructor(type, value) {
		if (!ALLOWED_REQUEST_TYPES.has(type)) {
			throw new Error(`Invalid request type: ${type}`);
		}

		// Validate value type based on request type
		if ((type === "path" || type === "dep-path") && typeof value !== "string") {
			throw new Error(`Request type '${type}' requires value to be a string`);
		}

		this.type = type;
		this.value = value;
	}

	/**
	 * Create a canonical string representation for comparison
	 *
	 * @returns {string} Canonical key in format "type:value" or "type:[pattern1,pattern2,...]"
	 */
	toKey() {
		if (Array.isArray(this.value)) {
			return `${this.type}:${JSON.stringify(this.value)}`;
		}
		return `${this.type}:${this.value}`;
	}

	/**
	 * Create Request from key string
	 *
	 * @param {string} key - Key in format "type:value" or "type:[...]"
	 * @returns {Request} Request instance
	 */
	static fromKey(key) {
		const colonIndex = key.indexOf(":");
		const type = key.substring(0, colonIndex);
		const valueStr = key.substring(colonIndex + 1);

		// Check if value is a JSON array
		if (valueStr.startsWith("[")) {
			const value = JSON.parse(valueStr);
			return new Request(type, value);
		}

		return new Request(type, valueStr);
	}

	/**
	 * Check equality with another Request
	 *
	 * @param {Request} other - Request to compare with
	 * @returns {boolean} True if requests are equal
	 */
	equals(other) {
		if (this.type !== other.type) {
			return false;
		}

		if (Array.isArray(this.value) && Array.isArray(other.value)) {
			if (this.value.length !== other.value.length) {
				return false;
			}
			return this.value.every((val, idx) => val === other.value[idx]);
		}

		return this.value === other.value;
	}
}

/**
 * Node in the request set graph
 */
class RequestSetNode {
	/**
	 * @param {number} id - Unique node identifier
	 * @param {number|null} parent - Parent node ID or null
	 * @param {Request[]} addedRequests - Requests added in this node (delta)
	 * @param {*} metadata - Associated metadata
	 */
	constructor(id, parent = null, addedRequests = [], metadata = {}) {
		this.id = id;
		this.parent = parent; // NodeId or null
		this.addedRequests = new Set(addedRequests.map((r) => r.toKey()));
		this.metadata = metadata;

		// Cached materialized set (lazy computed)
		this._fullSetCache = null;
		this._cacheValid = false;
	}

	/**
	 * Get the full materialized set of requests for this node
	 *
	 * @param {ResourceRequestGraph} graph - The graph containing this node
	 * @returns {Set<string>} Set of request keys
	 */
	getMaterializedSet(graph) {
		if (this._cacheValid && this._fullSetCache !== null) {
			return new Set(this._fullSetCache);
		}

		const result = new Set();
		let current = this;

		// Walk up parent chain, collecting all added requests
		while (current !== null) {
			for (const requestKey of current.addedRequests) {
				result.add(requestKey);
			}
			current = current.parent ? graph.getNode(current.parent) : null;
		}

		// Cache the result
		this._fullSetCache = result;
		this._cacheValid = true;

		return new Set(result);
	}

	/**
	 * Invalidate cache (called when graph structure changes)
	 */
	invalidateCache() {
		this._cacheValid = false;
		this._fullSetCache = null;
	}

	/**
	 * Get full set as Request objects
	 *
	 * @param {ResourceRequestGraph} graph - The graph containing this node
	 * @returns {Request[]} Array of Request objects
	 */
	getMaterializedRequests(graph) {
		const keys = this.getMaterializedSet(graph);
		return Array.from(keys).map((key) => Request.fromKey(key));
	}

	/**
	 * Get only the requests added in this node (delta, not including parent requests)
	 *
	 * @returns {Request[]} Array of Request objects added in this node
	 */
	getAddedRequests() {
		return Array.from(this.addedRequests).map((key) => Request.fromKey(key));
	}

	getParentId() {
		return this.parent;
	}
}

/**
 * Graph managing request set nodes with delta encoding
 */
export default class ResourceRequestGraph {
	constructor() {
		this.nodes = new Map(); // nodeId -> RequestSetNode
		this.nextId = 1;
	}

	/**
	 * Get a node by ID
	 *
	 * @param {number} nodeId - Node identifier
	 * @returns {RequestSetNode|undefined} The node or undefined if not found
	 */
	getNode(nodeId) {
		return this.nodes.get(nodeId);
	}

	/**
	 * Get all node IDs
	 *
	 * @returns {number[]} Array of all node IDs
	 */
	getAllNodeIds() {
		return Array.from(this.nodes.keys());
	}

	/**
	 * Find the best parent for a new request set using greedy selection
	 *
	 * @param {Request[]} requestSet - Array of Request objects
	 * @returns {{parentId: number, deltaSize: number}|null} Parent info or null if no suitable parent
	 */
	findBestParent(requestSet) {
		if (this.nodes.size === 0) {
			return null;
		}

		const requestKeys = new Set(requestSet.map((r) => r.toKey()));
		let bestParent = null;
		let smallestDelta = Infinity;

		// Compare against all existing nodes
		for (const [nodeId, node] of this.nodes) {
			const nodeSet = node.getMaterializedSet(this);

			// Calculate how many new requests would need to be added
			const delta = this._calculateDelta(requestKeys, nodeSet);

			// We want the parent that minimizes the delta (maximum overlap)
			if (delta < smallestDelta) {
				smallestDelta = delta;
				bestParent = nodeId;
			}
		}

		return bestParent !== null ? {parentId: bestParent, deltaSize: smallestDelta} : null;
	}

	/**
	 * Calculate the size of the delta (requests in newSet not in existingSet)
	 *
	 * @param {Set<string>} newSetKeys - Set of request keys
	 * @param {Set<string>} existingSetKeys - Set of existing request keys
	 * @returns {number} Number of requests in newSet not in existingSet
	 */
	_calculateDelta(newSetKeys, existingSetKeys) {
		let deltaCount = 0;
		for (const key of newSetKeys) {
			if (!existingSetKeys.has(key)) {
				deltaCount++;
			}
		}
		return deltaCount;
	}

	/**
	 * Calculate which requests need to be added (delta)
	 *
	 * @param {Request[]} newRequestSet - New request set
	 * @param {Set<string>} parentSet - Parent's materialized set (keys)
	 * @returns {Request[]} Array of requests to add
	 */
	_calculateAddedRequests(newRequestSet, parentSet) {
		const newKeys = new Set(newRequestSet.map((r) => r.toKey()));
		const addedKeys = [];

		for (const key of newKeys) {
			if (!parentSet.has(key)) {
				addedKeys.push(key);
			}
		}

		return addedKeys.map((key) => Request.fromKey(key));
	}

	/**
	 * Add a new request set to the graph
	 *
	 * @param {Request[]} requests - Array of Request objects
	 * @param {*} metadata - Optional metadata to store with this node
	 * @returns {number} The new node ID
	 */
	addRequestSet(requests, metadata = null) {
		const nodeId = this.nextId++;

		// Find best parent
		const parentInfo = this.findBestParent(requests);

		if (parentInfo === null) {
			// No existing nodes, or no suitable parent - create root node
			const node = new RequestSetNode(nodeId, null, requests, metadata);
			this.nodes.set(nodeId, node);
			return nodeId;
		}

		// Create node with delta from best parent
		const parentNode = this.getNode(parentInfo.parentId);
		const parentSet = parentNode.getMaterializedSet(this);
		const addedRequests = this._calculateAddedRequests(requests, parentSet);

		const node = new RequestSetNode(nodeId, parentInfo.parentId, addedRequests, metadata);
		this.nodes.set(nodeId, node);

		return nodeId;
	}

	/**
	 * Find the best matching node for a query request set
	 * Returns the node ID where the node's set is a subset of the query
	 * and is maximal (largest subset match)
	 *
	 * @param {Request[]} queryRequests - Array of Request objects to match
	 * @returns {number|null} Node ID of best match, or null if no match found
	 */
	findBestMatch(queryRequests) {
		const queryKeys = new Set(queryRequests.map((r) => r.toKey()));

		let bestMatch = null;
		let bestMatchSize = -1;

		for (const [nodeId, node] of this.nodes) {
			const nodeSet = node.getMaterializedSet(this);

			// Check if nodeSet is a subset of queryKeys
			const isSubset = this._isSubset(nodeSet, queryKeys);

			if (isSubset && nodeSet.size > bestMatchSize) {
				bestMatch = nodeId;
				bestMatchSize = nodeSet.size;
			}
		}

		return bestMatch;
	}

	/**
	 * Find a node with an identical request set
	 *
	 * @param {Request[]} requests - Array of Request objects
	 * @returns {number|null} Node ID of exact match, or null if no match found
	 */
	findExactMatch(requests) {
		// Convert to request keys for comparison
		const queryKeys = new Set(requests.map((req) => new Request(req.type, req.value).toKey()));

		// Must have same size to be identical
		const querySize = queryKeys.size;

		for (const [nodeId, node] of this.nodes) {
			const nodeSet = node.getMaterializedSet(this);

			// Quick size check first
			if (nodeSet.size !== querySize) {
				continue;
			}

			// Check if sets are identical (same size + subset = equality)
			if (this._isSubset(nodeSet, queryKeys)) {
				return nodeId;
			}
		}

		return null;
	}

	/**
	 * Check if setA is a subset of setB
	 *
	 * @param {Set<string>} setA - First set
	 * @param {Set<string>} setB - Second set
	 * @returns {boolean} True if setA is a subset of setB
	 */
	_isSubset(setA, setB) {
		for (const item of setA) {
			if (!setB.has(item)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Get metadata associated with a node
	 *
	 * @param {number} nodeId - Node identifier
	 * @returns {*} Metadata or null if node not found
	 */
	getMetadata(nodeId) {
		const node = this.getNode(nodeId);
		return node ? node.metadata : null;
	}

	/**
	 * Update metadata for a node
	 *
	 * @param {number} nodeId - Node identifier
	 * @param {*} metadata - New metadata value
	 */
	setMetadata(nodeId, metadata) {
		const node = this.getNode(nodeId);
		if (node) {
			node.metadata = metadata;
		}
	}

	/**
	 * Get a set containing all unique requests across all nodes in the graph
	 *
	 * @returns {Request[]} Array of all unique Request objects in the graph
	 */
	getAllRequests() {
		const allRequestKeys = new Set();

		for (const node of this.nodes.values()) {
			const nodeSet = node.getMaterializedSet(this);
			for (const key of nodeSet) {
				allRequestKeys.add(key);
			}
		}

		return Array.from(allRequestKeys).map((key) => Request.fromKey(key));
	}

	/**
	 * Get statistics about the graph
	 */
	getStats() {
		let totalRequests = 0;
		let totalStoredDeltas = 0;
		const depths = [];

		for (const node of this.nodes.values()) {
			totalRequests += node.getMaterializedSet(this).size;
			totalStoredDeltas += node.addedRequests.size;

			// Calculate depth
			let depth = 0;
			let current = node;
			while (current.parent !== null) {
				depth++;
				current = this.getNode(current.parent);
			}
			depths.push(depth);
		}

		return {
			nodeCount: this.nodes.size,
			averageRequestsPerNode: this.nodes.size > 0 ? totalRequests / this.nodes.size : 0,
			averageStoredDeltaSize: this.nodes.size > 0 ? totalStoredDeltas / this.nodes.size : 0,
			averageDepth: depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0,
			maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
			compressionRatio: totalRequests > 0 ? totalStoredDeltas / totalRequests : 1
		};
	}

	/**
	 * Iterate through nodes in breadth-first order (by depth level).
	 * Parents are always yielded before their children, allowing efficient traversal
	 * where you can check parent nodes first and only examine deltas of subtrees as needed.
	 *
	 * @yields {{nodeId: number, node: RequestSetNode, depth: number, parentId: number|null}}
	 * 	Node information including ID, node instance, depth level, and parent ID
	 *
	 * @example
	 * // Traverse all nodes, checking parents before children
	 * for (const {nodeId, node, depth, parentId} of graph.traverseByDepth()) {
	 *   const delta = node.getAddedRequests();
	 *   const fullSet = node.getMaterializedRequests(graph);
	 *   console.log(`Node ${nodeId} at depth ${depth}: +${delta.length} requests`);
	 * }
	 *
	 * @example
	 * // Early termination: find first matching node without processing children
	 * for (const {nodeId, node} of graph.traverseByDepth()) {
	 *   if (nodeMatchesQuery(node)) {
	 *     console.log(`Found match at node ${nodeId}`);
	 *     break; // Stop traversal
	 *   }
	 * }
	 */
	* traverseByDepth() {
		if (this.nodes.size === 0) {
			return;
		}

		// Build children map for efficient traversal
		const childrenMap = new Map(); // parentId -> [childIds]
		const rootNodes = [];

		for (const [nodeId, node] of this.nodes) {
			if (node.parent === null) {
				rootNodes.push(nodeId);
			} else {
				if (!childrenMap.has(node.parent)) {
					childrenMap.set(node.parent, []);
				}
				childrenMap.get(node.parent).push(nodeId);
			}
		}

		// Breadth-first traversal using a queue
		const queue = rootNodes.map((nodeId) => ({nodeId, depth: 0}));

		while (queue.length > 0) {
			const {nodeId, depth} = queue.shift();
			const node = this.getNode(nodeId);

			// Yield current node
			yield {
				nodeId,
				node,
				depth,
				parentId: node.parent
			};

			// Enqueue children for next depth level
			const children = childrenMap.get(nodeId);
			if (children) {
				for (const childId of children) {
					queue.push({nodeId: childId, depth: depth + 1});
				}
			}
		}
	}

	/**
	 * Iterate through nodes starting from a specific node, traversing its subtree.
	 * Useful for examining only a portion of the graph.
	 *
	 * @param {number} startNodeId - Node ID to start traversal from
	 * @yields {{nodeId: number, node: RequestSetNode, depth: number, parentId: number|null}}
	 * 	Node information including ID, node instance, relative depth from start, and parent ID
	 *
	 * @example
	 * // Traverse only the subtree under a specific node
	 * const matchNodeId = graph.findBestMatch(query);
	 * for (const {nodeId, node, depth} of graph.traverseSubtree(matchNodeId)) {
	 *   console.log(`Processing node ${nodeId} at relative depth ${depth}`);
	 * }
	 */
	* traverseSubtree(startNodeId) {
		const startNode = this.getNode(startNodeId);
		if (!startNode) {
			return;
		}

		// Build children map
		const childrenMap = new Map();
		for (const [nodeId, node] of this.nodes) {
			if (node.parent !== null) {
				if (!childrenMap.has(node.parent)) {
					childrenMap.set(node.parent, []);
				}
				childrenMap.get(node.parent).push(nodeId);
			}
		}

		// Breadth-first traversal starting from the specified node
		const queue = [{nodeId: startNodeId, depth: 0}];

		while (queue.length > 0) {
			const {nodeId, depth} = queue.shift();
			const node = this.getNode(nodeId);

			yield {
				nodeId,
				node,
				depth,
				parentId: node.parent
			};

			// Enqueue children
			const children = childrenMap.get(nodeId);
			if (children) {
				for (const childId of children) {
					queue.push({nodeId: childId, depth: depth + 1});
				}
			}
		}
	}

	/**
	 * Get all children node IDs for a given parent node
	 *
	 * @param {number} parentId - Parent node identifier
	 * @returns {number[]} Array of child node IDs
	 */
	getChildren(parentId) {
		const children = [];
		for (const [nodeId, node] of this.nodes) {
			if (node.parent === parentId) {
				children.push(nodeId);
			}
		}
		return children;
	}

	/**
	 * Export graph structure for serialization
	 *
	 * @returns {{nodes: Array<{id: number, parent: number|null, addedRequests: string[]}>, nextId: number}}
	 * 	Graph structure with metadata
	 */
	toCacheObject() {
		const nodes = [];

		for (const [nodeId, node] of this.nodes) {
			nodes.push({
				id: nodeId,
				parent: node.parent,
				addedRequests: Array.from(node.addedRequests)
			});
		}

		return {nodes, nextId: this.nextId};
	}

	/**
	 * Create a graph from JSON structure (as produced by toCacheObject)
	 *
	 * @param {{nodes: Array<{id: number, parent: number|null, addedRequests: string[]}>, nextId: number}} metadata
	 * 	JSON representation of the graph
	 * @returns {ResourceRequestGraph} Reconstructed graph instance
	 */
	static fromCacheObject(metadata) {
		const graph = new ResourceRequestGraph();

		// Restore nextId
		graph.nextId = metadata.nextId;

		// Recreate all nodes
		for (const nodeData of metadata.nodes) {
			const {id, parent, addedRequests} = nodeData;

			// Convert request keys back to Request instances
			const requestInstances = addedRequests.map((key) => Request.fromKey(key));

			// Create node directly
			const node = new RequestSetNode(id, parent, requestInstances);
			graph.nodes.set(id, node);
		}

		return graph;
	}
}

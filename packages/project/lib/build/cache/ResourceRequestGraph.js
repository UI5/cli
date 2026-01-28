const ALLOWED_REQUEST_TYPES = new Set(["path", "patterns"]);

/**
 * Represents a single resource request with type and value
 *
 * A request can be either a path-based request (single resource) or a pattern-based
 * request (multiple resources via glob patterns).
 *
 * @class
 */
export class Request {
	/**
	 * Creates a new Request instance
	 *
	 * @public
	 * @param {string} type Either 'path' or 'patterns'
	 * @param {string|string[]} value The request value (string for path, array for patterns)
	 * @throws {Error} If type is invalid or value type doesn't match request type
	 */
	constructor(type, value) {
		if (!ALLOWED_REQUEST_TYPES.has(type)) {
			throw new Error(`Invalid request type: ${type}`);
		}

		// Validate value type based on request type
		if (type === "path" && typeof value !== "string") {
			throw new Error(`Request type '${type}' requires value to be a string`);
		}

		this.type = type;
		this.value = value;
	}

	/**
	 * Creates a canonical string representation for comparison
	 *
	 * Converts the request to a unique key string that can be used for equality
	 * checks and set operations.
	 *
	 * @public
	 * @returns {string} Canonical key in format "type:value" or "type:[pattern1,pattern2,...]"
	 */
	toKey() {
		if (Array.isArray(this.value)) {
			return `${this.type}:${JSON.stringify(this.value)}`;
		}
		return `${this.type}:${this.value}`;
	}

	/**
	 * Creates a Request instance from a key string
	 *
	 * Inverse operation of toKey(), reconstructing a Request from its string representation.
	 *
	 * @public
	 * @param {string} key Key in format "type:value" or "type:[...]"
	 * @returns {Request} Reconstructed Request instance
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
	 * Checks equality with another Request
	 *
	 * Compares both type and value, handling array values correctly.
	 *
	 * @public
	 * @param {Request} other Request to compare with
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
 * Represents a node in the request set graph
 *
 * Each node stores a delta of requests added at this level, with an optional parent
 * reference. The full request set is computed by traversing up the parent chain.
 * This enables efficient storage through delta encoding.
 *
 * @class
 */
class RequestSetNode {
	/**
	 * Creates a new RequestSetNode instance
	 *
	 * @param {number} id Unique node identifier
	 * @param {number|null} [parent=null] Parent node ID or null for root nodes
	 * @param {Request[]} [addedRequests=[]] Requests added in this node (delta from parent)
	 * @param {*} [metadata={}] Associated metadata
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
	 * Gets the full materialized set of requests for this node
	 *
	 * Computes the complete set of requests by traversing up the parent chain
	 * and collecting all added requests. Results are cached for performance.
	 *
	 * @param {ResourceRequestGraph} graph The graph containing this node
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
	 * Invalidates the materialized set cache
	 *
	 * Should be called when the graph structure changes to ensure the cached
	 * materialized set is recomputed on next access.
	 */
	invalidateCache() {
		this._cacheValid = false;
		this._fullSetCache = null;
	}

	/**
	 * Gets the full set of requests as Request objects
	 *
	 * Similar to getMaterializedSet but returns Request instances instead of keys.
	 *
	 * @param {ResourceRequestGraph} graph The graph containing this node
	 * @returns {Request[]} Array of Request objects
	 */
	getMaterializedRequests(graph) {
		const keys = this.getMaterializedSet(graph);
		return Array.from(keys).map((key) => Request.fromKey(key));
	}

	/**
	 * Gets only the requests added in this node (delta)
	 *
	 * Returns the requests added at this level, not including parent requests.
	 * This is the delta that was stored in the node.
	 *
	 * @returns {Request[]} Array of Request objects added in this node
	 */
	getAddedRequests() {
		return Array.from(this.addedRequests).map((key) => Request.fromKey(key));
	}

	/**
	 * Gets the parent node ID
	 *
	 * @returns {number|null} Parent node ID or null if this is a root node
	 */
	getParentId() {
		return this.parent;
	}
}

/**
 * Graph managing request set nodes with delta encoding
 *
 * This graph structure optimizes storage of multiple related request sets by using
 * delta encoding - each node stores only the requests added relative to its parent.
 * This is particularly efficient when request sets have significant overlap.
 *
 * The graph automatically finds the best parent for new request sets to minimize
 * the delta size and maintain efficient storage.
 *
 * @class
 */
export default class ResourceRequestGraph {
	/**
	 * Creates a new ResourceRequestGraph instance
	 *
	 * @public
	 */
	constructor() {
		this.nodes = new Map(); // nodeId -> RequestSetNode
		this.nextId = 1;
	}

	/**
	 * Gets a node by ID
	 *
	 * @public
	 * @param {number} nodeId Node identifier
	 * @returns {RequestSetNode|undefined} The node or undefined if not found
	 */
	getNode(nodeId) {
		return this.nodes.get(nodeId);
	}

	/**
	 * Gets all node IDs in the graph
	 *
	 * @public
	 * @returns {number[]} Array of all node IDs
	 */
	getAllNodeIds() {
		return Array.from(this.nodes.keys());
	}

	/**
	 * Calculates which requests need to be added (delta)
	 *
	 * Determines the difference between a new request set and a parent's materialized set,
	 * returning only the requests that need to be stored in the delta.
	 *
	 * @param {Request[]} newRequestSet New request set
	 * @param {Set<string>} parentSet Parent's materialized set (as keys)
	 * @returns {Request[]} Array of requests to add
	 */
	_calculateAddedRequests(newRequestSet, parentSet) {
		const newKeys = new Set(newRequestSet.map((r) => r.toKey()));
		const addedKeys = newKeys.difference(parentSet);

		return Array.from(addedKeys).map((key) => Request.fromKey(key));
	}

	/**
	 * Adds a new request set to the graph
	 *
	 * Automatically finds the best parent node (largest subset) and stores only
	 * the delta of requests. If no suitable parent is found, creates a root node.
	 *
	 * @public
	 * @param {Request[]} requests Array of Request objects
	 * @param {*} [metadata=null] Optional metadata to store with this node
	 * @returns {number} The new node ID
	 */
	addRequestSet(requests, metadata = null) {
		const nodeId = this.nextId++;

		// Find best parent
		const parentId = this.findBestParent(requests);

		if (parentId === null) {
			// No existing nodes, or no suitable parent - create root node
			const node = new RequestSetNode(nodeId, null, requests, metadata);
			this.nodes.set(nodeId, node);
			return nodeId;
		}

		// Create node with delta from best parent
		const parentNode = this.getNode(parentId);
		const parentSet = parentNode.getMaterializedSet(this);
		const addedRequests = this._calculateAddedRequests(requests, parentSet);

		const node = new RequestSetNode(nodeId, parentId, addedRequests, metadata);
		this.nodes.set(nodeId, node);

		return nodeId;
	}

	/**
	 * Finds the best parent for a new request set
	 *
	 * Searches for the existing node with the largest subset of the new request set.
	 * This minimizes the delta size and optimizes storage efficiency.
	 *
	 * @public
	 * @param {Request[]} requestSet Array of Request objects
	 * @returns {number|null} Parent node ID or null if no suitable parent exists
	 */
	findBestParent(requestSet) {
		if (this.nodes.size === 0) {
			return null;
		}

		const queryKeys = new Set(requestSet.map((r) => r.toKey()));
		let bestParent = null;
		let greatestSubset = -1;

		// Compare against all existing nodes
		for (const [nodeId, node] of this.nodes) {
			const nodeSet = node.getMaterializedSet(this);

			// Check if nodeSet is a subset of queryKeys
			const isSubset = nodeSet.isSubsetOf(queryKeys);

			// We want the parent the greatest overlap
			if (isSubset && nodeSet.size > greatestSubset) {
				bestParent = nodeId;
				greatestSubset = nodeSet.size;
			}
		}

		return bestParent;
	}

	/**
	 * Finds a node with an identical request set
	 *
	 * Searches for an existing node whose materialized request set exactly matches
	 * the given request set. Used to avoid creating duplicate nodes.
	 *
	 * @public
	 * @param {Request[]} requests Array of Request objects
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
			if (nodeSet.isSubsetOf(queryKeys)) {
				return nodeId;
			}
		}

		return null;
	}

	/**
	 * Gets metadata associated with a node
	 *
	 * @public
	 * @param {number} nodeId Node identifier
	 * @returns {*} Metadata or null if node not found
	 */
	getMetadata(nodeId) {
		const node = this.getNode(nodeId);
		return node ? node.metadata : null;
	}

	/**
	 * Updates metadata for a node
	 *
	 * @public
	 * @param {number} nodeId Node identifier
	 * @param {*} metadata New metadata value
	 */
	setMetadata(nodeId, metadata) {
		const node = this.getNode(nodeId);
		if (node) {
			node.metadata = metadata;
		}
	}

	/**
	 * Gets all unique requests across all nodes in the graph
	 *
	 * Collects the union of all materialized request sets from every node.
	 *
	 * @public
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
	 * Gets statistics about the graph structure
	 *
	 * Provides metrics about the graph's efficiency, including node count,
	 * average requests per node, storage overhead, and tree depth statistics.
	 *
	 * @public
	 * @returns {object} Statistics object
	 * @returns {number} return.nodeCount Total number of nodes
	 * @returns {number} return.averageRequestsPerNode Average materialized requests per node
	 * @returns {number} return.averageStoredDeltaSize Average stored delta size per node
	 * @returns {number} return.averageDepth Average depth in the tree
	 * @returns {number} return.maxDepth Maximum depth in the tree
	 * @returns {number} return.compressionRatio Ratio of stored deltas to total requests (lower is better)
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
	 * Gets the number of nodes in the graph
	 *
	 * @public
	 * @returns {number} Node count
	 */
	getSize() {
		return this.nodes.size;
	}

	/**
	 * Iterates through nodes in breadth-first order (by depth level)
	 *
	 * Parents are always yielded before their children, allowing efficient traversal
	 * where you can check parent nodes first and only examine deltas of subtrees as needed.
	 *
	 * @public
	 * @generator
	 * @yields {object} Node information
	 * @yields {number} return.nodeId Node identifier
	 * @yields {RequestSetNode} return.node Node instance
	 * @yields {number} return.depth Depth level in the tree
	 * @yields {number|null} return.parentId Parent node ID or null for root nodes
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
	 * Iterates through nodes starting from a specific node, traversing its subtree
	 *
	 * Useful for examining only a portion of the graph rooted at a particular node.
	 *
	 * @public
	 * @generator
	 * @param {number} startNodeId Node ID to start traversal from
	 * @yields {object} Node information
	 * @yields {number} return.nodeId Node identifier
	 * @yields {RequestSetNode} return.node Node instance
	 * @yields {number} return.depth Relative depth from the start node
	 * @yields {number|null} return.parentId Parent node ID or null
	 *
	 * @example
	 * // Traverse only the subtree under a specific node
	 * const matchNodeId = graph.findBestParent(query);
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
	 * Gets all children node IDs for a given parent node
	 *
	 * @public
	 * @param {number} parentId Parent node identifier
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
	 * Exports graph structure for serialization
	 *
	 * Converts the graph to a plain object suitable for JSON serialization.
	 * Metadata is not included in the export and must be handled separately.
	 *
	 * @public
	 * @returns {object} Graph structure
	 * @returns {Array<object>} return.nodes Array of node objects with id, parent, and addedRequests
	 * @returns {number} return.nextId Next available node ID
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
	 * Creates a graph from a serialized cache object
	 *
	 * Reconstructs the graph structure from a plain object produced by toCacheObject().
	 * Metadata must be restored separately if needed.
	 *
	 * @public
	 * @param {object} metadata Serialized graph structure
	 * @param {Array<object>} metadata.nodes Array of node objects with id, parent, and addedRequests
	 * @param {number} metadata.nextId Next available node ID
	 * @returns {ResourceRequestGraph} Reconstructed graph instance
	 */
	static fromCache(metadata) {
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

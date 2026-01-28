import test from "ava";
import ResourceRequestGraph, {Request} from "../../../../lib/build/cache/ResourceRequestGraph.js";

// Request Class Tests
test("Request: Create path request", (t) => {
	const request = new Request("path", "a.js");
	t.is(request.type, "path");
	t.is(request.value, "a.js");
});

test("Request: Create patterns request", (t) => {
	const request = new Request("patterns", ["*.js", "*.css"]);
	t.is(request.type, "patterns");
	t.deepEqual(request.value, ["*.js", "*.css"]);
});

test("Request: Reject invalid type", (t) => {
	const error = t.throws(() => {
		new Request("invalid-type", "value");
	}, {instanceOf: Error});
	t.is(error.message, "Invalid request type: invalid-type");
});

test("Request: Reject non-string value for path type", (t) => {
	const error = t.throws(() => {
		new Request("path", ["array", "value"]);
	}, {instanceOf: Error});
	t.is(error.message, "Request type 'path' requires value to be a string");
});

test("Request: toKey with string value", (t) => {
	const request = new Request("path", "a.js");
	t.is(request.toKey(), "path:a.js");
});

test("Request: toKey with array value", (t) => {
	const request = new Request("patterns", ["*.js", "*.css"]);
	t.is(request.toKey(), "patterns:[\"*.js\",\"*.css\"]");
});

test("Request: fromKey with string value", (t) => {
	const request = Request.fromKey("path:a.js");
	t.is(request.type, "path");
	t.is(request.value, "a.js");
});

test("Request: fromKey with array value", (t) => {
	const request = Request.fromKey("patterns:[\"*.js\",\"*.css\"]");
	t.is(request.type, "patterns");
	t.deepEqual(request.value, ["*.js", "*.css"]);
});

test("Request: equals returns true for identical requests", (t) => {
	const req1 = new Request("path", "a.js");
	const req2 = new Request("path", "a.js");
	t.true(req1.equals(req2));
});

test("Request: equals returns false for different values", (t) => {
	const req1 = new Request("path", "a.js");
	const req2 = new Request("path", "b.js");
	t.false(req1.equals(req2));
});

test("Request: equals returns true for identical array values", (t) => {
	const req1 = new Request("patterns", ["*.js", "*.css"]);
	const req2 = new Request("patterns", ["*.js", "*.css"]);
	t.true(req1.equals(req2));
});

test("Request: equals returns false for different array lengths", (t) => {
	const req1 = new Request("patterns", ["*.js", "*.css"]);
	const req2 = new Request("patterns", ["*.js"]);
	t.false(req1.equals(req2));
});

test("Request: equals returns false for different array values", (t) => {
	const req1 = new Request("patterns", ["*.js", "*.css"]);
	const req2 = new Request("patterns", ["*.js", "*.html"]);
	t.false(req1.equals(req2));
});

// ResourceRequestGraph Tests
test("ResourceRequestGraph: Initialize empty graph", (t) => {
	const graph = new ResourceRequestGraph();
	t.is(graph.nodes.size, 0);
	t.is(graph.nextId, 1);
});

test("ResourceRequestGraph: Add first request set (root node)", (t) => {
	const graph = new ResourceRequestGraph();
	const requests = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const nodeId = graph.addRequestSet(requests, {result: "xyz-1"});

	t.is(nodeId, 1);
	t.is(graph.nodes.size, 1);

	const node = graph.getNode(nodeId);
	t.is(node.id, 1);
	t.is(node.parent, null);
	t.is(node.addedRequests.size, 2);
	t.deepEqual(node.metadata, {result: "xyz-1"});
});

test("ResourceRequestGraph: Add request set with parent relationship", (t) => {
	const graph = new ResourceRequestGraph();

	// Add first request set
	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const node1 = graph.addRequestSet(set1, {result: "xyz-1"});

	// Add second request set (superset of first)
	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const node2 = graph.addRequestSet(set2, {result: "xyz-2"});

	// Verify parent relationship
	const node2Data = graph.getNode(node2);
	t.is(node2Data.parent, node1);
	t.is(node2Data.addedRequests.size, 1);
	t.true(node2Data.addedRequests.has("path:c.js"));
});

test("ResourceRequestGraph: Add request set with no overlap", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const set2 = [new Request("path", "x.js")];
	const node2 = graph.addRequestSet(set2);

	const node2Data = graph.getNode(node2);
	t.falsy(node2Data.parent);
	t.is(node2Data.addedRequests.size, 1);
	t.true(node2Data.addedRequests.has("path:x.js"));
});

test("ResourceRequestGraph: getMaterializedRequests returns full set", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1);

	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const node2 = graph.addRequestSet(set2);

	const node2Data = graph.getNode(node2);
	const materialized = node2Data.getMaterializedRequests(graph);

	t.is(materialized.length, 3);
	const keys = materialized.map((r) => r.toKey()).sort();
	t.deepEqual(keys, ["path:a.js", "path:b.js", "path:c.js"]);
});

test("ResourceRequestGraph: getAddedRequests returns only delta", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1);

	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const node2 = graph.addRequestSet(set2);

	const node2Data = graph.getNode(node2);
	const added = node2Data.getAddedRequests();

	t.is(added.length, 1);
	t.is(added[0].toKey(), "path:c.js");
});

test("ResourceRequestGraph: findBestParent returns node with largest subset", (t) => {
	const graph = new ResourceRequestGraph();

	// Add first request set
	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1, {result: "xyz-1"});

	// Add second request set (superset)
	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const node2 = graph.addRequestSet(set2, {result: "xyz-2"});

	// Query that contains set2
	const query = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js"),
		new Request("path", "x.js")
	];
	const match = graph.findBestParent(query);

	// Should return node2 (largest subset: 3 items)
	t.is(match, node2);
});

test("ResourceRequestGraph: findBestParent returns null when no subset found", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1);

	// Query with no overlap
	const query = [
		new Request("path", "x.js"),
		new Request("path", "y.js")
	];
	const match = graph.findBestParent(query);

	t.is(match, null);
});

test("ResourceRequestGraph: findExactMatch returns node with identical set", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const node1 = graph.addRequestSet(set1);

	const query = [
		new Request("path", "b.js"),
		new Request("path", "a.js") // Different order, but same set
	];
	const match = graph.findExactMatch(query);

	t.is(match, node1);
});

test("ResourceRequestGraph: findExactMatch returns null for subset", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	graph.addRequestSet(set1);

	const query = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const match = graph.findExactMatch(query);

	t.is(match, null);
});

test("ResourceRequestGraph: findExactMatch returns null for superset", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1);

	const query = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const match = graph.findExactMatch(query);

	t.is(match, null);
});

test("ResourceRequestGraph: getMetadata returns stored metadata", (t) => {
	const graph = new ResourceRequestGraph();
	const metadata = {result: "xyz", cached: true};

	const set1 = [new Request("path", "a.js")];
	const nodeId = graph.addRequestSet(set1, metadata);

	const retrieved = graph.getMetadata(nodeId);
	t.deepEqual(retrieved, metadata);
});

test("ResourceRequestGraph: getMetadata returns null for non-existent node", (t) => {
	const graph = new ResourceRequestGraph();
	const retrieved = graph.getMetadata(999);
	t.is(retrieved, null);
});

test("ResourceRequestGraph: setMetadata updates metadata", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	const nodeId = graph.addRequestSet(set1, {original: true});

	graph.setMetadata(nodeId, {updated: true});

	const retrieved = graph.getMetadata(nodeId);
	t.deepEqual(retrieved, {updated: true});
});

test("ResourceRequestGraph: getAllNodeIds returns all node IDs", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	const node1 = graph.addRequestSet(set1);

	const set2 = [new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2);

	const ids = graph.getAllNodeIds();
	t.is(ids.length, 2);
	t.true(ids.includes(node1));
	t.true(ids.includes(node2));
});

test("ResourceRequestGraph: getAllRequests returns all unique requests", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1);

	const set2 = [
		new Request("path", "a.js"), // Duplicate
		new Request("path", "c.js")
	];
	graph.addRequestSet(set2);

	const allRequests = graph.getAllRequests();
	const keys = allRequests.map((r) => r.toKey()).sort();

	// Should have 3 unique requests
	t.is(keys.length, 3);
	t.deepEqual(keys, ["path:a.js", "path:b.js", "path:c.js"]);
});

test("ResourceRequestGraph: getStats returns correct statistics", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1);

	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	graph.addRequestSet(set2);

	const stats = graph.getStats();

	t.is(stats.nodeCount, 2);
	t.is(stats.averageRequestsPerNode, 2.5); // (2 + 3) / 2
	t.is(stats.averageStoredDeltaSize, 1.5); // (2 + 1) / 2
	t.is(stats.maxDepth, 1); // node2 is at depth 1
	t.is(stats.compressionRatio, 0.6); // 3 stored / 5 total
});

test("ResourceRequestGraph: toCacheObject exports graph structure", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	const node1 = graph.addRequestSet(set1);

	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const node2 = graph.addRequestSet(set2);

	const exported = graph.toCacheObject();

	t.is(exported.nodes.length, 2);
	t.is(exported.nextId, 3);

	const exportedNode1 = exported.nodes.find((n) => n.id === node1);
	t.truthy(exportedNode1);
	t.is(exportedNode1.parent, null);
	t.deepEqual(exportedNode1.addedRequests, ["path:a.js"]);

	const exportedNode2 = exported.nodes.find((n) => n.id === node2);
	t.truthy(exportedNode2);
	t.is(exportedNode2.parent, node1);
	t.deepEqual(exportedNode2.addedRequests, ["path:b.js"]);
});

test("ResourceRequestGraph: fromCache reconstructs graph", (t) => {
	const graph1 = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	const node1 = graph1.addRequestSet(set1);

	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const node2 = graph1.addRequestSet(set2);

	// Export and reconstruct
	const exported = graph1.toCacheObject();
	const graph2 = ResourceRequestGraph.fromCache(exported);

	// Verify reconstruction
	t.is(graph2.nodes.size, 2);
	t.is(graph2.nextId, 3);

	const reconstructedNode1 = graph2.getNode(node1);
	t.truthy(reconstructedNode1);
	t.is(reconstructedNode1.parent, null);
	t.is(reconstructedNode1.addedRequests.size, 1);

	const reconstructedNode2 = graph2.getNode(node2);
	t.truthy(reconstructedNode2);
	t.is(reconstructedNode2.parent, node1);
	t.is(reconstructedNode2.addedRequests.size, 1);

	// Verify materialized sets work correctly
	const materialized = reconstructedNode2.getMaterializedRequests(graph2);
	t.is(materialized.length, 2);
});

test("ResourceRequestGraph: Handles different request types", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("patterns", ["*.js"]),
	];
	const nodeId = graph.addRequestSet(set1);

	const node = graph.getNode(nodeId);
	const materialized = node.getMaterializedRequests(graph);

	t.is(materialized.length, 2);

	const types = materialized.map((r) => r.type).sort();
	t.deepEqual(types, ["path", "patterns"]);
});

test("ResourceRequestGraph: Complex parent hierarchy", (t) => {
	const graph = new ResourceRequestGraph();

	// Level 0: Root with 2 requests
	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const node1 = graph.addRequestSet(set1);

	// Level 1: Add one request
	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const node2 = graph.addRequestSet(set2);

	// Level 2: Add another request
	const set3 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js"),
		new Request("path", "d.js")
	];
	const node3 = graph.addRequestSet(set3);

	// Verify hierarchy
	const node3Data = graph.getNode(node3);
	t.is(node3Data.parent, node2);

	const node2Data = graph.getNode(node2);
	t.is(node2Data.parent, node1);

	const stats = graph.getStats();
	t.is(stats.maxDepth, 2);
});

test("ResourceRequestGraph: findBestParent chooses optimal parent", (t) => {
	const graph = new ResourceRequestGraph();

	// Create two potential parents
	const set1 = [
		new Request("path", "x.js"),
		new Request("path", "y.js")
	];
	graph.addRequestSet(set1);

	const set2 = [
		new Request("path", "x.js"),
		new Request("path", "y.js"),
		new Request("path", "z.js"),
	];
	const node2 = graph.addRequestSet(set2);

	// New set overlaps more with set2
	const set3 = [
		new Request("path", "x.js"),
		new Request("path", "y.js"),
		new Request("path", "z.js"),
		new Request("path", "w.js")
	];
	const node3 = graph.addRequestSet(set3);

	const node3Data = graph.getNode(node3);
	// Should choose node2 as parent (only needs to add 1 request vs 5)
	t.is(node3Data.parent, node2);
	t.is(node3Data.addedRequests.size, 1);
});

test("ResourceRequestGraph: Empty request set", (t) => {
	const graph = new ResourceRequestGraph();

	const nodeId = graph.addRequestSet([]);
	const node = graph.getNode(nodeId);

	t.is(node.addedRequests.size, 0);
	t.is(node.parent, null);
});

test("ResourceRequestGraph: Caching works correctly", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	graph.addRequestSet(set1);

	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const node2 = graph.addRequestSet(set2);

	const node2Data = graph.getNode(node2);

	// First call should compute and cache
	const materialized1 = node2Data.getMaterializedSet(graph);
	t.is(materialized1.size, 3);

	// Second call should use cache (same result)
	const materialized2 = node2Data.getMaterializedSet(graph);
	t.is(materialized2.size, 3);
	t.deepEqual(Array.from(materialized1).sort(), Array.from(materialized2).sort());
});

test("ResourceRequestGraph: Integration", (t) => {
	// Create graph
	const graph = new ResourceRequestGraph();

	// Add first request set
	const set1 = [
		new Request("path", "a.js"),
		new Request("path", "b.js")
	];
	const node1 = graph.addRequestSet(set1, {result: "xyz-1"});
	t.is(node1, 1);

	// Add second request set (superset of first)
	const set2 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	const node2 = graph.addRequestSet(set2, {result: "xyz-2"});
	t.is(node2, 2);

	// Verify parent relationship
	const node2Data = graph.getNode(node2);
	t.is(node2Data.parent, node1);
	t.deepEqual(Array.from(node2Data.addedRequests), ["path:c.js"]);

	// Find best match for a query
	const query = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
	];
	const match = graph.findExactMatch(query);
	t.is(match, node1);

	// Get metadata
	const metadata = graph.getMetadata(match);
	t.deepEqual(metadata, {result: "xyz-1"});

	// Get statistics
	const stats = graph.getStats();
	t.is(stats.nodeCount, 2);
	t.truthy(stats.averageRequestsPerNode);
});

// Traversal Iterator Tests
test("ResourceRequestGraph: traverseByDepth iterates in breadth-first order", (t) => {
	const graph = new ResourceRequestGraph();

	// Create a tree structure:
	//       1 (depth 0)
	//      / \
	//     2   3 (depth 1)
	//    /
	//   4 (depth 2)

	const set1 = [new Request("path", "a.js")];
	const node1 = graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2);

	const set3 = [new Request("path", "a.js"), new Request("path", "c.js")];
	const node3 = graph.addRequestSet(set3);

	const set4 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "d.js")
	];
	const node4 = graph.addRequestSet(set4);

	// Collect traversal results
	const traversal = [];
	for (const {nodeId, depth} of graph.traverseByDepth()) {
		traversal.push({nodeId, depth});
	}

	// Verify: depth 0 node comes first, then depth 1 nodes, then depth 2
	t.is(traversal.length, 4);
	t.is(traversal[0].nodeId, node1);
	t.is(traversal[0].depth, 0);

	// Nodes 2 and 3 should both be at depth 1 (order may vary)
	t.is(traversal[1].depth, 1);
	t.is(traversal[2].depth, 1);
	t.true([node2, node3].includes(traversal[1].nodeId));
	t.true([node2, node3].includes(traversal[2].nodeId));

	// Node 4 should be at depth 2
	t.is(traversal[3].nodeId, node4);
	t.is(traversal[3].depth, 2);
});

test("ResourceRequestGraph: traverseByDepth yields correct node information", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	const node1 = graph.addRequestSet(set1, {meta: "root"});

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2, {meta: "child"});

	const results = Array.from(graph.traverseByDepth());

	t.is(results.length, 2);

	// First node
	t.is(results[0].nodeId, node1);
	t.truthy(results[0].node);
	t.is(results[0].depth, 0);
	t.is(results[0].parentId, null);
	t.deepEqual(results[0].node.metadata, {meta: "root"});

	// Second node
	t.is(results[1].nodeId, node2);
	t.is(results[1].depth, 1);
	t.is(results[1].parentId, node1);
	t.deepEqual(results[1].node.metadata, {meta: "child"});
});

test("ResourceRequestGraph: traverseByDepth handles empty graph", (t) => {
	const graph = new ResourceRequestGraph();
	const results = Array.from(graph.traverseByDepth());
	t.is(results.length, 0);
});

test("ResourceRequestGraph: traverseByDepth handles multiple root nodes", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	// Create a disconnected node by manipulating internal structure
	// Add it without using addRequestSet to avoid automatic parent assignment
	const set2 = [new Request("path", "x.js")];
	const node2 = graph.nextId++;
	const requestSetNode = {
		id: node2,
		parent: null,
		addedRequests: new Set(set2.map((r) => r.toKey())),
		metadata: null,
		_fullSetCache: null,
		_cacheValid: false,
		getMaterializedSet: function(g) {
			return new Set(this.addedRequests);
		},
		getMaterializedRequests: function(g) {
			return Array.from(this.addedRequests).map((key) => Request.fromKey(key));
		},
		getAddedRequests: function() {
			return Array.from(this.addedRequests).map((key) => Request.fromKey(key));
		},
		invalidateCache: function() {
			this._cacheValid = false;
			this._fullSetCache = null;
		}
	};
	graph.nodes.set(node2, requestSetNode);

	const results = Array.from(graph.traverseByDepth());

	// Both roots should be at depth 0
	t.is(results.length, 2);
	t.is(results[0].depth, 0);
	t.is(results[1].depth, 0);
	t.is(results[0].parentId, null);
	t.is(results[1].parentId, null);
});

test("ResourceRequestGraph: traverseByDepth allows early termination", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2);

	const set3 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "c.js")
	];
	graph.addRequestSet(set3);

	// Stop after finding node2
	let count = 0;
	for (const {nodeId} of graph.traverseByDepth()) {
		count++;
		if (nodeId === node2) {
			break;
		}
	}

	// Should have visited 2 nodes, not all 3
	t.is(count, 2);
});

test("ResourceRequestGraph: traverseByDepth allows checking deltas", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	graph.addRequestSet(set2);

	const deltas = [];
	for (const {node} of graph.traverseByDepth()) {
		const delta = node.getAddedRequests();
		deltas.push(delta.map((r) => r.toKey()));
	}

	// First node has 1 request, second node adds 1 request
	t.deepEqual(deltas, [["path:a.js"], ["path:b.js"]]);
});

test("ResourceRequestGraph: traverseSubtree traverses only specified subtree", (t) => {
	const graph = new ResourceRequestGraph();

	// Create structure:
	//     1
	//    / \
	//   2   3
	//  /
	// 4

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2);

	const set3 = [new Request("path", "a.js"), new Request("path", "c.js")];
	graph.addRequestSet(set3);

	const set4 = [
		new Request("path", "a.js"),
		new Request("path", "b.js"),
		new Request("path", "d.js")
	];
	const node4 = graph.addRequestSet(set4);

	// Traverse only subtree starting from node2
	const results = Array.from(graph.traverseSubtree(node2));

	// Should only visit node2 and node4 (not node1 or node3)
	t.is(results.length, 2);
	t.is(results[0].nodeId, node2);
	t.is(results[0].depth, 0); // Relative depth from start
	t.is(results[1].nodeId, node4);
	t.is(results[1].depth, 1);
});

test("ResourceRequestGraph: traverseSubtree with root node traverses entire tree", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	const node1 = graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	graph.addRequestSet(set2);

	const results = Array.from(graph.traverseSubtree(node1));

	// Should visit all nodes
	t.is(results.length, 2);
});

test("ResourceRequestGraph: traverseSubtree handles non-existent node", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const results = Array.from(graph.traverseSubtree(999));
	t.is(results.length, 0);
});

test("ResourceRequestGraph: traverseSubtree handles leaf node", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2);

	// Traverse from leaf node
	const results = Array.from(graph.traverseSubtree(node2));

	// Should only visit the leaf node itself
	t.is(results.length, 1);
	t.is(results[0].nodeId, node2);
	t.is(results[0].depth, 0);
});

test("ResourceRequestGraph: getChildren returns child node IDs", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	const node1 = graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2);

	const set3 = [new Request("path", "a.js"), new Request("path", "c.js")];
	const node3 = graph.addRequestSet(set3);

	const children = graph.getChildren(node1);

	t.is(children.length, 2);
	t.true(children.includes(node2));
	t.true(children.includes(node3));
});

test("ResourceRequestGraph: getChildren returns empty array for leaf nodes", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const set2 = [new Request("path", "a.js"), new Request("path", "b.js")];
	const node2 = graph.addRequestSet(set2);

	const children = graph.getChildren(node2);
	t.is(children.length, 0);
});

test("ResourceRequestGraph: getChildren returns empty array for non-existent node", (t) => {
	const graph = new ResourceRequestGraph();

	const set1 = [new Request("path", "a.js")];
	graph.addRequestSet(set1);

	const children = graph.getChildren(999);
	t.is(children.length, 0);
});

test("ResourceRequestGraph: Efficient traversal use case", (t) => {
	const graph = new ResourceRequestGraph();

	// Simulate real usage: build a graph of resource requests
	const set1 = [new Request("path", "core.js"), new Request("path", "utils.js")];
	const node1 = graph.addRequestSet(set1, {cached: true});

	const set2 = [
		new Request("path", "core.js"),
		new Request("path", "utils.js"),
		new Request("path", "components.js")
	];
	const node2 = graph.addRequestSet(set2, {cached: false});

	// Traverse and collect information
	const visited = [];
	for (const {nodeId, node, depth} of graph.traverseByDepth()) {
		visited.push({
			nodeId,
			depth,
			deltaSize: node.addedRequests.size,
			cached: node.metadata?.cached
		});
	}

	t.is(visited.length, 2);

	// Parent processed first
	t.is(visited[0].nodeId, node1);
	t.is(visited[0].depth, 0);
	t.is(visited[0].deltaSize, 2);
	t.true(visited[0].cached);

	// Child processed second with delta
	t.is(visited[1].nodeId, node2);
	t.is(visited[1].depth, 1);
	t.is(visited[1].deltaSize, 1); // Only added "components.js"
	t.false(visited[1].cached);
});

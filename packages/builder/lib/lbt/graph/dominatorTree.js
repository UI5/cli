import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:graph:dominatorTree");

/**
 * Creates a dependency graph starting from the given set of root modules.
 * An artificial node is added to the graph which depends on all given root modules.
 * The graph is then reduced to its dominator tree (starting with the artificial root node).
 *
 * The algorithm used to calculate the dominator tree is the naive implementation
 * described in https://en.wikipedia.org/wiki/Dominator_(graph_theory) .
 * It has runtime O(n^2) and could be replaced by a more sophisticated one (e.g. Lengauer and Tarjan).
 *
 * @param {object} graph Graph to calculate the DOM tree for
 * @param {Map.<string,Node>} graph.nodes Nodes of the dependency graph
 * @param {Node} graph.n0 Artificial root node
 * @returns {Node} Root node of the dominator tree.
 * @private
 */
function calculateDominatorTree({n0, nodes}) {
	// initialize set of dominators for each node
	for ( const n of nodes.values() ) {
		if ( n === n0 ) {
			// dominator of the start node is the start node itself
			n.dominators = new Set().add(n);
		} else {
			// for all other nodes, set all nodes as the dominators
			n.dominators = new Set(nodes.values()); // set is modified later, therefore each node gets its own copy
		}
	}

	log.verbose(`${nodes.size - 1} modules found, starting dominator tree calculation`);

	function countEdges(nodes) {
		let count = 0;
		for ( const n of nodes.values() ) {
			count += n.dominators.size;
		}
		return count;
	}

	// iteratively eliminate nodes that are not dominators
	let modified;
	do {
		// while changes in any Dom(n)

		if (log.isLevelEnabled("verbose")) {
			log.verbose(`${countEdges(nodes)} remaining edges`);
		}

		modified = false;
		for ( const n of nodes.values() ) {
			if ( n === n0 ) {
				continue; // no processing for the root node
			}
			// Dom(n) = {n} union with intersection over Dom(p) for all p in pred(n) */
			for ( const d of n.dominators ) {
				if ( d === n ) {
					continue; // by definition, n is always a dominator of its own
				}
				// Note: the intersection can only remove items that are currently in the set of
				// dominators of n, it never will add new nodes. Therefore the intersection
				// is implemented by checking each current dominator of n whether it is contained
				// in the dominator sets of all predecessors. If not, it is removed from the
				// set of dominotors of n.
				for ( const p of n.pred ) {
					if ( !p.dominators.has(d) ) {
						n.dominators.delete(d);
						modified = true;
						break;
					}
				}
			}
		}
	} while (modified);

	// build the inverse of the 'strictly-dominated-by' graph ('strictly-dominates' graph)
	for ( const n of nodes.values() ) {
		for ( const d of n.dominators ) {
			if ( d !== n ) { // ignore edge to self ('strict')
				d.succ.add(n);
			}
		}
		n.visited = false;
	}

	log.verbose("Reduce dominator graph to immediate dominator tree");

	// use DFS to reduce the dominator graph to the (immediate) dominator tree
	//
	// When after visiting all dominated nodes (=== 'succ'), one of those nodes is not yet
	// marked as immediately dominated (=== 'visited'), then the current node is the
	// immediate dominator, the corresponding edge is kept (otherwise removed) and the child
	// is marked as 'immediately dominated'
	function dfs(node) {
		// visit children, thereby identifying non-immediately dominated nodes
		for ( const child of node.succ ) {
			if ( !child.visited ) {
				// console.log("visit %s->%s (visited:%s)", node.name, child.name, child.visited);
				dfs(child);
			}
		}
		for ( const child of node.succ ) {
			if ( child.visited ) {
				// console.log("delete %s -> %s", node.name, child.name)
				node.succ.delete(child);
			} else {
				child.visited = true;
			}
		}
	}
	dfs(n0);

	log.verbose("Calculation of dominator tree done");

	return n0;
}

export default calculateDominatorTree;

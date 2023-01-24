import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:graph:dependencyGraph");

class Node {
	constructor(name) {
		this.name = name;
		this.visited = false;
		this.succ = new Set();
		this.pred = new Set();
		this.dominators = null; // TODO not nice to know dominators here
	}
}

/**
 *
 * @param {ResourcePool} pool resource pool
 * @param {Array} roots root elements
 * @param {object} options Options
 * @param {boolean} options.includeConditionalDependencies whether or not to include optional dependencies
 * @returns {Promise<{n0: Node, nodes: Map<any, any>}>}
 */
async function createDependencyGraph(pool, roots, options) {
	const includeConditionalDependencies = options && options.includeConditionalDependencies;

	// create graph representing modules and their dependencies
	const nodes = new Map();

	function visitNode(name) {
		let node = nodes.get(name);
		if ( !node ) {
			nodes.set( name, node = new Node(name) );
		} else if ( node.visited ) {
			return Promise.resolve(node);
		}

		node.visited = true;

		return pool.getModuleInfo( name ).then( (module) => {
			const p = module.dependencies.map( (dep) => {
				if ( includeConditionalDependencies || !module.isConditionalDependency(dep) ) {
					return visitNode(dep).then( (child) => child.pred.add( node ) );
				}
			});
			return Promise.all(p);
		}, (err) => {
			log.error(`Module ${name} not found in pool: ${err.message}`);
		}).then( () => node );
	}

	// create artificial root node and link it with roots
	const n0 = new Node("");
	nodes.set("", n0);
	const p = roots.map( (root) => {
		// console.log("  entry point %s", root.name);
		return visitNode(root.name).then( (child) => child.pred.add( n0 ) );
	});

	return Promise.all(p).then( () => {
		return {
			n0: n0,
			nodes: nodes
		};
	});
}

export default createDependencyGraph;

// TODO introduce class Graph
// TODO remove n0 here, only introduce it in dominator tree (using the Graph API)
// TODO introduce payload for nodes to get rid of visited or dominator

"use strict";

const log = require("@ui5/logger").getLogger("lbt:graph:dependencyGraph");

class Node {
	constructor(name) {
		this.name = name;
		this.visited = false;
		this.succ = new Set();
		this.pred = new Set();
		this.dominators = null; // TODO not nice to know dominators here
	}
}

function createDependencyGraph(pool, roots, options) {
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
			let p = module.dependencies.map( (dep) => {
				if ( includeConditionalDependencies || !module.isConditionalDependency(dep) ) {
					return visitNode(dep).then( (child) => child.pred.add( node ) );
				}
			});
			return Promise.all(p);
		}, (err) => {
			log.error("module %s not found in pool:", name, err);
		}).then( () => node );
	}

	// create artificial root node and link it with roots
	let n0 = new Node("");
	nodes.set("", n0);
	let p = roots.map( (root) => {
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

module.exports = createDependencyGraph;

// TODO introduce class Graph
// TODO remove n0 here, only introduce it in dominator tree (using the Graph API)
// TODO introduce payload for nodes to get rid of visited or dominator

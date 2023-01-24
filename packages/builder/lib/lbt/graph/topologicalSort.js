
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:graph:topologicalSort");

/**
 * Represents a module and its dependencies in a dependency graph.
 * Manages outgoing references as well as incoming references (if required).
 *
 * @author Frank Weigel
 * @private
 */
class GraphNode {
	constructor(name, indegreeOnly) {
		this.name = name;
		// for the minSpanningSet, only the indegree is needed
		this.outgoing = [];
		if ( !indegreeOnly ) {
			this.incoming = [];
		}
		this.indegree = 0;
	}

	toString() {
		return "GraphNode " + this.name +
			"(outgoing=" + this.outgoing.map(($) => $.name) +
			", incoming=" + this.incoming.map(($) => $.name) + ")";
	}
}

/**
 * Creates a dependency graph from the given moduleNames.
 * Ignores modules not in the pool
 *
 * @param {ResourcePool} pool
 * @param {string[]} moduleNames
 * @param {boolean} indegreeOnly
 * @returns {Promise<object>}
 * @private
 */
function createDependencyGraph(pool, moduleNames, indegreeOnly) {
	const graph = Object.create(null);

	const promises = moduleNames.map( (moduleName) => {
		return pool.getModuleInfo(moduleName).
			then( (module) => {
				let node = graph[moduleName];
				if ( node == null ) {
					node = new GraphNode(moduleName, indegreeOnly);
					graph[moduleName] = node;
				}
				const p = module.dependencies.map( function(dep) {
					if ( module.isConditionalDependency(dep) ) {
						return;
					}
					return pool.getModuleInfo(dep).then( (depModule) => {
						if ( moduleNames.indexOf(dep) >= 0 ) {
							let depNode = graph[dep];
							if ( depNode == null ) {
								depNode = new GraphNode(dep, indegreeOnly);
								graph[dep] = depNode;
							}
							node.outgoing.push(depNode);
							if ( indegreeOnly ) {
								depNode.indegree++;
							} else {
								depNode.incoming.push(node);
							}
						}
					}, (erro) => null);
				});
				return Promise.all(p);
			}, (err) => {
				log.error(`Module ${moduleName} not found in pool`);
			});
	});

	return Promise.all(promises).then(function() {
		// if ( trace.isTrace() ) trace.trace("initial module dependency graph: %s", dumpGraph(graph, moduleNames));
		return graph;
	});
}

/**
 * @param {ResourcePool} pool Modulepool to retrieve module information from
 * @param {string[]} moduleNames list of modules to be sorted
 * @returns {Promise<Array>} sorted list of modules
 * @private
 */
function topologicalSort(pool, moduleNames) {
	return createDependencyGraph(pool, moduleNames, false).
		then(function(graph) {
		// now do a topological sort.
			const sequence = [];
			let i;
			let j;
			let l = moduleNames.length;
			moduleNames = moduleNames.slice(); // clone

			do {
				// invariant: the first 'l' items in moduleNames are still to be processed

				// first loop over all remaining modules and emit those that don't have any more dependencies
				for (i = 0, j = 0; i < l; i++ ) {
					const moduleName = moduleNames[i];
					const node = graph[moduleName];

					// modules that don't have any unsatisfied dependencies can be emitted
					if ( node == null || node.outgoing.length === 0 ) {
						// console.log("emitting %s", moduleName, node);

						// add module to sequence
						sequence.push(moduleName);

						// remove outgoing dependency to current module from all modules that depend on it
						if ( node != null ) {
							node.incoming.forEach( function(dependent) {
								const index = dependent.outgoing.indexOf(node);
								if ( index >= 0 ) {
									dependent.outgoing.splice(index, 1);
								// console.log("removing outgoing %s in %s", node.name, dependent.name);
								} else {
									log.error(`**** Could not find node ${node.name} in ${dependent.name}`);
								}
							});
						}
					} else {
						moduleNames[j++] = moduleName;
					}
				}

				// invariant: 'j' is the number of remaining items, 'i' is the same as 'l' now

				l = j;

			/* NODE-TODO metadata for cycle resolution not available yet
			// if we have not been able to find a suitable module then we try to resolve well known cycles
			if ( i === l && l > 0 cycles.hasNext() ) {

				// get one cycle
				Collection<ModuleName> cycle = cycles.next();
				console.debug("trying to resolve cycle %s", cycle);

				// check that the full cycle is part of the remaining graph
				for(ModuleName moduleName : cycle) {
					if ( !moduleNames.contains(moduleName) ) {
						throw new IllegalStateException("Misconfigured cycle, cannot resolve.");
					}
					trace.debug("	%s:%d", moduleName, graph.get(moduleName).outgoing.size());
				}

				for(ModuleName moduleName : cycle) {
					GraphNode node = graph.get(moduleName);
					// Note: we assume that members of a cycle always are described in the module pool,
					// so we don't check for null

					// remove all cycle members from the outgoing dependencies
					for(ModuleName dep : cycle) {
						node.outgoing.remove(graph.get(dep));
					}

					// if the module is eligible now, add it to the sequence
					if ( node.outgoing.isEmpty() ) {
						sequence.add(moduleName);
						moduleNames.remove(moduleName);
						modified = true;
						for (GraphNode dependent : node.incoming) {
							dependent.outgoing.remove(node);
						}
					}
				}

			} */
			} while ( l && l < i ); // continue as long as there are remaining items and as long as we made progress

			if ( l > 0 ) {
				log.verbose(
					Object.keys(graph)
						.filter((name) => moduleNames.indexOf(name) < l)
						.map((name) => graph[name].toString()));
				throw new Error("Failed to resolve cyclic dependencies: " + moduleNames.slice(0, l).join(", ") );
				// NODE-TODO use new CycleFinder(graph).toString() for easier to understand output
			}

			// console.log("module sequence: %s", sequence);
			return sequence;
		});
}

export default topologicalSort;

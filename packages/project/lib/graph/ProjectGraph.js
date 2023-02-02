import {getLogger} from "@ui5/logger";
const log = getLogger("graph:ProjectGraph");

/**
 * A rooted, directed graph representing a UI5 project, its dependencies and available extensions.
 * <br><br>
 * While it allows defining cyclic dependencies, both traversal functions will throw an error if they encounter cycles.
 *
 * @public
 * @class
 * @alias @ui5/project/graph/ProjectGraph
 */
class ProjectGraph {
	/**
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.rootProjectName Root project name
	 */
	constructor({rootProjectName}) {
		if (!rootProjectName) {
			throw new Error(`Could not create ProjectGraph: Missing or empty parameter 'rootProjectName'`);
		}
		this._rootProjectName = rootProjectName;

		this._projects = new Map(); // maps project name to instance (= nodes)
		this._adjList = new Map(); // maps project name to dependencies (= edges)
		this._optAdjList = new Map(); // maps project name to optional dependencies (= edges)

		this._extensions = new Map(); // maps extension name to instance

		this._sealed = false;
		this._hasUnresolvedOptionalDependencies = false; // Performance optimization flag
		this._taskRepository = null;
	}

	/**
	 * Get the root project of the graph
	 *
	 * @public
	 * @returns {@ui5/project/specifications/Project} Root project
	 */
	getRoot() {
		const rootProject = this._projects.get(this._rootProjectName);
		if (!rootProject) {
			throw new Error(`Unable to find root project with name ${this._rootProjectName} in project graph`);
		}
		return rootProject;
	}

	/**
	 * Add a project to the graph
	 *
	 * @public
	 * @param {@ui5/project/specifications/Project} project Project which should be added to the graph
	 */
	addProject(project) {
		this._checkSealed();
		const projectName = project.getName();
		if (this._projects.has(projectName)) {
			throw new Error(
				`Failed to add project ${projectName} to graph: A project with that name has already been added`);
		}
		if (!isNaN(projectName)) {
			// Reject integer-like project names. They would take precedence when traversing object keys which
			// could lead to unexpected behavior. We don't really expect anyone to use such names anyways
			throw new Error(
				`Failed to add project ${projectName} to graph: Project name must not be integer-like`);
		}
		log.verbose(`Adding project: ${projectName}`);
		this._projects.set(projectName, project);
		this._adjList.set(projectName, new Set());
		this._optAdjList.set(projectName, new Set());
	}

	/**
	 * Retrieve a single project from the dependency graph
	 *
	 * @public
	 * @param {string} projectName Name of the project to retrieve
	 * @returns {@ui5/project/specifications/Project|undefined}
	 *					project instance or undefined if the project is unknown to the graph
	 */
	getProject(projectName) {
		return this._projects.get(projectName);
	}

	/**
	 * Get all projects in the graph
	 *
	 * @public
	 * @returns {Iterable.<@ui5/project/specifications/Project>}
	 */
	getProjects() {
		return this._projects.values();
	}

	/**
	 * Get names of all projects in the graph
	 *
	 * @public
	 * @returns {string[]} Names of all projects
	 */
	getProjectNames() {
		return Array.from(this._projects.keys());
	}

	/**
	 * Get the number of projects in the graph
	 *
	 * @public
	 * @returns {integer} Count of projects in the graph
	 */
	getSize() {
		return this._projects.size;
	}

	/**
	 * Add an extension to the graph
	 *
	 * @public
	 * @param {@ui5/project/specifications/Extension} extension Extension which should be available in the graph
	 */
	addExtension(extension) {
		this._checkSealed();
		const extensionName = extension.getName();
		if (this._extensions.has(extensionName)) {
			throw new Error(
				`Failed to add extension ${extensionName} to graph: ` +
				`An extension with that name has already been added`);
		}
		if (!isNaN(extensionName)) {
			// Reject integer-like extension names. They would take precedence when traversing object keys which
			// might lead to unexpected behavior in the future. We don't really expect anyone to use such names anyways
			throw new Error(
				`Failed to add extension ${extensionName} to graph: Extension name must not be integer-like`);
		}
		this._extensions.set(extensionName, extension);
	}

	/**
	 * @public
	 * @param {string} extensionName Name of the extension to retrieve
	 * @returns {@ui5/project/specifications/Extension|undefined}
	 *					Extension instance or undefined if the extension is unknown to the graph
	 */
	getExtension(extensionName) {
		return this._extensions.get(extensionName);
	}

	/**
	 * Get all extensions in the graph
	 *
	 * @public
	 * @returns {Iterable.<@ui5/project/specifications/Extension>}
	 */
	getExtensions() {
		return this._extensions.values();
	}

	/**
	 * Get names of all extensions in the graph
	 *
	 * @public
	 * @returns {string[]} Names of all extensions
	 */
	getExtensionNames() {
		return Array.from(this._extensions.keys());
	}

	/**
	 * Declare a dependency from one project in the graph to another
	 *
	 * @public
	 * @param {string} fromProjectName Name of the depending project
	 * @param {string} toProjectName Name of project on which the other depends
	 */
	declareDependency(fromProjectName, toProjectName) {
		this._checkSealed();
		try	{
			log.verbose(`Declaring dependency: ${fromProjectName} depends on ${toProjectName}`);
			this._declareDependency(this._adjList, fromProjectName, toProjectName);
		} catch (err) {
			throw new Error(
				`Failed to declare dependency from project ${fromProjectName} to ${toProjectName}: ` +
				err.message);
		}
	}


	/**
	 * Declare a dependency from one project in the graph to another
	 *
	 * @public
	 * @param {string} fromProjectName Name of the depending project
	 * @param {string} toProjectName Name of project on which the other depends
	 */
	declareOptionalDependency(fromProjectName, toProjectName) {
		this._checkSealed();
		try	{
			log.verbose(`Declaring optional dependency: ${fromProjectName} depends on ${toProjectName}`);
			this._declareDependency(this._optAdjList, fromProjectName, toProjectName);
			this._hasUnresolvedOptionalDependencies = true;
		} catch (err) {
			throw new Error(
				`Failed to declare optional dependency from project ${fromProjectName} to ${toProjectName}: ` +
				err.message);
		}
	}

	/**
	 * Declare a dependency from one project in the graph to another
	 *
	 * @param {object} map Adjacency map to use
	 * @param {string} fromProjectName Name of the depending project
	 * @param {string} toProjectName Name of project on which the other depends
	 */
	_declareDependency(map, fromProjectName, toProjectName) {
		if (!this._projects.has(fromProjectName)) {
			throw new Error(
				`Unable to find depending project with name ${fromProjectName} in project graph`);
		}
		if (!this._projects.has(toProjectName)) {
			throw new Error(
				`Unable to find dependency project with name ${toProjectName} in project graph`);
		}
		if (fromProjectName === toProjectName) {
			throw new Error(
				`A project can't depend on itself`);
		}
		const adjacencies = map.get(fromProjectName);
		if (adjacencies.has(toProjectName)) {
			log.warn(`Dependency has already been declared: ${fromProjectName} depends on ${toProjectName}`);
		} else {
			adjacencies.add(toProjectName);
		}
	}

	/**
	 * Get all direct dependencies of a project as an array of project names
	 *
	 * @public
	 * @param {string} projectName Name of the project to retrieve the dependencies of
	 * @returns {string[]} Names of all direct dependencies
	 */
	getDependencies(projectName) {
		const adjacencies = this._adjList.get(projectName);
		if (!adjacencies) {
			throw new Error(
				`Failed to get dependencies for project ${projectName}: ` +
				`Unable to find project in project graph`);
		}
		return Array.from(adjacencies);
	}

	/**
	 * Get all (direct and transitive) dependencies of a project as an array of project names
	 *
	 * @public
	 * @param {string} projectName Name of the project to retrieve the dependencies of
	 * @returns {string[]} Names of all direct and transitive dependencies
	 */
	getTransitiveDependencies(projectName) {
		const dependencies = new Set();
		if (!this._projects.has(projectName)) {
			throw new Error(
				`Failed to get transitive dependencies for project ${projectName}: ` +
				`Unable to find project in project graph`);
		}

		const processDependency = (depName) => {
			const adjacencies = this._adjList.get(depName);
			adjacencies.forEach((depName) => {
				if (!dependencies.has(depName)) {
					dependencies.add(depName);
					processDependency(depName);
				}
			});
		};

		processDependency(projectName);
		return Array.from(dependencies);
	}
	/**
	 * Checks whether a dependency is optional or not.
	 * Currently only used in tests.
	 *
	 * @private
	 * @param {string} fromProjectName Name of the depending project
	 * @param {string} toProjectName Name of project on which the other depends
	 * @returns {boolean} True if the dependency is currently optional
	 */
	isOptionalDependency(fromProjectName, toProjectName) {
		const adjacencies = this._adjList.get(fromProjectName);
		if (!adjacencies) {
			throw new Error(
				`Failed to determine whether dependency from ${fromProjectName} to ${toProjectName} ` +
				`is optional: ` +
				`Unable to find project with name ${fromProjectName} in project graph`);
		}
		if (adjacencies.has(toProjectName)) {
			return false;
		}
		const optAdjacencies = this._optAdjList.get(fromProjectName);
		if (optAdjacencies.has(toProjectName)) {
			return true;
		}
		return false;
	}

	/**
	 * Transforms any optional dependencies declared in the graph to non-optional dependency, if the target
	 * can already be reached from the root project.
	 *
	 * @public
	 */
	async resolveOptionalDependencies() {
		this._checkSealed();
		if (!this._hasUnresolvedOptionalDependencies) {
			log.verbose(`Skipping resolution of optional dependencies since none have been declared`);
			return;
		}
		log.verbose(`Resolving optional dependencies...`);

		// First collect all projects that are currently reachable from the root project (=all non-optional projects)
		const resolvedProjects = new Set();
		await this.traverseBreadthFirst(({project}) => {
			resolvedProjects.add(project.getName());
		});

		let unresolvedOptDeps = false;
		for (const [fromProjectName, optDependencies] of this._optAdjList) {
			for (const toProjectName of optDependencies) {
				if (resolvedProjects.has(toProjectName)) {
					// Target node is already reachable in the graph
					// => Resolve optional dependency
					log.verbose(`Resolving optional dependency from ${fromProjectName} to ${toProjectName}...`);

					if (this._adjList.get(toProjectName).has(fromProjectName)) {
						log.verbose(
							`  Cyclic optional dependency detected: ${toProjectName} already has a non-optional ` +
							`dependency to ${fromProjectName}`);
						log.verbose(
							`  Optional dependency from ${fromProjectName} to ${toProjectName} ` +
							`will not be declared as it would introduce a cycle`);
						unresolvedOptDeps = true;
					} else {
						this.declareDependency(fromProjectName, toProjectName);
						// This optional dependency has now been resolved
						// => Remove it from the list of optional dependencies
						optDependencies.delete(toProjectName);
					}
				} else {
					unresolvedOptDeps = true;
				}
			}
		}
		if (!unresolvedOptDeps) {
			this._hasUnresolvedOptionalDependencies = false;
		}
	}

	/**
	 * Callback for graph traversal operations
	 *
	 * @public
	 * @async
	 * @callback @ui5/project/graph/ProjectGraph~traversalCallback
	 * @param {object} parameters Parameters passed to the callback
	 * @param {@ui5/project/specifications/Project} parameters.project
	 *   Project that is currently visited
	 * @param {string[]} parameters.dependencies
	 *   Array containing the names of all direct dependencies of the project
	 * @returns {Promise|undefined} If a promise is returned,
	 *   graph traversal will wait and only continue once the promise has resolved.
	 */

	/**
	 * Visit every project in the graph that can be reached by the given entry project exactly once.
	 * The entry project defaults to the root project.
	 * In case a cycle is detected, an error is thrown
	 *
	 * @public
	 * @param {string} [startName] Name of the project to start the traversal at. Defaults to the graph's root project
	 * @param {@ui5/project/graph/ProjectGraph~traversalCallback} callback Will be called
	 */
	async traverseBreadthFirst(startName, callback) {
		if (!callback) {
			// Default optional first parameter
			callback = startName;
			startName = this._rootProjectName;
		}

		if (!this.getProject(startName)) {
			throw new Error(`Failed to start graph traversal: Could not find project ${startName} in project graph`);
		}

		const queue = [{
			projectNames: [startName],
			ancestors: []
		}];

		const visited = Object.create(null);

		while (queue.length) {
			const {projectNames, ancestors} = queue.shift(); // Get and remove first entry from queue

			await Promise.all(projectNames.map(async (projectName) => {
				this._checkCycle(ancestors, projectName);

				if (visited[projectName]) {
					return visited[projectName];
				}

				return visited[projectName] = (async () => {
					const newAncestors = [...ancestors, projectName];
					const dependencies = this.getDependencies(projectName);

					queue.push({
						projectNames: dependencies,
						ancestors: newAncestors
					});

					await callback({
						project: this.getProject(projectName),
						dependencies
					});
				})();
			}));
		}
	}

	/**
	 * Visit every project in the graph that can be reached by the given entry project exactly once.
	 * The entry project defaults to the root project.
	 * In case a cycle is detected, an error is thrown
	 *
	 * @public
	 * @param {string} [startName] Name of the project to start the traversal at. Defaults to the graph's root project
	 * @param {@ui5/project/graph/ProjectGraph~traversalCallback} callback Will be called
	 */
	async traverseDepthFirst(startName, callback) {
		if (!callback) {
			// Default optional first parameter
			callback = startName;
			startName = this._rootProjectName;
		}

		if (!this.getProject(startName)) {
			throw new Error(`Failed to start graph traversal: Could not find project ${startName} in project graph`);
		}
		return this._traverseDepthFirst(startName, Object.create(null), [], callback);
	}

	async _traverseDepthFirst(projectName, visited, ancestors, callback) {
		this._checkCycle(ancestors, projectName);

		if (visited[projectName]) {
			return visited[projectName];
		}
		return visited[projectName] = (async () => {
			const newAncestors = [...ancestors, projectName];
			const dependencies = this.getDependencies(projectName);
			await Promise.all(dependencies.map((depName) => {
				return this._traverseDepthFirst(depName, visited, newAncestors, callback);
			}));

			await callback({
				project: this.getProject(projectName),
				dependencies
			});
		})();
	}

	/**
	 * Join another project graph into this one.
	 * Projects and extensions which already exist in this graph will cause an error to be thrown
	 *
	 * @public
	 * @param {@ui5/project/graph/ProjectGraph} projectGraph Project Graph to merge into this one
	 */
	join(projectGraph) {
		try {
			this._checkSealed();
			if (!projectGraph.isSealed()) {
				// Seal input graph to prevent further modification
				log.verbose(
					`Sealing project graph with root project ${projectGraph._rootProjectName} ` +
					`before joining it into project graph with root project ${this._rootProjectName}...`);
				projectGraph.seal();
			}
			mergeMap(this._projects, projectGraph._projects);
			mergeMap(this._extensions, projectGraph._extensions);
			mergeMap(this._adjList, projectGraph._adjList);
			mergeMap(this._optAdjList, projectGraph._optAdjList);

			this._hasUnresolvedOptionalDependencies =
				this._hasUnresolvedOptionalDependencies || projectGraph._hasUnresolvedOptionalDependencies;
		} catch (err) {
			throw new Error(
				`Failed to join project graph with root project ${projectGraph._rootProjectName} into ` +
				`project graph with root project ${this._rootProjectName}: ${err.message}`);
		}
	}

	// Only to be used by @ui5/builder tests to inject its version of the taskRepository
	setTaskRepository(taskRepository) {
		this._taskRepository = taskRepository;
	}

	async _getTaskRepository() {
		if (!this._taskRepository) {
			this._taskRepository = await import("@ui5/builder/internal/taskRepository");
		}
		return this._taskRepository;
	}

	/**
	 * Executes a build on the graph
	 *
	 * @public
	 * @param {object} parameters Build parameters
	 * @param {string} parameters.destPath Target path
	 * @param {boolean} [parameters.cleanDest=false] Decides whether project should clean the target path before build
	 * @param {Array.<string|RegExp>} [parameters.includedDependencies=[]]
	 *			List of names of projects to include in the build result
	 *			If the wildcard '*' is provided, all dependencies will be included in the build result.
	 * @param {Array.<string|RegExp>} [parameters.excludedDependencies=[]]
	 *			List of names of projects to exclude from the build result.
	 * @param {@ui5/project/build/ProjectBuilder~DependencyIncludes} [parameters.dependencyIncludes]
	 *   Alternative to the <code>includedDependencies</code> and <code>excludedDependencies</code> parameters.
	 *   Allows for a more sophisticated configuration for defining which dependencies should be
	 *   part of the build result. If this is provided, the other mentioned parameters will be ignored.
	 * @param {boolean} [parameters.selfContained=false] Flag to activate self contained build
	 * @param {boolean} [parameters.cssVariables=false] Flag to activate CSS variables generation
	 * @param {boolean} [parameters.jsdoc=false] Flag to activate JSDoc build
	 * @param {boolean} [parameters.createBuildManifest=false]
	 * 			Whether to create a build manifest file for the root project.
	 *			This is currently only supported for projects of type 'library' and 'theme-library'
	 * @param {Array.<string>} [parameters.includedTasks=[]] List of tasks to be included
	 * @param {Array.<string>} [parameters.excludedTasks=[]] List of tasks to be excluded.
	 * 			If the wildcard '*' is provided, only the included tasks will be executed.
	 * @returns {Promise} Promise resolving to <code>undefined</code> once build has finished
	 */
	async build({
		destPath, cleanDest = false,
		includedDependencies = [], excludedDependencies = [],
		dependencyIncludes,
		selfContained = false, cssVariables = false, jsdoc = false, createBuildManifest = false,
		includedTasks = [], excludedTasks = []
	}) {
		this.seal(); // Do not allow further changes to the graph
		if (this._built) {
			throw new Error(
				`Project graph with root node ${this._rootProjectName} has already been built. ` +
				`Each graph can only be built once`);
		}
		this._built = true;
		const {
			default: ProjectBuilder
		} = await import("../build/ProjectBuilder.js");
		const builder = new ProjectBuilder({
			graph: this,
			taskRepository: await this._getTaskRepository(),
			buildConfig: {
				selfContained, cssVariables, jsdoc,
				createBuildManifest,
				includedTasks, excludedTasks,
			}
		});
		await builder.build({
			destPath, cleanDest,
			includedDependencies, excludedDependencies,
			dependencyIncludes,
		});
	}

	/**
	 * Seal the project graph so that no further changes can be made to it
	 *
	 * @public
	 */
	seal() {
		this._sealed = true;
	}

	/**
	 * Check whether the project graph has been sealed.
	 * This means the graph is read-only. Neither projects, nor dependencies between projects
	 * can be added or removed.
	 *
	 * @public
	 * @returns {boolean} True if the project graph has been sealed
	 */
	isSealed() {
		return this._sealed;
	}

	/**
	 * Helper function to check and throw in case the project graph has been sealed.
	 * Intended for use in any function that attempts to make changes to the graph.
	 *
	 * @throws Throws in case the project graph has been sealed
	 */
	_checkSealed() {
		if (this._sealed) {
			throw new Error(`Project graph with root node ${this._rootProjectName} has been sealed and is read-only`);
		}
	}

	_checkCycle(ancestors, projectName) {
		if (ancestors.includes(projectName)) {
			// "Back-edge" detected. Neither BFS nor DFS searches should continue
			// Mark first and last occurrence in chain with an asterisk and throw an error detailing the
			// problematic dependency chain
			ancestors[ancestors.indexOf(projectName)] = `*${projectName}*`;
			throw new Error(`Detected cyclic dependency chain: ${ancestors.join(" -> ")} -> *${projectName}*`);
		}
	}

	// TODO: introduce function to check for dangling nodes/consistency in general?
}

function mergeMap(target, source) {
	for (const [key, value] of source) {
		if (target.has(key)) {
			throw new Error(`Failed to merge map: Key '${key}' already present in target set`);
		}
		if (value instanceof Set) {
			// Shallow-clone any Sets
			target.set(key, new Set(value));
		} else {
			target.set(key, value);
		}
	}
}

export default ProjectGraph;

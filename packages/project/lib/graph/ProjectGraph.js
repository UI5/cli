const log = require("@ui5/logger").getLogger("graph:ProjectGraph");
/**
 * A rooted, directed graph representing a UI5 project, its dependencies and available extensions
 *
 * @public
 * @memberof module:@ui5/project.graph
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

		this._projects = {}; // maps project name to instance
		this._adjList = {}; // maps project name to edges/dependencies
		this._optAdjList = {}; // maps project name to optional dependencies

		this._extensions = {}; // maps extension name to instance

		this._sealed = false;
		this._shouldResolveOptionalDependencies = false; // Performance optimization flag
	}

	/**
	 * Get the root project of the graph
	 *
	 * @public
	 * @returns {module:@ui5/project.specifications.Project} Root project
	 */
	getRoot() {
		const rootProject = this._projects[this._rootProjectName];
		if (!rootProject) {
			throw new Error(`Unable to find root project with name ${this._rootProjectName} in project graph`);
		}
		return rootProject;
	}

	/**
	 * Add a project to the graph
	 *
	 * @public
	 * @param {module:@ui5/project.specifications.Project} project Project which should be added to the graph
	 * @param {boolean} [ignoreDuplicates=false] Whether an error should be thrown when a duplicate project is added
	 */
	addProject(project, ignoreDuplicates) {
		this._checkSealed();
		const projectName = project.getName();
		if (this._projects[projectName]) {
			if (ignoreDuplicates) {
				return;
			}
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
		this._projects[projectName] = project;
		this._adjList[projectName] = [];
		this._optAdjList[projectName] = [];
	}

	/**
	 * Retrieve a single project from the dependency graph
	 *
	 * @public
	 * @param {string} projectName Name of the project to retrieve
	 * @returns {module:@ui5/project.specifications.Project|undefined}
	 *					project instance or undefined if the project is unknown to the graph
	 */
	getProject(projectName) {
		return this._projects[projectName];
	}

	/**
	 * Get all projects in the graph
	 *
	 * @public
	 * @returns {module:@ui5/project.specifications.Project[]}
	 */
	getAllProjects() {
		return Object.values(this._projects);
	}

	/**
	 * Add an extension to the graph
	 *
	 * @public
	 * @param {module:@ui5/project.specification.Extension} extension Extension which should be available in the graph
	 */
	addExtension(extension) {
		this._checkSealed();
		const extensionName = extension.getName();
		if (this._extensions[extensionName]) {
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
		this._extensions[extensionName] = extension;
	}

	/**
	 * @public
	 * @param {string} extensionName Name of the extension to retrieve
	 * @returns {module:@ui5/project.specification.Extension|undefined}
	 *					Extension instance or undefined if the extension is unknown to the graph
	 */
	getExtension(extensionName) {
		return this._extensions[extensionName];
	}

	/**
	 * Get all extensions in the graph
	 *
	 * @public
	 * @returns {module:@ui5/project.specifications.Extension[]}
	 */
	getAllExtensions() {
		return Object.values(this._extensions);
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
			// if (this._optAdjList[fromProjectName] && this._optAdjList[fromProjectName][toProjectName]) {
			// 	// TODO: Do we even care?
			// 	throw new Error(`Dependency has already been declared as optional`);
			// }
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
			// if (this._adjList[fromProjectName] && this._adjList[fromProjectName][toProjectName]) {
			// 	// TODO: Do we even care?
			// 	throw new Error(`Dependency has already been declared as non-optional`);
			// }
			log.verbose(`Declaring optional dependency: ${fromProjectName} depends on ${toProjectName}`);
			this._declareDependency(this._optAdjList, fromProjectName, toProjectName);
			this._shouldResolveOptionalDependencies = true;
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
		if (!this._projects[fromProjectName]) {
			throw new Error(
				`Unable to find depending project with name ${fromProjectName} in project graph`);
		}
		if (!this._projects[toProjectName]) {
			throw new Error(
				`Unable to find dependency project with name ${toProjectName} in project graph`);
		}
		if (fromProjectName === toProjectName) {
			throw new Error(
				`A project can't depend on itself`);
		}
		if (map[fromProjectName].includes(toProjectName)) {
			log.warn(`Dependency has already been declared: ${fromProjectName} depends on ${toProjectName}`);
		} else {
			map[fromProjectName].push(toProjectName);
		}
	}

	/**
	 * Get all direct dependencies of a project as an array of project names
	 *
	 * @public
	 * @param {string} projectName Name of the project to retrieve the dependencies of
	 * @returns {string[]} Project names
	 */
	getDependencies(projectName) {
		const adjacencies = this._adjList[projectName];
		if (!adjacencies) {
			throw new Error(
				`Failed to get dependencies for project ${projectName}: ` +
				`Unable to find project in project graph`);
		}
		return adjacencies;
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
		const adjacencies = this._adjList[fromProjectName];
		if (!adjacencies) {
			throw new Error(
				`Failed to determine whether dependency from ${fromProjectName} to ${toProjectName} ` +
				`is optional: ` +
				`Unable to find project with name ${fromProjectName} in project graph`);
		}
		if (adjacencies.includes(toProjectName)) {
			return false;
		}
		const optAdjacencies = this._optAdjList[fromProjectName];
		if (optAdjacencies.includes(toProjectName)) {
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
		if (!this._shouldResolveOptionalDependencies) {
			log.verbose(`Skipping resolution of optional dependencies since none have been declared`);
			return;
		}
		log.verbose(`Resolving optional dependencies...`);

		// First collect all projects that are currently reachable from the root project (=all non-optional projects)
		const resolvedProjects = new Set;
		await this.traverseBreadthFirst(({project}) => {
			resolvedProjects.add(project.getName());
		});

		for (const [projectName, dependencies] of Object.entries(this._optAdjList)) {
			for (let i = dependencies.length - 1; i >= 0; i--) {
				const targetProjectName = dependencies[i];
				if (resolvedProjects.has(targetProjectName)) {
					// Target node is already reachable in the graph
					// => Resolve optional dependency
					log.verbose(`Resolving optional dependency from ${projectName} to ${targetProjectName}...`);

					if (this._adjList[targetProjectName].includes(projectName)) {
						log.verbose(
							`  Cyclic optional dependency detected: ${targetProjectName} already has a non-optional ` +
							`dependency to ${projectName}`);
						log.verbose(
							`  Optional dependency from ${projectName} to ${targetProjectName} ` +
							`will not be declared as it would introduce a cycle`);
					} else {
						this.declareDependency(projectName, targetProjectName);
					}
				}
			}
		}
	}

	/**
	 * Callback for graph traversal operations
	 *
	 * @public
	 * @async
	 * @callback module:@ui5/project.graph.ProjectGraph~traversalCallback
	 * @param {object} parameters Parameters passed to the callback
	 * @param {module:@ui5/project.specifications.Project} parameters.project The project that is currently visited
	 * @param {module:@ui5/project.graph.ProjectGraph~getDependencies} parameters.getDependencies
	 * 				Function to access the dependencies of the project that is currently visited.
	 * @returns {Promise} Must return a promise on which the graph traversal will wait
	 */

	/**
	 * Helper function available in the
	 * [traversalCallback]{@link module:@ui5/project.graph.ProjectGraph~traversalCallback} to access the
	 * dependencies of the corresponding project in the current graph.
	 * <br><br>
	 * Note that transitive dependencies can't be accessed this way. Projects should rather add a direct
	 * dependency to projects they need access to.
	 *
	 * @public
	 * @function module:@ui5/project.graph.ProjectGraph~getDependencies
	 * @returns {Array.<module:@ui5/project.specifications.Project>} Direct dependencies of the visited project
	 */


	// TODO: Use generator functions instead?
	/**
	 * Visit every project in the graph that can be reached by the given entry project exactly once.
	 * The entry project defaults to the root project.
	 * In case a cycle is detected, an error is thrown
	 *
	 * @public
	 * @param {string} [startName] Name of the project to start the traversal at. Defaults to the graph's root project
	 * @param {module:@ui5/project.graph.ProjectGraph~traversalCallback} callback Will be called
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
			predecessors: []
		}];

		const visited = {};

		while (queue.length) {
			const {projectNames, predecessors} = queue.shift(); // Get and remove first entry from queue

			await Promise.all(projectNames.map(async (projectName) => {
				this._checkCycle(predecessors, projectName);

				if (visited[projectName]) {
					return visited[projectName];
				}

				return visited[projectName] = (async () => {
					const newPredecessors = [...predecessors, projectName];
					const dependencies = this.getDependencies(projectName);

					queue.push({
						projectNames: dependencies,
						predecessors: newPredecessors
					});

					await callback({
						project: this.getProject(projectName),
						getDependencies: () => {
							return dependencies.map(($) => this.getProject($));
						}
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
	 * @param {module:@ui5/project.graph.ProjectGraph~traversalCallback} callback Will be called
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
		return this._traverseDepthFirst(startName, {}, [], callback);
	}

	async _traverseDepthFirst(projectName, visited, predecessors, callback) {
		this._checkCycle(predecessors, projectName);

		if (visited[projectName]) {
			return visited[projectName];
		}
		return visited[projectName] = (async () => {
			const newPredecessors = [...predecessors, projectName];
			const dependencies = this.getDependencies(projectName);
			await Promise.all(dependencies.map((depName) => {
				return this._traverseDepthFirst(depName, visited, newPredecessors, callback);
			}));

			await callback({
				project: this.getProject(projectName),
				getDependencies: () => {
					return dependencies.map(($) => this.getProject($));
				}
			});
		})();
	}

	/**
	 * Join another project graph into this one.
	 * Projects and extensions which already exist in this graph will cause an error to be thrown
	 *
	 * @public
	 * @param {module:@ui5/project.graph.ProjectGraph} projectGraph Project Graph to merge into this one
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
			mergeMap(this._adjList, projectGraph._adjList);
			mergeMap(this._extensions, projectGraph._extensions);
		} catch (err) {
			throw new Error(
				`Failed to join project graph with root project ${projectGraph._rootProjectName} into ` +
				`project graph with root project ${this._rootProjectName}: ${err.message}`);
		}
	}

	setTaskRepository(taskRepository) {
		this._taskRepository = taskRepository;
	}

	getTaskRepository() {
		return this._taskRepository || require("@ui5/builder").tasks.taskRepository;
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
	 * @param {object} [parameters.complexDependencyIncludes] TODO 3.0
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
		complexDependencyIncludes,
		selfContained = false, cssVariables = false, jsdoc = false, createBuildManifest = false,
		includedTasks = [], excludedTasks = []
	}) {
		this.seal();
		if (this._built) {
			throw new Error(
				`Project graph with root node ${this._rootProjectName} has already been built. ` +
				`Each graph can only be built once`);
		}
		this._built = true;
		const ProjectBuilder = require("../build/ProjectBuilder");
		const builder = new ProjectBuilder(this, this.getTaskRepository(), {
			selfContained, cssVariables, jsdoc,
			createBuildManifest,
			includedTasks, excludedTasks,
		});
		await builder.build({
			destPath, cleanDest,
			includedDependencies, excludedDependencies,
			complexDependencyIncludes,
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
	 * Check whether the project graph has been sealed
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
			throw new Error(`Project graph with root node ${this._rootProjectName} has been sealed`);
		}
	}

	_checkCycle(predecessors, projectName) {
		if (predecessors.includes(projectName)) {
			// We start to run in circles. That's neither expected nor something we can deal with

			// Mark first and last occurrence in chain with an asterisk
			predecessors[predecessors.indexOf(projectName)] = `${projectName}*`;
			throw new Error(`Detected cyclic dependency chain: ${predecessors.join(" -> ")} -> ${projectName}*`);
		}
	}

	// TODO: introduce function to check for dangling nodes/consistency in general?
}

function mergeMap(target, source) {
	for (const [key, value] of Object.entries(source)) {
		if (target[key]) {
			throw new Error(`Failed to merge map: Key '${key}' already present in target set`);
		}
		target[key] = value;
	}
}

module.exports = ProjectGraph;

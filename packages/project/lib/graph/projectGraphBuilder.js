const path = require("path");
const Module = require("./Module");
const ProjectGraph = require("./ProjectGraph");
const ShimCollection = require("./ShimCollection");
const log = require("@ui5/logger").getLogger("graph:projectGraphBuilder");

function _handleExtensions(graph, shimCollection, extensions) {
	extensions.forEach((extension) => {
		const type = extension.getType();
		switch (type) {
		case "project-shim":
			shimCollection.addProjectShim(extension);
			break;
		case "task":
		case "server-middleware":
			graph.addExtension(extension);
			break;
		default:
			throw new Error(
				`Encountered unexpected extension of type ${type} ` +
				`Supported types are 'project-shim', 'task' and 'middleware'`);
		}
	});
}

function validateNode(node) {
	if (node.specVersion) {
		throw new Error(
			`Provided node with ID ${node.id} contains a top-level 'specVersion' property. ` +
			`With UI5 Tooling 3.0, project configuration needs to be provided in a dedicated` +
			`'configuration' object.`);
	}
	if (node.metadata) {
		throw new Error(
			`Provided node with ID ${node.id} contains a top-level 'metadata' property. ` +
			`With UI5 Tooling 3.0, project configuration needs to be provided in a dedicated` +
			`'configuration' object.`);
	}
}

/**
 * Dependency graph node representing a module
 *
 * @public
 * @typedef {object} Node
 * @property {string} node.id Unique ID for the project
 * @property {string} node.version Version of the project
 * @property {string} node.path File System path to access the projects resources
 * @property {object|object[]} [node.configuration]
 *	Configuration object or array of objects to use instead of reading from a configuration file
 * @property {string} [node.configPath] Configuration file to use instead the default ui5.yaml
 * @property {boolean} [node.optional]
 *					Whether the node is an optional dependency of the parent it has been requested for
 * @property {*} * Additional attributes are allowed but ignored.
 *					These can be used to pass information internally in the provider.
 */

/**
 * Node Provider interface
 *
 * @interface NodeProvider
 */

/**
 * Retrieve information on the root module
 *
 * @function
 * @name NodeProvider#getRootNode
 * @returns {Node} The root node of the dependency graph
 */

/**
 * Retrieve information on given a nodes dependencies
 *
 * @function
 * @name NodeProvider#getDependencies
 * @param {Node} The root node of the dependency graph
 * @returns {Node[]} Array of nodes which are direct dependencies of the given node
 */

/**
 * Generic helper module to create a [@ui5/project.graph.ProjectGraph]{@link module:@ui5/project.graph.ProjectGraph}.
 * For example from a dependency tree as returned by the legacy "translators".
 *
 * @public
 * @alias module:@ui5/project.graph.projectGraphBuilder
 * @param {NodeProvider} nodeProvider
 * @returns {module:@ui5/project.graph.ProjectGraph} A new project graph instance
 */
module.exports = async function(nodeProvider) {
	const shimCollection = new ShimCollection();
	const moduleCollection = {};

	const rootNode = await nodeProvider.getRootNode();
	validateNode(rootNode);
	const rootModule = new Module({
		id: rootNode.id,
		version: rootNode.version,
		modulePath: rootNode.path,
		configPath: rootNode.configPath,
		configuration: rootNode.configuration
	});
	const {project: rootProject, extensions: rootExtensions} = await rootModule.getSpecifications();
	if (!rootProject) {
		throw new Error(
			`Failed to create a UI5 project from module ${rootNode.id} at ${rootNode.path}. ` +
			`Make sure the path is correct and a project configuration is present or supplied.`);
	}

	moduleCollection[rootNode.id] = rootModule;

	const rootProjectName = rootProject.getName();

	let qualifiedApplicationProject = null;
	if (rootProject.getType() === "application") {
		log.verbose(`Root project ${rootProjectName} qualified as application project for project graph`);
		qualifiedApplicationProject = rootProject;
	}


	const projectGraph = new ProjectGraph({
		rootProjectName: rootProjectName
	});
	projectGraph.addProject(rootProject);

	function handleExtensions(extensions) {
		return _handleExtensions(projectGraph, shimCollection, extensions);
	}

	handleExtensions(rootExtensions);

	const queue = [];

	const rootDependencies = await nodeProvider.getDependencies(rootNode);

	if (rootDependencies.length) {
		queue.push({
			nodes: rootDependencies,
			parentProjectName: rootProjectName
		});
	}

	// Breadth-first search
	while (queue.length) {
		const {nodes, parentProjectName} = queue.shift(); // Get and remove first entry from queue
		const res = await Promise.all(nodes.map(async (node) => {
			let ui5Module = moduleCollection[node.id];
			if (!ui5Module) {
				log.verbose(`Creating module ${node.id}...`);
				validateNode(node);
				ui5Module = moduleCollection[node.id] = new Module({
					id: node.id,
					version: node.version,
					modulePath: node.path,
					configPath: node.configPath,
					configuration: node.configuration,
					shimCollection
				});
			} else if (ui5Module.getPath() !== node.path) {
				log.verbose(
					`Inconsistency detected: Tree contains multiple nodes with ID ${node.id} and different paths:` +
					`\nPath of already added node (this one will be used): ${ui5Module.getPath()}` +
					`\nPath of additional node (this one will be ignored in favor of the other): ${node.path}`);
			}

			const {project, extensions} = await ui5Module.getSpecifications();

			return {
				node,
				project,
				extensions
			};
		}));

		// Keep this out of the async map function to ensure
		// all projects and extensions are applied in a deterministic order
		for (let i = 0; i < res.length; i++) {
			const {
				node, // Tree "raw" dependency tree node
				project, // The project found for this node, if any
				extensions // Any extensions found for this node
			} = res[i];

			handleExtensions(extensions);

			// Check for collection shims
			const collectionShims = shimCollection.getCollectionShims(node.id);
			if (collectionShims && collectionShims.length) {
				log.verbose(
					`One or more module collection shims have been defined for module ${node.id}. ` +
					`Therefore the module itself will not be resolved.`);

				const shimmedNodes = collectionShims.map(({name, shim}) => {
					log.verbose(`Applying module collection shim ${name} for module ${node.id}:`);
					return Object.entries(shim.modules).map(([shimModuleId, shimModuleRelPath]) => {
						const shimModulePath = path.join(node.path, shimModuleRelPath);
						log.verbose(`  Injecting module ${shimModuleId} with path ${shimModulePath}`);
						return {
							id: shimModuleId,
							version: node.version,
							path: shimModulePath,
							configuration: project && project.getConfigurationObject()
						};
					});
				});

				queue.push({
					nodes: Array.prototype.concat.apply([], shimmedNodes),
					parentProjectName,
				});
				// Skip collection node
				continue;
			}
			let skipDependencies = false;
			if (project) {
				const projectName = project.getName();
				if (project.getType() === "application") {
					// Special handling of application projects of which there must be exactly *one*
					// in the graph. Others shall be ignored.
					if (!qualifiedApplicationProject) {
						log.verbose(`Project ${projectName} qualified as application project for project graph`);
						qualifiedApplicationProject = project;
					} else if (qualifiedApplicationProject.getName() !== projectName) {
						// Project is not a duplicate of an already qualified project (which should
						// still be processed below), but a unique, additional application project

						// TODO: Should this rather be a verbose logging?
						//	projectPreprocessor handled this like any project that got ignored and did a
						//	(in this case misleading) general verbose logging:
						//	"Ignoring project with missing configuration"
						log.info(
							`Excluding additional application project ${projectName} from graph. `+
							`The project graph can only feature a single project of type application. ` +
							`Project ${qualifiedApplicationProject.getName()} has already qualified for that role.`);
						continue;
					}
				}
				if (projectGraph.getProject(projectName)) {
					log.verbose(
						`Project ${projectName} has already been added to the graph. ` +
						`Skipping dependency resolution...`);
					skipDependencies = true;
				} else {
					projectGraph.addProject(project);
				}

				// if (!node.deduped) {
				// Even if not deduped, the node might occur multiple times in the tree (on separate branches).
				// Therefore still supplying the ignore duplicates parameter here (true)
				// }

				if (parentProjectName) {
					if (node.optional) {
						projectGraph.declareOptionalDependency(parentProjectName, projectName);
					} else {
						projectGraph.declareDependency(parentProjectName, projectName);
					}
				}
			}

			if (!project && !extensions.length) {
				// Module provided neither a project nor an extension
				// => Do not follow its dependencies
				log.verbose(
					`Module ${node.id} neither provided a project nor an extension. Skipping dependency resolution.`);
				skipDependencies = true;
			}

			if (skipDependencies) {
				continue;
			}

			const nodeDependencies = await nodeProvider.getDependencies(node);
			if (nodeDependencies) {
				queue.push({
					// copy array, so that the queue is stable while ignored project dependencies are removed
					nodes: [...nodeDependencies],
					parentProjectName: project ? project.getName() : parentProjectName,
				});
			}
		}
	}

	// Apply dependency shims
	for (const [shimmedModuleId, moduleDepShims] of Object.entries(shimCollection.getAllDependencyShims())) {
		const sourceModule = moduleCollection[shimmedModuleId];

		for (let j = 0; j < moduleDepShims.length; j++) {
			const depShim = moduleDepShims[j];
			if (!sourceModule) {
				log.warn(`Could not apply dependency shim ${depShim.name} for ${shimmedModuleId}: ` +
					`Module ${shimmedModuleId} is unknown`);
				continue;
			}
			const {project: sourceProject} = await sourceModule.getSpecifications();
			if (!sourceProject) {
				log.warn(`Could not apply dependency shim ${depShim.name} for ${shimmedModuleId}: ` +
					`Source module ${shimmedModuleId} does not contain a project`);
				continue;
			}
			for (let k = 0; k < depShim.shim.length; k++) {
				const targetModuleId = depShim.shim[k];
				const targetModule = moduleCollection[targetModuleId];
				if (!targetModule) {
					log.warn(`Could not apply dependency shim ${depShim.name} for ${shimmedModuleId}: ` +
						`Target module $${depShim} is unknown`);
					continue;
				}
				const {project: targetProject} = await targetModule.getSpecifications();
				if (!targetProject) {
					log.warn(`Could not apply dependency shim ${depShim.name} for ${shimmedModuleId}: ` +
						`Target module ${targetModuleId} does not contain a project`);
					continue;
				}
				projectGraph.declareDependency(sourceProject.getName(), targetProject.getName());
			}
		}
	}
	await projectGraph.resolveOptionalDependencies();

	return projectGraph;
};

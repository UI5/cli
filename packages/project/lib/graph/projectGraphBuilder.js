import path from "node:path";
import Module from "./Module.js";
import ProjectGraph from "./ProjectGraph.js";
import ShimCollection from "./ShimCollection.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("graph:projectGraphBuilder");

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
			`With UI5 Tooling 3.0, project configuration needs to be provided in a dedicated ` +
			`'configuration' object`);
	}
	if (node.metadata) {
		throw new Error(
			`Provided node with ID ${node.id} contains a top-level 'metadata' property. ` +
			`With UI5 Tooling 3.0, project configuration needs to be provided in a dedicated ` +
			`'configuration' object`);
	}
}

/**
 * @public
 * @module @ui5/project/graph/ProjectGraphBuilder
 */

/**
 * Dependency graph node representing a module
 *
 * @public
 * @typedef {object} @ui5/project/graph/ProjectGraphBuilder~Node
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
 * @public
 * @interface @ui5/project/graph/ProjectGraphBuilder~NodeProvider
 */

/**
 * Retrieve information on the root module
 *
 * @public
 * @function
 * @name @ui5/project/graph/ProjectGraphBuilder~NodeProvider#getRootNode
 * @returns {Node} The root node of the dependency graph
 */

/**
 * Retrieve information on given a nodes dependencies
 *
 * @public
 * @function
 * @name @ui5/project/graph/ProjectGraphBuilder~NodeProvider#getDependencies
 * @param {Node} node The root node of the dependency graph
 * @param {@ui5/project/graph/Workspace} [workspace] workspace instance to use for overriding node resolution
 * @returns {Node[]} Array of nodes which are direct dependencies of the given node
 */

/**
 * Generic helper module to create a [@ui5/project/graph/ProjectGraph]{@link @ui5/project/graph/ProjectGraph}.
 * For example from a dependency tree as returned by the legacy "translators".
 *
 * @public
 * @function default
 * @static
 * @param {@ui5/project/graph/ProjectGraphBuilder~NodeProvider} nodeProvider
 * 	Node provider instance to use for building the graph
 * @param {@ui5/project/graph/Workspace} [workspace]
 * 	Optional workspace instance to use for overriding project resolutions
 * @returns {@ui5/project/graph/ProjectGraph} A new project graph instance
 */
async function projectGraphBuilder(nodeProvider, workspace) {
	const shimCollection = new ShimCollection();
	const moduleCollection = Object.create(null);
	const handledExtensions = new Set(); // Set containing the IDs of modules which' extensions have been handled

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
	handledExtensions.add(rootNode.id);

	const queue = [];

	const rootDependencies = await nodeProvider.getDependencies(rootNode, workspace);

	if (rootDependencies && rootDependencies.length) {
		queue.push({
			nodes: rootDependencies,
			parentProject: rootProject
		});
	}

	// Breadth-first search
	while (queue.length) {
		const {nodes, parentProject} = queue.shift(); // Get and remove first entry from queue
		const res = await Promise.all(nodes.map(async (node) => {
			let ui5Module = moduleCollection[node.id];

			if (ui5Module) {
				log.silly(
					`Re-visiting module ${node.id} as a dependency of ${parentProject.getName()}`);

				const {project, extensions} = await ui5Module.getSpecifications();
				if (!project && !extensions.length) {
					// Invalidate cache if the cached module is visited through another parent project and did not
					// resolve to a project or extension(s) before.
					// The module being visited now might be a different version containing for example
					// UI5 Tooling configuration, or one of the parent projects could have defined a
					// relevant configuration shim meanwhile
					log.silly(
						`Cached module ${node.id} did not resolve to any projects or extensions. ` +
						`Recreating module as a dependency of ${parentProject.getName()}...`);
					ui5Module = null;
				}
			}

			if (!ui5Module) {
				log.silly(`Visiting Module ${node.id} as a dependency of ${parentProject.getName()}`);
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
					`Warning - Dependency ${node.id} is available at multiple paths:` +
					`\n  Location of the already processed module (this one will be used): ${ui5Module.getPath()}` +
					`\n  Additional location (this one will be ignored): ${node.path}`);
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

			if (extensions.length && (!node.optional || parentProject === rootProject)) {
				// Only handle extensions in non-optional dependencies and any dependencies of the root project
				if (handledExtensions.has(node.id)) {
					// Do not handle extensions of the same module twice
					log.verbose(`Extensions contained in module ${node.id} have already been handled`);
				} else {
					log.verbose(`Handling extensions for module ${node.id}...`);
					// If a different module contains the same extension, we expect an error to be thrown by the graph
					handleExtensions(extensions);
					handledExtensions.add(node.id);
				}
			}

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
							path: shimModulePath
						};
					});
				});

				queue.push({
					nodes: Array.prototype.concat.apply([], shimmedNodes),
					parentProject,
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
					// Opposing to extensions, we are generally fine with the same project being contained in different
					// modules. We simply ignore all but the first occurrence.
					// This can happen for example if the same project is packaged in different ways/modules
					// (e.g. one module containing the source and one containing the pre-built resources)
					log.verbose(
						`Project ${projectName} has already been added to the graph. ` +
						`Skipping dependency resolution...`);
					skipDependencies = true;
				} else {
					projectGraph.addProject(project);
				}

				if (parentProject) {
					if (node.optional) {
						projectGraph.declareOptionalDependency(parentProject.getName(), projectName);
					} else {
						projectGraph.declareDependency(parentProject.getName(), projectName);
					}

					if (project.isDeprecated() && parentProject === rootProject &&
							parentProject.getName() !== "testsuite") {
						// Only warn for direct dependencies of the root project
						// No warning for testsuite projects
						log.warn(
							`Dependency ${project.getName()} is deprecated and should not be used for new projects!`);
					}

					if (project.isSapInternal() && parentProject === rootProject &&
						!parentProject.getAllowSapInternal()) {
						// Only warn for direct dependencies of the root project, except it defines "allowSapInternal"
						log.warn(
							`Dependency ${project.getName()} is restricted for use by SAP internal projects only! ` +
							`If the project ${parentProject.getName()} is an SAP internal project, add the attribute ` +
							`"allowSapInternal: true" to its metadata configuration`);
					}
				}
			}

			if (!project && !extensions.length) {
				// Module provides neither a project nor an extension
				// => Do not follow its dependencies
				log.verbose(
					`Module ${node.id} neither provides a project nor an extension. Skipping dependency resolution`);
				skipDependencies = true;
			}

			if (skipDependencies) {
				continue;
			}

			const nodeDependencies = await nodeProvider.getDependencies(node);
			if (nodeDependencies && nodeDependencies.length) {
				queue.push({
					// copy array, so that the queue is stable while ignored project dependencies are removed
					nodes: [...nodeDependencies],
					parentProject: project ? project : parentProject,
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
}

export default projectGraphBuilder;

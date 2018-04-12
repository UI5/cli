const path = require("path");
const FsAdapter = require("./adapters/FileSystem");
const MemAdapter = require("./adapters/Memory");
const ReaderCollection = require("./ReaderCollection");
const DuplexCollection = require("./DuplexCollection");
const Resource = require("./Resource");

/**
 * @module resources/resourceFactory
 */

/**
 * Creates resource reader collections for a (sub-)tree. Returns an object of resource readers:
 * <pre>
 * {
 *  source: Resource reader for source resources
 *  dependencies: Resource readers for dependency resources
 * }
 * </pre>
 *
 * @param {Object} tree A (sub-)tree
 * @param {Object} [parameters] Parameters
 * @param {boolean} [parameters.useNamespaces=false] Use project namespaces as path prefixes
 * @returns {Object} Object containing <code>source</code> and <code>dependencies</code> resource readers
 */
function createCollectionsForTree(tree, {useNamespaces=false} = {}) {
	const dependencyCollection = [];
	const dependencyPathIndex = {};
	const sourceResourceLocators = [];

	function processDependencies(project) {
		if (project.resources && project.resources.pathMappings) {
			for (let virBasePath in project.resources.pathMappings) {
				if (project.resources.pathMappings.hasOwnProperty(virBasePath)) {
					const fsPath = project.resources.pathMappings[virBasePath];
					const fsBasePath = path.join(project.path, fsPath);

					if (useNamespaces && project.metadata.namespace) { // Prefix resource paths with namespace
						virBasePath = "/resources/" + project.metadata.namespace + virBasePath;
					}

					// Prevent duplicate dependency resource locators
					const key = virBasePath + fsBasePath;
					if (dependencyPathIndex[key]) {
						continue;
					}
					dependencyPathIndex[key] = true;

					dependencyCollection.push(createAdapter({fsBasePath, virBasePath, project}));
				}
			}
		}

		project.dependencies.forEach(function(depProject) {
			processDependencies(depProject);
		});
	}

	if (tree.resources && tree.resources.pathMappings) {
		for (let virBasePath in tree.resources.pathMappings) {
			if (tree.resources.pathMappings.hasOwnProperty(virBasePath)) {
				let fsBasePath = path.join(tree.path, tree.resources.pathMappings[virBasePath]);

				if (useNamespaces && tree.metadata.namespace) { // Prefix resource paths with namespace
					virBasePath = "/resources/" + tree.metadata.namespace + virBasePath;
				}
				sourceResourceLocators.push(createAdapter({fsBasePath, virBasePath, tree}));
			}
		}
	}

	tree.dependencies.forEach(function(project) {
		processDependencies(project);
	});

	let source = new ReaderCollection({
		name: "source of " + tree.metadata.name,
		readers: sourceResourceLocators
	});
	let dependencies = new ReaderCollection({
		name: "dependencies of " + tree.metadata.name,
		readers: dependencyCollection
	});
	return {
		source,
		dependencies
	};
}

/**
 * Creates a resource <code>ReaderWriter</code>.
 *
 * If a file system base path is given, file system resource <code>ReaderWriter</code> is returned.
 * In any other case a virtual one.
 *
 * @param {Object} parameters Parameters
 * @param {string} parameters.virBasePath Virtual base path
 * @param {string} [parameters.fsBasePath] File system base path
 * @returns {FileSystem|Memory} File System- or Virtual Adapter
 */
function createAdapter({fsBasePath, virBasePath, project}) {
	if (fsBasePath) {
		return new FsAdapter({fsBasePath, virBasePath, project});
	} else {
		return new MemAdapter({virBasePath, project});
	}
}


/**
 * Creates a <code>Resource</code>. Accepts the same parameters as the Resource constructor.
 *
 * @param {Object} parameters Parameters to be passed to the resource constructor
 * @returns {Resource} Resource
 */
function createResource(parameters) {
	return new Resource(parameters);
}

/**
 * Creates a Workspace
 *
 * A workspace is a DuplexCollection which reads from the project sources. It is used during the build process
 * to write modified files into a seperate writer, this is usually a Memory adapter. If a file already exists it is
 * fetched from the memory to work on it in further build steps.
 *
 * @param {Object} parameters
 * @param {AbstractReader} parameters.reader The reader
 * @param {string} [parameters.name="vir & fs source"] Name of the collection
 * @param {string} [parameters.virBasePath="/"] Virtual base path
 * @returns {DuplexCollection} DuplexCollection which wraps the provided resource locators
 */
function createWorkspace({reader, writer, virBasePath = "/", name = "vir & fs source"}) {
	if (!writer) {
		writer = new MemAdapter({
			virBasePath
		});
	}

	return new DuplexCollection({
		reader,
		writer,
		name
	});
}

module.exports = {
	createCollectionsForTree,
	createAdapter,
	createWorkspace,
	createResource
};

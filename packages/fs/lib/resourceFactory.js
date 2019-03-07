const path = require("path");
const FsAdapter = require("./adapters/FileSystem");
const MemAdapter = require("./adapters/Memory");
const ReaderCollection = require("./ReaderCollection");
const ReaderCollectionPrioritized = require("./ReaderCollectionPrioritized");
const DuplexCollection = require("./DuplexCollection");
const Resource = require("./Resource");

/**
 * Resource Factory
 *
 * @public
 * @namespace
 * @alias module:@ui5/fs.resourceFactory
 */
const resourceFactory = {
	/**
	 * Creates resource reader collections for a (sub-)tree. Returns an object of resource readers:
	 * <pre>
	 * {
	 *  source: Resource reader for source resources
	 *  dependencies: Resource readers for dependency resources
	 * }
	 * </pre>
	 *
	 * @public
	 * @param {Object} tree A (sub-)tree
	 * @param {Object} [parameters] Parameters
	 * @param {boolean} [parameters.useNamespaces=false] Use project namespaces as path prefixes
	 * @returns {Object} Object containing <code>source</code> and <code>dependencies</code> resource readers
	 */
	createCollectionsForTree(tree, {useNamespaces=false, virtualReaders={}} = {}) {
		// TODO: virtualReaders is private API. The virtual reader of a project should be stored on the
		//	project itself. This requires projects to become objects independent from the dependency tree.
		//	Also see: https://github.com/SAP/ui5-project/issues/122

		const dependencyCollection = [];
		const dependencyPathIndex = {};
		const virtualReaderIndex = {};
		const sourceResourceLocators = [];

		function processDependencies(project) {
			if (project.resources && project.resources.pathMappings) {
				const fsReaders = [];
				for (let virBasePath in project.resources.pathMappings) {
					// Create an fs reader for every path mapping
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

						const fsReader = resourceFactory.createAdapter({fsBasePath, virBasePath, project});
						fsReaders.push(fsReader);
					}
				}

				if (!virtualReaderIndex[project.metadata.name] && virtualReaders[project.metadata.name]) {
					// Mix-in virtual reader of dependency if available and not already added
					virtualReaderIndex[project.metadata.name] = true;
					const virtualReader = virtualReaders[project.metadata.name];
					const readerCollection = new ReaderCollectionPrioritized({
						name: `fs & vir reader collection for project ${project.metadata.name}`,
						readers: [virtualReader, ...fsReaders]
					});
					dependencyCollection.push(readerCollection);
				} else {
					dependencyCollection.push(...fsReaders);
				}
			}

			project.dependencies.forEach(function(depProject) {
				processDependencies(depProject);
			});
		}

		if (tree.resources && tree.resources.pathMappings) {
			for (let virBasePath in tree.resources.pathMappings) {
				if (tree.resources.pathMappings.hasOwnProperty(virBasePath)) {
					const fsBasePath = path.join(tree.path, tree.resources.pathMappings[virBasePath]);

					if (useNamespaces && tree.metadata.namespace) { // Prefix resource paths with namespace
						virBasePath = "/resources/" + tree.metadata.namespace + virBasePath;
					}
					sourceResourceLocators.push(resourceFactory.createAdapter({
						fsBasePath, virBasePath, project: tree
					}));
				}
			}
		}

		tree.dependencies.forEach(function(project) {
			processDependencies(project);
		});

		const source = new ReaderCollection({
			name: "source of " + tree.metadata.name,
			readers: sourceResourceLocators
		});
		const dependencies = new ReaderCollection({
			name: "dependencies of " + tree.metadata.name,
			readers: dependencyCollection
		});
		return {
			source,
			dependencies
		};
	},

	/**
	 * Creates a resource <code>ReaderWriter</code>.
	 *
	 * If a file system base path is given, file system resource <code>ReaderWriter</code> is returned.
	 * In any other case a virtual one.
	 *
	 * @public
	 * @param {Object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 * @param {string} [parameters.fsBasePath] File system base path
	 * @returns {module:@ui5/fs.adapters.FileSystem|module:@ui5/fs.adapters.Memory} File System- or Virtual Adapter
	 */
	createAdapter({fsBasePath, virBasePath, project}) {
		if (fsBasePath) {
			return new FsAdapter({fsBasePath, virBasePath, project});
		} else {
			return new MemAdapter({virBasePath, project});
		}
	},


	/**
	 * Creates a <code>Resource</code>. Accepts the same parameters as the Resource constructor.
	 *
	 * @public
	 * @param {Object} parameters Parameters to be passed to the resource constructor
	 * @returns {module:@ui5/fs.Resource} Resource
	 */
	createResource(parameters) {
		return new Resource(parameters);
	},

	/**
	 * Creates a Workspace
	 *
	 * A workspace is a DuplexCollection which reads from the project sources. It is used during the build process
	 * to write modified files into a seperate writer, this is usually a Memory adapter. If a file already exists it is
	 * fetched from the memory to work on it in further build steps.
	 *
	 * @public
	 * @param {Object} parameters
	 * @param {module:@ui5/fs.AbstractReader} parameters.reader The reader
	 * @param {string} [parameters.name="vir & fs source"] Name of the collection
	 * @param {string} [parameters.virBasePath="/"] Virtual base path
	 * @returns {module:@ui5/fs.DuplexCollection} DuplexCollection which wraps the provided resource locators
	 */
	createWorkspace({reader, writer, virBasePath = "/", name = "vir & fs source"}) {
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
};

module.exports = resourceFactory;

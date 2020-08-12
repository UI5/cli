const log = require("@ui5/logger").getLogger("resources:resourceFactory");
const path = require("path");
const FsAdapter = require("./adapters/FileSystem");
const MemAdapter = require("./adapters/Memory");
const ReaderCollection = require("./ReaderCollection");
const ReaderCollectionPrioritized = require("./ReaderCollectionPrioritized");
const DuplexCollection = require("./DuplexCollection");
const Resource = require("./Resource");
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Resource Factory
 *
 * @public
 * @namespace
 * @alias module:@ui5/fs.resourceFactory
 */
const resourceFactory = {
	/**
	* Callback to retrieve excludes for a given project
	*
	* @public
	* @callback module:@ui5/fs.resourceFactory~getProjectExcludes
	* @param {object} Project
	* @returns {string[]} List of glob patterns to exclude
	*/

	/**
	* Callback to retrieve a prefix to use for a given virtual base path of a project
	*
	* @public
	* @callback module:@ui5/fs.resourceFactory~getVirtualBasePathPrefix
	* @param {object} parameters Parameters
	* @param {object} parameters.project Project
	* @param {object} parameters.virBasePath virtual base path to prefix
	* @returns {string} Prefix for the virtual base path
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
	 * @public
	 * @param {object} tree A (sub-)tree
	 * @param {object} [parameters] Parameters
	 * @param {module:@ui5/fs.resourceFactory~getProjectExcludes} [parameters.getProjectExcludes]
	 *						Callback to retrieve the exclude globs of a project
	 * @param {module:@ui5/fs.resourceFactory~getVirtualBasePathPrefix} [parameters.getVirtualBasePathPrefix]
	 *						Callback to retrieve a prefix for a given virtual base path of a project if required
	 * @param {object} [parameters.virtualReaders] Experimental, internal parameter. Do not use
	 * @returns {object} Object containing <code>source</code> and <code>dependencies</code> resource readers
	 */
	createCollectionsForTree(tree, {
		getProjectExcludes, getVirtualBasePathPrefix, virtualReaders={}
	} = {}) {
		// TODO 3.0: virtualReaders is private API. The virtual reader of a project should be stored on the
		//	project itself. This requires projects to become objects independent from the dependency tree.
		//	Also see: https://github.com/SAP/ui5-project/issues/122

		const dependencyCollection = [];
		const dependencyPathIndex = {};
		const virtualReaderIndex = {};
		const sourceResourceLocators = [];

		function processDependencies(project) {
			if (project.resources && project.resources.pathMappings) {
				const fsAdapters = [];
				for (const virBasePath in project.resources.pathMappings) {
					if (hasOwnProperty.call(project.resources.pathMappings, virBasePath)) {
						// Prevent duplicate dependency resource locators
						const fsPath = project.resources.pathMappings[virBasePath];
						const fsBasePath = path.join(project.path, fsPath);
						const key = virBasePath + fsBasePath;
						if (dependencyPathIndex[key]) {
							continue;
						}
						dependencyPathIndex[key] = true;

						// Create an fs adapter for every path mapping
						const fsAdapter = resourceFactory._createFsAdapterForVirtualBasePath({
							project,
							virBasePath,
							getProjectExcludes,
							getVirtualBasePathPrefix
						});
						fsAdapters.push(fsAdapter);
					}
				}

				if (!virtualReaderIndex[project.metadata.name] && virtualReaders[project.metadata.name]) {
					// Mix-in virtual reader of dependency if available and not already added
					virtualReaderIndex[project.metadata.name] = true;
					const virtualReader = virtualReaders[project.metadata.name];
					const readerCollection = new ReaderCollectionPrioritized({
						name: `fs & vir reader collection for project ${project.metadata.name}`,
						readers: [virtualReader, ...fsAdapters]
					});
					dependencyCollection.push(readerCollection);
				} else {
					dependencyCollection.push(...fsAdapters);
				}
			}

			project.dependencies.forEach(function(depProject) {
				processDependencies(depProject);
			});
		}

		if (tree.resources && tree.resources.pathMappings) {
			for (const virBasePath in tree.resources.pathMappings) {
				if (hasOwnProperty.call(tree.resources.pathMappings, virBasePath)) {
					// Create an fs adapter for every path mapping
					const fsAdapter = resourceFactory._createFsAdapterForVirtualBasePath({
						project: tree,
						virBasePath,
						getProjectExcludes,
						getVirtualBasePathPrefix
					});
					sourceResourceLocators.push(fsAdapter);
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
	 * Creates a FileSystem adapter mapping to the given virtual base path based on the given projects
	 * configuration.
	 *
	 * @param {object} parameters Parameters
	 * @param {Project} parameters.project A project
	 * @param {string} parameters.virBasePath Virtual base path to create the adapter for
	 * @param {module:@ui5/fs.resourceFactory~getProjectExcludes} [parameters.getProjectExcludes]
	 *												Callback to retrieve the exclude glob of a project
	 * @param {module:@ui5/fs.resourceFactory~getVirtualBasePathPrefix} [parameters.getVirtualBasePathPrefix]
	 *												Callback to retrieve the exclude glob of a project
	 * @returns {Promise<string[]>} Promise resolving to list of normalized glob patterns
	 */
	_createFsAdapterForVirtualBasePath({
		project, virBasePath, getProjectExcludes, getVirtualBasePathPrefix
	}) {
		const fsPath = project.resources.pathMappings[virBasePath];
		const fsBasePath = path.join(project.path, fsPath);

		let pathExcludes;
		if (getProjectExcludes) {
			pathExcludes = getProjectExcludes(project);
		}

		if (getVirtualBasePathPrefix) {
			const virBasePathPrefix = getVirtualBasePathPrefix({project, virBasePath});
			if (virBasePathPrefix) {
				log.verbose(`Prefixing virtual base path ${virBasePath} of project ${project.metadata.name} ` +
					`${virBasePathPrefix}...`);
				virBasePath = virBasePathPrefix + virBasePath;
				log.verbose(`New virtual base path: ${virBasePath}`);

				if (pathExcludes) {
					const normalizedPatterns = pathExcludes.map((pattern) => {
						return resourceFactory._prefixGlobPattern(pattern, virBasePathPrefix);
					});
					pathExcludes = Array.prototype.concat.apply([], normalizedPatterns);
				}
			}
		}

		return resourceFactory.createAdapter({
			fsBasePath,
			virBasePath,
			excludes: pathExcludes,
			project
		});
	},

	/**
	 * Normalizes virtual glob patterns by prefixing them with
	 * a given virtual base directory path
	 *
	 * @param {string} virPattern glob pattern for virtual directory structure
	 * @param {string} virBaseDir virtual base directory path to prefix the given patterns with
	 * @returns {Promise<string[]>} Promise resolving to list of normalized glob patterns
	 */
	_prefixGlobPattern(virPattern, virBaseDir) {
		const minimatch = require("minimatch");
		const mm = new minimatch.Minimatch(virPattern);

		const resultGlobs = [];
		for (let i = 0; i < mm.globSet.length; i++) {
			let resultPattern = path.posix.join(virBaseDir, mm.globSet[i]);

			if (mm.negate) {
				resultPattern = "!" + resultPattern;
			}
			resultGlobs.push(resultPattern);
		}
		return resultGlobs;
	},

	/**
	 * Creates a resource <code>ReaderWriter</code>.
	 *
	 * If a file system base path is given, file system resource <code>ReaderWriter</code> is returned.
	 * In any other case a virtual one.
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 * @param {string} [parameters.fsBasePath] File system base path
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 * @param {object} [parameters.project] Experimental, internal parameter. Do not use
	 * @returns {module:@ui5/fs.adapters.FileSystem|module:@ui5/fs.adapters.Memory} File System- or Virtual Adapter
	 */
	createAdapter({fsBasePath, virBasePath, project, excludes}) {
		if (fsBasePath) {
			return new FsAdapter({fsBasePath, virBasePath, project, excludes});
		} else {
			return new MemAdapter({virBasePath, project, excludes});
		}
	},


	/**
	 * Creates a <code>Resource</code>. Accepts the same parameters as the Resource constructor.
	 *
	 * @public
	 * @param {object} parameters Parameters to be passed to the resource constructor
	 * @returns {module:@ui5/fs.Resource} Resource
	 */
	createResource(parameters) {
		return new Resource(parameters);
	},

	/**
	 * Creates a Workspace
	 *
	 * A workspace is a DuplexCollection which reads from the project sources. It is used during the build process
	 * to write modified files into a separate writer, this is usually a Memory adapter. If a file already exists it is
	 * fetched from the memory to work on it in further build steps.
	 *
	 * @public
	 * @param {object} parameters
	 * @param {module:@ui5/fs.AbstractReader} parameters.reader Single reader or collection of readers
	 * @param {module:@ui5/fs.AbstractReaderWriter} [parameters.writer] A ReaderWriter instance which is
	 *							only used for writing files. If not supplied, a Memory adapter will be created.
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

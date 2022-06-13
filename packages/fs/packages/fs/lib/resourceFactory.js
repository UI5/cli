/**
 * Resource Factory
 *
 * @public
 * @namespace
 * @alias module:@ui5/fs.resourceFactory
 */
const resourceFactory = {
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
			const FsAdapter = require("./adapters/FileSystem");
			return new FsAdapter({fsBasePath, virBasePath, project, excludes});
		} else {
			const MemAdapter = require("./adapters/Memory");
			return new MemAdapter({virBasePath, project, excludes});
		}
	},

	/**
	 * Creates an adapter and wraps it in a ReaderCollection
	 *
	 * @public
	 * @param {object} parameters Parameters
	 * @param {string} parameters.virBasePath Virtual base path
	 * @param {string} [parameters.fsBasePath] File system base path
	 * @param {object} [parameters.project] Experimental, internal parameter. Do not use
	 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
	 * @param {string} [parameters.name]  Name for the reader collection
	 * @returns {module:@ui5/fs.ReaderCollection} Reader collection wrapping an adapter
	 */
	createReader({fsBasePath, virBasePath, project, excludes = [], name}) {
		const normalizedExcludes = excludes.map((pattern) => {
			return resourceFactory.prefixGlobPattern(pattern, virBasePath);
		});
		const ReaderCollection = require("./ReaderCollection");
		return new ReaderCollection({
			name,
			readers: [resourceFactory.createAdapter({
				fsBasePath,
				virBasePath,
				project,
				excludes: normalizedExcludes
			})]
		});
	},

	createReaderCollection({name, readers}) {
		const ReaderCollection = require("./ReaderCollection");
		return new ReaderCollection({
			name,
			readers
		});
	},

	createReaderCollectionPrioritized({name, readers}) {
		const ReaderCollectionPrioritized = require("./ReaderCollectionPrioritized");
		return new ReaderCollectionPrioritized({
			name,
			readers
		});
	},

	createWriterCollection({name, writerMapping}) {
		const WriterCollection = require("./WriterCollection");
		return new WriterCollection({
			name,
			writerMapping
		});
	},

	/**
	 * Creates a <code>Resource</code>. Accepts the same parameters as the Resource constructor.
	 *
	 * @public
	 * @param {object} parameters Parameters to be passed to the resource constructor
	 * @returns {module:@ui5/fs.Resource} Resource
	 */
	createResource(parameters) {
		const Resource = require("./Resource");
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
		const DuplexCollection = require("./DuplexCollection");

		if (!writer) {
			const MemAdapter = require("./adapters/Memory");
			writer = new MemAdapter({
				virBasePath
			});
		}

		return new DuplexCollection({
			reader,
			writer,
			name
		});
	},

	/**
	 * Normalizes virtual glob patterns by prefixing them with
	 * a given virtual base directory path
	 *
	 * @param {string} virPattern glob pattern for virtual directory structure
	 * @param {string} virBaseDir virtual base directory path to prefix the given patterns with
	 * @returns {string[]} A list of normalized glob patterns
	 */
	prefixGlobPattern(virPattern, virBaseDir) {
		const path = require("path");
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
		return Array.prototype.concat.apply([], resultGlobs);
	}
};

module.exports = resourceFactory;

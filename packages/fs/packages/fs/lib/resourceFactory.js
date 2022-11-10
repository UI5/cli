import path from "node:path";
import minimatch from "minimatch";
import DuplexCollection from "./DuplexCollection.js";
import FileSystem from "./adapters/FileSystem.js";
import MemAdapter from "./adapters/Memory.js";
import ReaderCollection from "./ReaderCollection.js";
import ReaderCollectionPrioritized from "./ReaderCollectionPrioritized.js";
import Resource from "./Resource.js";
import WriterCollection from "./WriterCollection.js";
import Filter from "./readers/Filter.js";
import Link from "./readers/Link.js";

/**
 * @module @ui5/fs/resourceFactory
 * @description A collection of resource related APIs
 * @public
 */

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
 * @returns {@ui5/fs/adapters/FileSystem|@ui5/fs/adapters/Memory} File System- or Virtual Adapter
 */
export function createAdapter({fsBasePath, virBasePath, project, excludes}) {
	if (fsBasePath) {
		const FsAdapter = FileSystem;
		return new FsAdapter({fsBasePath, virBasePath, project, excludes});
	} else {
		return new MemAdapter({virBasePath, project, excludes});
	}
}

/**
 * Creates an adapter and wraps it in a ReaderCollection
 *
 * @public
 * @param {object} parameters Parameters
 * @param {string} parameters.virBasePath Virtual base path
 * @param {string} parameters.fsBasePath File system base path
 * @param {object} [parameters.project] Experimental, internal parameter. Do not use
 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
 * @param {string} [parameters.name] Name for the reader collection
 * @returns {@ui5/fs/ReaderCollection} Reader collection wrapping an adapter
 */
export function createReader({fsBasePath, virBasePath, project, excludes = [], name}) {
	const normalizedExcludes = excludes.map((pattern) => {
		return prefixGlobPattern(pattern, virBasePath);
	});
	if (!fsBasePath) {
		// Creating a reader with a memory adapter seems pointless right now
		// since there would be no way to fill the adapter with resources
		throw new Error(`Missing parameter "fsBasePath"`);
	}
	return new ReaderCollection({
		name,
		readers: [createAdapter({
			fsBasePath,
			virBasePath,
			project,
			excludes: normalizedExcludes
		})]
	});
}

/**
 * Creates a ReaderCollection
 *
 * @public
 * @param {object} parameters Parameters
 * @param {string} parameters.name The collection name
 * @param {@ui5/fs/AbstractReader[]} parameters.readers List of resource readers (all tried in parallel)
 * @returns {@ui5/fs/ReaderCollection} Reader collection wrapping provided readers
 */
export function createReaderCollection({name, readers}) {
	return new ReaderCollection({
		name,
		readers
	});
}

/**
 * Creates a ReaderCollectionPrioritized
 *
 * @public
 * @param {object} parameters
 * @param {string} parameters.name The collection name
 * @param {@ui5/fs/AbstractReader[]} parameters.readers Prioritized list of resource readers
 * 																(first is tried first)
 * @returns {@ui5/fs/ReaderCollectionPrioritized} Reader collection wrapping provided readers
 */
export function createReaderCollectionPrioritized({name, readers}) {
	return new ReaderCollectionPrioritized({
		name,
		readers
	});
}

/**
 * Creates a WriterCollection
 *
 * @public
 * @param {object} parameters
 * @param {string} parameters.name The collection name
 * @param {object.<string, @ui5/fs/AbstractReaderWriter>} parameters.writerMapping Mapping of virtual base
 * 	paths to writers. Path are matched greedy
 * @returns {@ui5/fs/WriterCollection} Writer collection wrapping provided writers
 */
export function createWriterCollection({name, writerMapping}) {
	return new WriterCollection({
		name,
		writerMapping
	});
}

/**
 * Creates a <code>Resource</code>. Accepts the same parameters as the Resource constructor.
 *
 * @public
 * @param {object} parameters Parameters to be passed to the resource constructor
 * @returns {@ui5/fs/Resource} Resource
 */
export function createResource(parameters) {
	return new Resource(parameters);
}

/**
 * Creates a Workspace
 *
 * A workspace is a DuplexCollection which reads from the project sources. It is used during the build process
 * to write modified files into a separate writer, this is usually a Memory adapter. If a file already exists it is
 * fetched from the memory to work on it in further build steps.
 *
 * @public
 * @param {object} parameters
 * @param {@ui5/fs/AbstractReader} parameters.reader Single reader or collection of readers
 * @param {@ui5/fs/AbstractReaderWriter} [parameters.writer] A ReaderWriter instance which is
 *        only used for writing files. If not supplied, a Memory adapter will be created.
 * @param {string} [parameters.name="vir & fs source"] Name of the collection
 * @param {string} [parameters.virBasePath="/"] Virtual base path
 * @returns {@ui5/fs/DuplexCollection} DuplexCollection which wraps the provided resource locators
 */
export function createWorkspace({reader, writer, virBasePath = "/", name = "vir & fs source"}) {
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

/**
 * Create a [Filter-Reader]{@link @ui5/fs/readers/Filter} with the given reader.
 * The provided callback is called for every resource that is retrieved through the
 * reader and decides whether the resource shall be passed on or dropped.
 *
 * @public
 * @param {object} parameters
 * @param {@ui5/fs/AbstractReader} parameters.reader Single reader or collection of readers
 * @param {@ui5/fs/readers/Filter~callback} parameters.callback
 * 				Filter function. Will be called for every resource passed through this reader.
 * @returns {@ui5/fs/readers/Filter} Reader instance
 */
export function createFilterReader(parameters) {
	return new Filter(parameters);
}

/**
 * Create a [Link-Reader]{@link @ui5/fs/readers/Filter} with the given reader.
 * The provided path mapping allows
 *
 * @public
 * @param {object} parameters
 * @param {@ui5/fs/AbstractReader} parameters.reader Single reader or collection of readers
 * @param {@ui5/fs/readers/Link/PathMapping} parameters.pathMapping
 * @returns {@ui5/fs/readers/Link} Reader instance
 */
export function createLinkReader(parameters) {
	return new Link(parameters);
}

/**
 * Create a [Link-Reader]{@link @ui5/fs/readers/Link} where all requests are prefixed with
 * <code>/resources/<namespace></code>.
 *
 * This simulates "flat" resource access, which is for example common for projects of type
 * "application".
 *
 * @public
 * @param {object} parameters
 * @param {@ui5/fs/AbstractReader} parameters.reader Single reader or collection of readers
 * @param {string} parameters.namespace Project namespace
 * @returns {@ui5/fs/readers/Link} Reader instance
 */
export function createFlatReader({reader, namespace}) {
	return new Link({
		reader: reader,
		pathMapping: {
			linkPath: `/`,
			targetPath: `/resources/${namespace}/`
		}
	});
}

/**
 * Normalizes virtual glob patterns by prefixing them with
 * a given virtual base directory path
 *
 * @param {string} virPattern glob pattern for virtual directory structure
 * @param {string} virBaseDir virtual base directory path to prefix the given patterns with
 * @returns {string[]} A list of normalized glob patterns
 */
export function prefixGlobPattern(virPattern, virBaseDir) {
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

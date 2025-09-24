import path from "node:path";
import {minimatch} from "minimatch";
import DuplexCollection from "./DuplexCollection.js";
import FsAdapter from "./adapters/FileSystem.js";
import MemAdapter from "./adapters/Memory.js";
import ReaderCollection from "./ReaderCollection.js";
import ReaderCollectionPrioritized from "./ReaderCollectionPrioritized.js";
import Resource from "./Resource.js";
import WriterCollection from "./WriterCollection.js";
import Filter from "./readers/Filter.js";
import Link from "./readers/Link.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("resources:resourceFactory");

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
 * @param {string} parameters.virBasePath Virtual base path. Must be absolute, POSIX-style, and must end with a slash
 * @param {string} [parameters.fsBasePath]
 *   File System base path.
 *   If this parameter is supplied, a File System adapter will be created instead of a Memory adapter.
 *   The provided path must be absolute and must use platform-specific path segment separators.
 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
 * @param {object} [parameters.useGitignore=false]
 *   Whether to apply any excludes defined in an optional .gitignore in the base directory.
 *   This parameter only takes effect in conjunction with the <code>fsBasePath</code> parameter.
 * @param {@ui5/project/specifications/Project} [parameters.project] Project this adapter belongs to (if any)
 * @returns {@ui5/fs/adapters/FileSystem|@ui5/fs/adapters/Memory} File System- or Virtual Adapter
 */
export function createAdapter({fsBasePath, virBasePath, project, excludes, useGitignore}) {
	if (fsBasePath) {
		return new FsAdapter({fsBasePath, virBasePath, project, excludes, useGitignore});
	} else {
		return new MemAdapter({virBasePath, project, excludes});
	}
}

/**
 * Creates a File System adapter and wraps it in a ReaderCollection
 *
 * @public
 * @param {object} parameters Parameters
 * @param {string} parameters.virBasePath Virtual base path. Must be absolute, POSIX-style, and must end with a slash
 * @param {string} parameters.fsBasePath
 *   File System base path. Must be absolute and must use platform-specific path segment separators
 * @param {object} [parameters.project] Experimental, internal parameter. Do not use
 * @param {string[]} [parameters.excludes] List of glob patterns to exclude
 * @param {string} [parameters.name] Name for the reader collection
 * @returns {@ui5/fs/ReaderCollection} Reader collection wrapping an adapter
 */
export function createReader({fsBasePath, virBasePath, project, excludes = [], name}) {
	if (!fsBasePath) {
		// Creating a reader with a memory adapter seems pointless right now
		// since there would be no way to fill the adapter with resources
		throw new Error(`Unable to create reader: Missing parameter "fsBasePath"`);
	}
	let normalizedExcludes = excludes;
	// If a project is supplied, and that project is of type application,
	// Prefix all exclude patterns with the virtual base path (unless it already starts with that)
	// TODO 4.0: // TODO specVersion 4.0: Disallow excludes without namespaced prefix in configuration
	// Specifying an exclude for "/test" is disambigous as it neither reflects the source path nor the
	// ui5 runtime path of the excluded resources. Therefore, only allow paths like /resources/<namespace>/test
	// starting with specVersion 4.0
	if (excludes.length && project && project.getType() === "application") {
		normalizedExcludes = excludes.map((pattern) => {
			if (pattern.startsWith(virBasePath) || pattern.startsWith("!" + virBasePath)) {
				return pattern;
			}
			log.verbose(
				`Prefixing exclude pattern defined in application project ${project.getName()}: ${pattern}`);
			return prefixGlobPattern(pattern, virBasePath);
		});
		// Flatten list of patterns
		normalizedExcludes = Array.prototype.concat.apply([], normalizedExcludes);
		log.verbose(`Effective exclude patterns for application project ${project.getName()}:\n` +
			normalizedExcludes.join(", "));
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
 * Creates a [Resource]{@link @ui5/fs/Resource}.
 * Accepts the same parameters as the [Resource]{@link @ui5/fs/Resource} constructor.
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
 * @param {string} [parameters.name="workspace"] Name of the collection
 * @param {string} [parameters.virBasePath="/"] Virtual base path
 * @returns {@ui5/fs/DuplexCollection} DuplexCollection which wraps the provided resource locators
 */
export function createWorkspace({reader, writer, virBasePath = "/", name = "workspace"}) {
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
 * The provided path mapping allows for rewriting paths segments of all resources passed through it.
 *
 * @example
 * import {createLinkReader} from "@ui5/fs/resourceFactory";
 * const linkedReader = createLinkReader({
 *     reader: sourceReader,
 *     pathMapping: {
 *          linkPath: `/app`,
 *          targetPath: `/resources/my-app-name/`
 *      }
 * });
 *
 * // The following resolves with a @ui5/fs/ResourceFacade of the resource
 * // located at "/resources/my-app-name/Component.js" in the sourceReader
 * const resource = await linkedReader.byPath("/app/Component.js");
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
	return resultGlobs;
}

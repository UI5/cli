import parseurl from "parseurl";
import mime from "mime-types";
import {
	createReaderCollection,
	createReaderCollectionPrioritized,
	createResource,
	createFilterReader,
	createLinkReader,
	createFlatReader
} from "@ui5/fs/resourceFactory";

/**
 * Convenience functions for UI5 Server middleware.
 * An instance of this class is passed to every standard UI5 Server middleware.
 * Custom middleware that define a specification version >= 2.0 will also receive an instance
 * of this class as part of the parameters of their create-middleware function.
 *
 * The set of functions that can be accessed by a custom middleware depends on the specification
 * version defined for the extension.
 *
 * @public
 * @class
 * @alias @ui5/server/middleware/MiddlewareUtil
 * @hideconstructor
 */
class MiddlewareUtil {
	/**
	 *
	 * @param {object} parameters
	 * @param {@ui5/project/graph/ProjectGraph} parameters.graph Relevant ProjectGraph
	 * @param {@ui5/project/specifications/Project} parameters.project Project that is being served
	 * @public
	 */
	constructor({graph, project}) {
		if (!graph) {
			throw new Error(`Missing parameter "graph"`);
		}
		if (!project) {
			throw new Error(`Missing parameter "project"`);
		}
		this._graph = graph;
		this._project = project;
	}

	/**
	 * Returns the [pathname]{@link https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname}
	 * of a given request. Any escape sequences will be decoded.
	 * </br></br>
	 * This method is only available to custom middleware extensions defining
	 * <b>Specification Version 2.0 and above</b>.
	 *
	 * @param {object} req Request object
	 * @returns {string} [Pathname]{@link https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname}
	 * of the given request
	 * @public
	 */
	getPathname(req) {
		let {pathname} = parseurl(req);
		pathname = decodeURIComponent(pathname);
		return pathname;
	}

	/**
	 * MIME Info
	 *
	 * @example
	 * const mimeInfo = {
	 * 	"type": "text/html",
	 * 	"charset": "utf-8",
	 * 	"contentType": "text/html; charset=utf-8"
	 * };
	 *
	 * @public
	 * @typedef {object} MimeInfo
	 * @property {string} type Detected content-type for the given resource path
	 * @property {string} charset Default charset for the detected content-type
	 * @property {string} contentType Calculated content-type header value
	 * @memberof @ui5/server/middleware/MiddlewareUtil
	 */
	/**
	 * Returns MIME information derived from a given resource path.
	 * </br></br>
	 * This method is only available to custom middleware extensions defining
	 * <b>Specification Version 2.0 and above</b>.
	 *
	 * @param {object} resourcePath
	 * @returns {@ui5/server/middleware/MiddlewareUtil.MimeInfo}
	 * @public
	 */
	getMimeInfo(resourcePath) {
		const type = mime.lookup(resourcePath) || "application/octet-stream";
		const charset = mime.charset(type);
		return {
			type,
			charset,
			contentType: type + (charset ? "; charset=" + charset : "")
		};
	}
	/**
	 * Specification Version-dependent [Project]{@link @ui5/project/specifications/Project} interface.
	 * For details on individual functions, see [Project]{@link @ui5/project/specifications/Project}
	 *
	 * @public
	 * @typedef {object} @ui5/server/middleware/MiddlewareUtil~ProjectInterface
	 * @property {Function} getType Get the project type
	 * @property {Function} getName Get the project name
	 * @property {Function} getVersion Get the project version
	 * @property {Function} getNamespace Get the project namespace
	 * @property {Function} getRootReader Get the project rootReader
	 * @property {Function} getReader Get the project reader, defaulting to "runtime" style instead of "buildtime"
	 * @property {Function} getRootPath Get the local File System path of the project's root directory
	 * @property {Function} getSourcePath Get the local File System path of the project's source directory
	 * @property {Function} getCustomConfiguration Get the project Custom Configuration
	 * @property {Function} isFrameworkProject Check whether the project is a UI5-Framework project
	 * @property {Function} getFrameworkName Get the project's framework name configuration
	 * @property {Function} getFrameworkVersion Get the project's framework version configuration
	 * @property {Function} getFrameworkDependencies Get the project's framework dependencies configuration
	 */

	/**
	 * Retrieve a single project from the dependency graph
	 *
	 * </br></br>
	 * This method is only available to custom server middleware extensions defining
	 * <b>Specification Version 3.0 and above</b>.
	 *
	 * @param {string|@ui5/fs/Resource} [projectNameOrResource]
	 * Name of the project to retrieve or a Resource instance to retrieve the associated project for.
	 * Defaults to the name of the current root project
	 * @returns {@ui5/server/middleware/MiddlewareUtil~ProjectInterface|undefined}
	 * Specification Version-dependent interface to the Project instance or <code>undefined</code>
	 * if the project name is unknown or the provided resource is not associated with any project.
	 * @public
	 */
	getProject(projectNameOrResource) {
		if (projectNameOrResource) {
			if (typeof projectNameOrResource === "string" || projectNameOrResource instanceof String) {
				// A project name has been provided
				return this._graph.getProject(projectNameOrResource);
			} else {
				// A Resource instance has been provided
				return projectNameOrResource.getProject();
			}
		}
		// No parameter has been provided, default to the root project
		return this._project;
	}

	/**
	 * Retrieve a list of direct dependencies of a given project from the dependency graph.
	 * Note that this list does not include transitive dependencies.
	 *
	 * </br></br>
	 * This method is only available to custom server middleware extensions defining
	 * <b>Specification Version 3.0 and above</b>.
	 *
	 * @param {string} [projectName] Name of the project to retrieve.
	 * Defaults to the name of the current root project
	 * @returns {string[]} Names of all direct dependencies
	 * @throws {Error} If the requested project is unknown to the graph
	 * @public
	 */
	getDependencies(projectName) {
		return this._graph.getDependencies(projectName || this._project.getName());
	}

	/**
	 * Specification Version-dependent set of [@ui5/fs/resourceFactory]{@link @ui5/fs/resourceFactory}
	 * functions provided to middleware.
	 * For details on individual functions, see [@ui5/fs/resourceFactory]{@link @ui5/fs/resourceFactory}
	 *
	 * @public
	 * @typedef {object} @ui5/server/middleware/MiddlewareUtil~resourceFactory
	 * @property {Function} createResource Creates a [Resource]{@link @ui5/fs/Resource}.
	 * 	Accepts the same parameters as the [Resource]{@link @ui5/fs/Resource} constructor.
	 * @property {Function} createReaderCollection Creates a reader collection:
	 *	[ReaderCollection]{@link @ui5/fs/ReaderCollection}
	 * @property {Function} createReaderCollectionPrioritized Creates a prioritized reader collection:
	 *	[ReaderCollectionPrioritized]{@link @ui5/fs/ReaderCollectionPrioritized}
	 * @property {Function} createFilterReader
	 * 	Create a [Filter-Reader]{@link @ui5/fs/readers/Filter} with the given reader.
	 * @property {Function} createLinkReader
	 * 	Create a [Link-Reader]{@link @ui5/fs/readers/Filter} with the given reader.
	 * @property {Function} createFlatReader Create a [Link-Reader]{@link @ui5/fs/readers/Link}
	 * where all requests are prefixed with <code>/resources/<namespace></code>.
	 */

	/**
	 * Provides limited access to [@ui5/fs/resourceFactory]{@link @ui5/fs/resourceFactory} functions
	 *
	 * </br></br>
	 * This attribute is only available to custom server middleware extensions defining
	 * <b>Specification Version 3.0 and above</b>.
	 *
	 * @type {@ui5/server/middleware/MiddlewareUtil~resourceFactory}
	 * @public
	 */
	resourceFactory = {
		createResource,
		createReaderCollection,
		createReaderCollectionPrioritized,
		createFilterReader,
		createLinkReader,
		createFlatReader,
	};

	/**
	 * Get an interface to an instance of this class that only provides those functions
	 * that are supported by the given custom middleware extension specification version.
	 *
	 * @param {@ui5/project/specifications/SpecificationVersion} specVersion
	 * SpecVersionComparator instance of the custom server middleware
	 * @returns {object} An object with bound instance methods supported by the given specification version
	 */
	getInterface(specVersion) {
		if (specVersion.lt("2.0")) {
			// Custom middleware defining specVersion <2.0 does not have access to any MiddlewareUtil API
			return undefined;
		}

		const baseInterface = {};
		bindFunctions(this, baseInterface, [
			"getPathname", "getMimeInfo"
		]);

		if (specVersion.gte("3.0")) {
			// getProject function, returning an interfaced project instance
			baseInterface.getProject = (projectName) => {
				const project = this.getProject(projectName);
				const baseProjectInterface = {};
				bindFunctions(project, baseProjectInterface, [
					"getType", "getName", "getVersion", "getNamespace",
					"getRootReader", "getRootPath", "getSourcePath",
					"getCustomConfiguration", "isFrameworkProject", "getFrameworkName",
					"getFrameworkVersion", "getFrameworkDependencies"
				]);
				// Project#getReader defaults to style "buildtime". However ui5-server uses
				// style "runtime". The main difference is that for some project types (like applications)
				// the /resources/<namespace> path prefix is omitted for "runtime". Also, no builder resource-
				// exclude configuration is applied.
				// Therefore default to style "runtime" here so that custom middleware will commonly work with
				// the same paths as ui5-server and no unexpected builder-excludes.
				baseProjectInterface.getReader = function(options = {style: "runtime"}) {
					return project.getReader(options);
				};
				return baseProjectInterface;
			};
			// getDependencies function, returning an array of project names
			baseInterface.getDependencies = (projectName) => {
				return this.getDependencies(projectName);
			};

			baseInterface.resourceFactory = Object.create(null);
			[
				// Once new functions get added, extract this array into a variable
				// and enhance based on spec version once new functions get added
				"createResource", "createReaderCollection", "createReaderCollectionPrioritized",
				"createFilterReader", "createLinkReader", "createFlatReader",
			].forEach((factoryFunction) => {
				baseInterface.resourceFactory[factoryFunction] = this.resourceFactory[factoryFunction];
			});
		}
		return baseInterface;
	}
}

function bindFunctions(sourceObject, targetObject, funcNames) {
	funcNames.forEach((funcName) => {
		targetObject[funcName] = sourceObject[funcName].bind(sourceObject);
	});
}

export default MiddlewareUtil;

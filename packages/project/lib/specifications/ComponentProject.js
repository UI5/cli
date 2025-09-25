import {promisify} from "node:util";
import Project from "./Project.js";
import * as resourceFactory from "@ui5/fs/resourceFactory";

/**
 * Subclass for projects potentially containing Components
 *
 * @public
 * @abstract
 * @class
 * @alias @ui5/project/specifications/ComponentProject
 * @extends @ui5/project/specifications/Project
 * @hideconstructor
 */
class ComponentProject extends Project {
	constructor(parameters) {
		super(parameters);
		if (new.target === ComponentProject) {
			throw new TypeError("Class 'ComponentProject' is abstract. Please use one of the 'types' subclasses");
		}

		this._pPom = null;
		this._namespace = null;
		this._isRuntimeNamespaced = true;
	}

	/* === Attributes === */
	/**
	 * Get the project namespace
	 *
	 * @public
	 * @returns {string} Project namespace in slash notation (e.g. <code>my/project/name</code>)
	 */
	getNamespace() {
		return this._namespace;
	}

	/**
	* @private
	*/
	getCopyright() {
		return this._config.metadata.copyright;
	}

	/**
	* @private
	*/
	getComponentPreloadPaths() {
		return this._config.builder && this._config.builder.componentPreload &&
			this._config.builder.componentPreload.paths || [];
	}

	/**
	* @private
	*/
	getComponentPreloadNamespaces() {
		return this._config.builder && this._config.builder.componentPreload &&
			this._config.builder.componentPreload.namespaces || [];
	}

	/**
	* @private
	*/
	getComponentPreloadExcludes() {
		return this._config.builder && this._config.builder.componentPreload &&
			this._config.builder.componentPreload.excludes || [];
	}

	/**
	* @private
	*/
	getMinificationExcludes() {
		return this._config.builder && this._config.builder.minification &&
			this._config.builder.minification.excludes || [];
	}

	/**
	* @private
	*/
	getBundles() {
		return this._config.builder && this._config.builder.bundles || [];
	}

	/**
	* @private
	*/
	getPropertiesFileSourceEncoding() {
		return this._config.resources && this._config.resources.configuration &&
			this._config.resources.configuration.propertiesFileSourceEncoding || "UTF-8";
	}

	/* === Resource Access === */

	/**
	 * Get a [ReaderCollection]{@link @ui5/fs/ReaderCollection} for accessing all resources of the
	 * project in the specified "style":
	 *
	 * <ul>
	 * <li><b>buildtime:</b> Resource paths are always prefixed with <code>/resources/</code>
	 *  or <code>/test-resources/</code> followed by the project's namespace.
	 *  Any configured build-excludes are applied</li>
	 * <li><b>dist:</b> Resource paths always match with what the UI5 runtime expects.
	 *  This means that paths generally depend on the project type. Applications for example use a "flat"-like
	 *  structure, while libraries use a "buildtime"-like structure.
	 *  Any configured build-excludes are applied</li>
	 * <li><b>runtime:</b> Resource paths always match with what the UI5 runtime expects.
	 *  This means that paths generally depend on the project type. Applications for example use a "flat"-like
	 *  structure, while libraries use a "buildtime"-like structure.
	 *  This style is typically used for serving resources directly. Therefore, build-excludes are not applied
	 * <li><b>flat:</b> Resource paths are never prefixed and namespaces are omitted if possible. Note that
	 *  project types like "theme-library", which can have multiple namespaces, can't omit them.
	 *  Any configured build-excludes are applied</li>
	 * </ul>
	 *
	 * If project resources have been changed through the means of a workspace, those changes
	 * are reflected in the provided reader too.
	 *
	 * Resource readers always use POSIX-style paths.
	 *
	 * @public
	 * @param {object} [options]
	 * @param {string} [options.style=buildtime] Path style to access resources.
	 *   Can be "buildtime", "dist", "runtime" or "flat"
	 * @returns {@ui5/fs/ReaderCollection} A reader collection instance
	 */
	getReader({style = "buildtime"} = {}) {
		// TODO: Additional style 'ABAP' using "sap.platform.abap".uri from manifest.json?

		// Apply builder excludes to all styles but "runtime"
		const excludes = style === "runtime" ? [] : this.getBuilderResourcesExcludes();

		if ((style === "runtime" || style === "dist") && this._isRuntimeNamespaced) {
			// If the project's type requires a namespace at runtime, the
			// dist- and runtime-style paths are identical to buildtime-style paths
			style = "buildtime";
		}
		let reader = this._getReader(excludes);
		switch (style) {
		case "buildtime":
			break;
		case "runtime":
		case "dist":
			// Use buildtime reader and link it to /
			// No test-resources for runtime resource access,
			// unless runtime is namespaced
			reader = resourceFactory.createFlatReader({
				reader,
				namespace: this._namespace
			});
			break;
		case "flat":
			// Use buildtime reader and link it to /
			// No test-resources for runtime resource access,
			// unless runtime is namespaced
			reader = resourceFactory.createFlatReader({
				reader,
				namespace: this._namespace
			});
			break;
		default:
			throw new Error(`Unknown path mapping style ${style}`);
		}

		reader = this._addWriter(reader, style);
		return reader;
	}

	/**
	* Get a resource reader for the resources of the project
	*
	* @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	_getSourceReader() {
		throw new Error(`_getSourceReader must be implemented by subclass ${this.constructor.name}`);
	}

	/**
	* Get a resource reader for the test resources of the project
	*
	* @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	_getTestReader() {
		throw new Error(`_getTestReader must be implemented by subclass ${this.constructor.name}`);
	}

	/**
	 * Get a resource reader/writer for accessing and modifying a project's resources
	 *
	 * @public
	 * @returns {@ui5/fs/ReaderCollection} A reader collection instance
	 */
	getWorkspace() {
		// Workspace is always of style "buildtime"
		// Therefore builder resource-excludes are always to be applied
		const excludes = this.getBuilderResourcesExcludes();
		return resourceFactory.createWorkspace({
			name: `Workspace for project ${this.getName()}`,
			reader: this._getReader(excludes),
			writer: this._getWriter().collection
		});
	}

	_getWriter() {
		if (!this._writers) {
			// writer is always of style "buildtime"
			const namespaceWriter = resourceFactory.createAdapter({
				virBasePath: "/",
				project: this
			});

			const generalWriter = resourceFactory.createAdapter({
				virBasePath: "/",
				project: this
			});

			const collection = resourceFactory.createWriterCollection({
				name: `Writers for project ${this.getName()}`,
				writerMapping: {
					[`/resources/${this._namespace}/`]: namespaceWriter,
					[`/test-resources/${this._namespace}/`]: namespaceWriter,
					[`/`]: generalWriter
				}
			});

			this._writers = {
				namespaceWriter,
				generalWriter,
				collection
			};
		}
		return this._writers;
	}

	_getReader(excludes) {
		let reader = this._getSourceReader(excludes);
		const testReader = this._getTestReader(excludes);
		if (testReader) {
			reader = resourceFactory.createReaderCollection({
				name: `Reader collection for project ${this.getName()}`,
				readers: [reader, testReader]
			});
		}
		return reader;
	}

	_addWriter(reader, style) {
		const {namespaceWriter, generalWriter} = this._getWriter();

		if ((style === "runtime" || style === "dist") && this._isRuntimeNamespaced) {
			// If the project's type requires a namespace at runtime, the
			// dist- and runtime-style paths are identical to buildtime-style paths
			style = "buildtime";
		}
		const readers = [];
		switch (style) {
		case "buildtime":
			// Writer already uses buildtime style
			readers.push(namespaceWriter);
			readers.push(generalWriter);
			break;
		case "runtime":
		case "dist":
			// Runtime is not namespaced: link namespace to /
			readers.push(resourceFactory.createFlatReader({
				reader: namespaceWriter,
				namespace: this._namespace
			}));
			// Add general writer as is
			readers.push(generalWriter);
			break;
		case "flat":
			// Rewrite paths from "flat" to "buildtime"
			readers.push(resourceFactory.createFlatReader({
				reader: namespaceWriter,
				namespace: this._namespace
			}));
			// General writer resources can't be flattened, so they are not available
			break;
		default:
			throw new Error(`Unknown path mapping style ${style}`);
		}
		readers.push(reader);

		return resourceFactory.createReaderCollectionPrioritized({
			name: `Reader/Writer collection for project ${this.getName()}`,
			readers
		});
	}

	/* === Internals === */
	/**
	 * @private
	 * @param {object} config Configuration object
	*/
	async _parseConfiguration(config) {
		await super._parseConfiguration(config);
	}

	async _getNamespace() {
		throw new Error(`_getNamespace must be implemented by subclass ${this.constructor.name}`);
	}

	/* === Helper === */
	/**
	 * Checks whether a given string contains a maven placeholder.
	 * E.g. <code>${appId}</code>.
	 *
	 * @param {string} value String to check
	 * @returns {boolean} True if given string contains a maven placeholder
	 */
	_hasMavenPlaceholder(value) {
		return !!value.match(/^\$\{(.*)\}$/);
	}

	/**
	 * Resolves a maven placeholder in a given string using the projects pom.xml
	 *
	 * @param {string} value String containing a maven placeholder
	 * @returns {Promise<string>} Resolved string
	 */
	async _resolveMavenPlaceholder(value) {
		const parts = value && value.match(/^\$\{(.*)\}$/);
		if (parts) {
			this._log.verbose(
				`"${value}" contains a maven placeholder "${parts[1]}". Resolving from projects pom.xml...`);
			const pom = await this._getPom();
			let mvnValue;
			if (pom.project && pom.project.properties && pom.project.properties[parts[1]]) {
				mvnValue = pom.project.properties[parts[1]];
			} else {
				let obj = pom;
				parts[1].split(".").forEach((part) => {
					obj = obj && obj[part];
				});
				mvnValue = obj;
			}
			if (!mvnValue) {
				throw new Error(`"${value}" couldn't be resolved from maven property ` +
					`"${parts[1]}" of pom.xml of project ${this.getName()}`);
			}
			return mvnValue;
		} else {
			throw new Error(`"${value}" is not a maven placeholder`);
		}
	}

	/**
	 * Reads the projects pom.xml file
	 *
	 * @returns {Promise<object>} Resolves with a JSON representation of the content
	 */
	async _getPom() {
		if (this._pPom) {
			return this._pPom;
		}

		return this._pPom = this.getRootReader().byPath("/pom.xml")
			.then(async (resource) => {
				if (!resource) {
					throw new Error(
						`Could not find pom.xml in project ${this.getName()}`);
				}
				const content = await resource.getString();
				const {
					default: xml2js
				} = await import("xml2js");
				const parser = new xml2js.Parser({
					explicitArray: false,
					ignoreAttrs: true
				});
				const readXML = promisify(parser.parseString);
				return readXML(content);
			}).catch((err) => {
				throw new Error(
					`Failed to read pom.xml for project ${this.getName()}: ${err.message}`);
			});
	}
}

export default ComponentProject;

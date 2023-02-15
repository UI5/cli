import fsPath from "node:path";
import posixPath from "node:path/posix";
import {promisify} from "node:util";
import ComponentProject from "../ComponentProject.js";
import * as resourceFactory from "@ui5/fs/resourceFactory";

/**
 * Library
 *
 * @public
 * @class
 * @alias @ui5/project/specifications/types/Library
 * @extends @ui5/project/specifications/ComponentProject
 * @hideconstructor
 */
class Library extends ComponentProject {
	constructor(parameters) {
		super(parameters);

		this._pManifest = null;
		this._pDotLibrary = null;
		this._pLibraryJs = null;

		this._srcPath = "src";
		this._testPath = "test";
		this._testPathExists = false;
		this._isSourceNamespaced = true;

		this._propertiesFilesSourceEncoding = "UTF-8";
	}

	/* === Attributes === */
	/**
	*
	* @private
	*/
	getLibraryPreloadExcludes() {
		return this._config.builder && this._config.builder.libraryPreload &&
			this._config.builder.libraryPreload.excludes || [];
	}

	/**
	* @private
	*/
	getJsdocExcludes() {
		return this._config.builder && this._config.builder.jsdoc && this._config.builder.jsdoc.excludes || [];
	}

	/**
	 * Get the path of the project's source directory. This might not be POSIX-style on some platforms.
	 *
	 * @public
	 * @returns {string} Absolute path to the source directory of the project
	 */
	getSourcePath() {
		return fsPath.join(this.getRootPath(), this._srcPath);
	}

	/* === Resource Access === */
	/**
	* Get a resource reader for the sources of the project (excluding any test resources)
	*
	* @param {string[]} excludes List of glob patterns to exclude
	* @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	_getSourceReader(excludes) {
		// TODO: Throw for libraries with additional namespaces like sap.ui.core?
		let virBasePath = "/resources/";
		if (!this._isSourceNamespaced) {
			// In case the namespace is not represented in the source directory
			// structure, add it to the virtual base path
			virBasePath += `${this._namespace}/`;
		}
		return resourceFactory.createReader({
			fsBasePath: this.getSourcePath(),
			virBasePath,
			name: `Source reader for library project ${this.getName()}`,
			project: this,
			excludes
		});
	}

	/**
	* Get a resource reader for the test-resources of the project
	*
	* @param {string[]} excludes List of glob patterns to exclude
	* @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	_getTestReader(excludes) {
		if (!this._testPathExists) {
			return null;
		}
		let virBasePath = "/test-resources/";
		if (!this._isSourceNamespaced) {
			// In case the namespace is not represented in the source directory
			// structure, add it to the virtual base path
			virBasePath += `${this._namespace}/`;
		}
		const testReader = resourceFactory.createReader({
			fsBasePath: fsPath.join(this.getRootPath(), this._testPath),
			virBasePath,
			name: `Runtime test-resources reader for library project ${this.getName()}`,
			project: this,
			excludes
		});
		return testReader;
	}

	/**
	 *
	 * Get a resource reader for the sources of the project (excluding any test resources)
	 * In the future the path structure can be flat or namespaced depending on the project
	 *
	 * @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	_getRawSourceReader() {
		return resourceFactory.createReader({
			fsBasePath: this.getSourcePath(),
			virBasePath: "/",
			name: `Source reader for library project ${this.getName()}`,
			project: this
		});
	}

	/* === Internals === */
	/**
	 * @private
	 * @param {object} config Configuration object
	*/
	async _configureAndValidatePaths(config) {
		await super._configureAndValidatePaths(config);

		if (config.resources && config.resources.configuration && config.resources.configuration.paths) {
			if (config.resources.configuration.paths.src) {
				this._srcPath = config.resources.configuration.paths.src;
			}
			if (config.resources.configuration.paths.test) {
				this._testPath = config.resources.configuration.paths.test;
			}
		}
		if (!(await this._dirExists("/" + this._srcPath))) {
			throw new Error(
				`Unable to find source directory '${this._srcPath}' in library project ${this.getName()}`);
		}
		this._testPathExists = await this._dirExists("/" + this._testPath);

		this._log.verbose(`Path mapping for library project ${this.getName()}:`);
		this._log.verbose(`  Physical root path: ${this.getRootPath()}`);
		this._log.verbose(`  Mapped to:`);
		this._log.verbose(`    /resources/ => ${this._srcPath}`);
		this._log.verbose(
			`    /test-resources/ => ${this._testPath}${this._testPathExists ? "" : " [does not exist]"}`);
	}

	/**
	 * @private
	 * @param {object} config Configuration object
	 * @param {object} buildDescription Cache metadata object
	*/
	async _parseConfiguration(config, buildDescription) {
		await super._parseConfiguration(config, buildDescription);

		if (buildDescription) {
			this._namespace = buildDescription.namespace;
			return;
		}

		this._namespace = await this._getNamespace();

		if (!config.metadata.copyright) {
			const copyright = await this._getCopyrightFromDotLibrary();
			if (copyright) {
				config.metadata.copyright = copyright;
			}
		}

		if (this.isFrameworkProject()) {
			// Only framework projects are allowed to provide preload-excludes in their .library file,
			// and only if it is not already defined in the ui5.yaml
			if (config.builder?.libraryPreload?.excludes) {
				this._log.verbose(
					`Using preload excludes for framework library ${this.getName()} from project configuration`);
			} else {
				this._log.verbose(
					`No preload excludes defined in project configuration of framework library ` +
					`${this.getName()}. Falling back to .library...`);
				const excludes = await this._getPreloadExcludesFromDotLibrary();
				if (excludes) {
					if (!config.builder) {
						config.builder = {};
					}
					if (!config.builder.libraryPreload) {
						config.builder.libraryPreload = {};
					}
					config.builder.libraryPreload.excludes = excludes;
				}
			}
		}
	}

	/**
	 * Determine library namespace by checking manifest.json with fallback to .library.
	 * Any maven placeholders are resolved from the projects pom.xml
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async _getNamespace() {
		// Trigger both reads asynchronously
		const [{
			namespace: manifestNs,
			filePath: manifestPath
		}, {
			namespace: dotLibraryNs,
			filePath: dotLibraryPath
		}] = await Promise.all([
			this._getNamespaceFromManifest(),
			this._getNamespaceFromDotLibrary()
		]);

		let libraryNs;
		let namespacePath;
		if (manifestNs && dotLibraryNs) {
			// Both files present
			// => check whether they are on the same level
			const manifestDepth = manifestPath.split("/").length;
			const dotLibraryDepth = dotLibraryPath.split("/").length;

			if (manifestDepth < dotLibraryDepth) {
				// We see the .library file as the "leading" file of a library
				// Therefore, a manifest.json on a higher level is something we do not except
				throw new Error(`Failed to detect namespace for project ${this.getName()}: ` +
					`Found a manifest.json on a higher directory level than the .library file. ` +
					`It should be on the same or a lower level. ` +
					`Note that a manifest.json on a lower level will be ignored.\n` +
					`  manifest.json path: ${manifestPath}\n` +
					`  is higher than\n` +
					`  .library path: ${dotLibraryPath}`);
			}
			if (manifestDepth === dotLibraryDepth) {
				if (posixPath.dirname(manifestPath) !== posixPath.dirname(dotLibraryPath)) {
					// This just should not happen in your project
					throw new Error(`Failed to detect namespace for project ${this.getName()}: ` +
					`Found a manifest.json on the same directory level but in a different directory ` +
					`than the .library file. They should be in the same directory.\n` +
					`  manifest.json path: ${manifestPath}\n` +
					`  is different to\n` +
					`  .library path: ${dotLibraryPath}`);
				}
				// Typical scenario if both files are present
				this._log.verbose(
					`Found a manifest.json and a .library file on the same level for ` +
					`project ${this.getName()}.`);
				this._log.verbose(
					`Resolving namespace of project ${this.getName()} from manifest.json...`);
				libraryNs = manifestNs;
				namespacePath = posixPath.dirname(manifestPath);
			} else {
				// Typical scenario: Some nested component has a manifest.json but the library itself only
				// features a .library.  => Ignore the manifest.json
				this._log.verbose(
					`Ignoring manifest.json found on a lower level than the .library file of ` +
					`project ${this.getName()}.`);
				this._log.verbose(
					`Resolving namespace of project ${this.getName()} from .library...`);
				libraryNs = dotLibraryNs;
				namespacePath = posixPath.dirname(dotLibraryPath);
			}
		} else if (manifestNs) {
			// Only manifest available
			this._log.verbose(
				`Resolving namespace of project ${this.getName()} from manifest.json...`);
			libraryNs = manifestNs;
			namespacePath = posixPath.dirname(manifestPath);
		} else if (dotLibraryNs) {
			// Only .library available
			this._log.verbose(
				`Resolving namespace of project ${this.getName()} from .library...`);
			libraryNs = dotLibraryNs;
			namespacePath = posixPath.dirname(dotLibraryPath);
		} else {
			this._log.verbose(
				`Failed to resolve namespace of project ${this.getName()} from manifest.json ` +
				`or .library file. Falling back to library.js file path...`);
		}

		let namespace;
		if (libraryNs) {
			// Maven placeholders can only exist in manifest.json or .library configuration
			if (this._hasMavenPlaceholder(libraryNs)) {
				try {
					libraryNs = await this._resolveMavenPlaceholder(libraryNs);
				} catch (err) {
					throw new Error(
						`Failed to resolve namespace maven placeholder of project ` +
						`${this.getName()}: ${err.message}`);
				}
			}

			namespace = libraryNs.replace(/\./g, "/");
			if (namespacePath === "/") {
				this._log.verbose(`Detected flat library source structure for project ${this.getName()}`);
				this._isSourceNamespaced = false;
			} else {
				namespacePath = namespacePath.replace("/", ""); // remove leading slash
				if (namespacePath !== namespace) {
					throw new Error(
						`Detected namespace "${namespace}" does not match detected directory ` +
						`structure "${namespacePath}" for project ${this.getName()}`);
				}
			}
		} else {
			try {
				const libraryJsPath = await this._getLibraryJsPath();
				namespacePath = posixPath.dirname(libraryJsPath);
				namespace = namespacePath.replace("/", ""); // remove leading slash
				if (namespace === "") {
					throw new Error(`Found library.js file in root directory. ` +
						`Expected it to be in namespace directory.`);
				}
				this._log.verbose(
					`Deriving namespace for project ${this.getName()} from ` +
					`path of library.js file`);
			} catch (err) {
				this._log.verbose(
					`Namespace resolution from library.js file path failed for project ` +
					`${this.getName()}: ${err.message}`);
			}
		}

		if (!namespace) {
			throw new Error(`Failed to detect namespace or namespace is empty for ` +
				`project ${this.getName()}. Check verbose log for details.`);
		}

		this._log.verbose(
			`Namespace of project ${this.getName()} is ${namespace}`);
		return namespace;
	}

	async _getNamespaceFromManifest() {
		try {
			const {content: manifest, filePath} = await this._getManifest();
			// check for a proper sap.app/id in manifest.json to determine namespace
			if (manifest["sap.app"] && manifest["sap.app"].id) {
				const namespace = manifest["sap.app"].id;
				this._log.verbose(
					`Found namespace ${namespace} in manifest.json of project ${this.getName()} ` +
					`at ${filePath}`);
				return {
					namespace,
					filePath
				};
			} else {
				throw new Error(
					`No sap.app/id configuration found in manifest.json of project ${this.getName()} ` +
					`at ${filePath}`);
			}
		} catch (err) {
			this._log.verbose(
				`Namespace resolution from manifest.json failed for project ` +
				`${this.getName()}: ${err.message}`);
		}
		return {};
	}

	async _getNamespaceFromDotLibrary() {
		try {
			const {content: dotLibrary, filePath} = await this._getDotLibrary();
			const namespace = dotLibrary?.library?.name?._;
			if (namespace) {
				this._log.verbose(
					`Found namespace ${namespace} in .library file of project ${this.getName()} ` +
					`at ${filePath}`);
				return {
					namespace,
					filePath
				};
			} else {
				throw new Error(
					`No library name found in .library of project ${this.getName()} ` +
					`at ${filePath}`);
			}
		} catch (err) {
			this._log.verbose(
				`Namespace resolution from .library failed for project ` +
				`${this.getName()}: ${err.message}`);
		}
		return {};
	}

	/**
	 * Determines library copyright from given project configuration with fallback to .library.
	 *
	 * @returns {string|null} Copyright of the project
	 */
	async _getCopyrightFromDotLibrary() {
		try {
			// If no copyright replacement was provided by ui5.yaml,
			// check if the .library file has a valid copyright replacement
			const {content: dotLibrary, filePath} = await this._getDotLibrary();
			if (dotLibrary?.library?.copyright?._) {
				this._log.verbose(
					`Using copyright from ${filePath} for project ${this.getName()}...`);
				return dotLibrary.library.copyright._;
			} else {
				this._log.verbose(
					`No copyright configuration found in ${filePath} ` +
					`of project ${this.getName()}`);
				return null;
			}
		} catch (err) {
			this._log.verbose(
				`Copyright determination from .library failed for project ` +
				`${this.getName()}: ${err.message}`);
			return null;
		}
	}

	async _getPreloadExcludesFromDotLibrary() {
		const {content: dotLibrary, filePath} = await this._getDotLibrary();
		let excludes = dotLibrary?.library?.appData?.packaging?.["all-in-one"]?.exclude;
		if (excludes) {
			if (!Array.isArray(excludes)) {
				excludes = [excludes];
			}
			this._log.verbose(
				`Found ${excludes.length} preload excludes in .library file of ` +
				`project ${this.getName()} at ${filePath}`);
			return excludes.map((exclude) => {
				return exclude.$.name;
			});
		} else {
			this._log.verbose(
				`No preload excludes found in .library of project ${this.getName()} ` +
				`at ${filePath}`);
			return null;
		}
	}

	/**
	 * Reads the projects manifest.json
	 *
	 * @returns {Promise<object>} resolves with an object containing the <code>content</code> (as JSON) and
	 * 							<code>filePath</code> (as string) of the manifest.json file
	 */
	async _getManifest() {
		if (this._pManifest) {
			return this._pManifest;
		}
		return this._pManifest = this._getRawSourceReader().byGlob("**/manifest.json")
			.then(async (manifestResources) => {
				if (!manifestResources.length) {
					throw new Error(`Could not find manifest.json file for project ${this.getName()}`);
				}
				if (manifestResources.length > 1) {
					throw new Error(`Found multiple (${manifestResources.length}) manifest.json files ` +
						`for project ${this.getName()}`);
				}
				const resource = manifestResources[0];
				try {
					return {
						content: JSON.parse(await resource.getString()),
						filePath: resource.getPath()
					};
				} catch (err) {
					throw new Error(
						`Failed to read ${resource.getPath()} for project ${this.getName()}: ${err.message}`);
				}
			});
	}

	/**
	 * Reads the .library file
	 *
	 * @returns {Promise<object>} resolves with an object containing the <code>content</code> (as JSON) and
	 * 							<code>filePath</code> (as string) of the .library file
	 */
	async _getDotLibrary() {
		if (this._pDotLibrary) {
			return this._pDotLibrary;
		}
		return this._pDotLibrary = this._getRawSourceReader().byGlob("**/.library")
			.then(async (dotLibraryResources) => {
				if (!dotLibraryResources.length) {
					throw new Error(`Could not find .library file for project ${this.getName()}`);
				}
				if (dotLibraryResources.length > 1) {
					throw new Error(`Found multiple (${dotLibraryResources.length}) .library files ` +
						`for project ${this.getName()}`);
				}
				const resource = dotLibraryResources[0];
				const content = await resource.getString();

				try {
					const {
						default: xml2js
					} = await import("xml2js");
					const parser = new xml2js.Parser({
						explicitArray: false,
						explicitCharkey: true
					});
					const readXML = promisify(parser.parseString);
					return {
						content: await readXML(content),
						filePath: resource.getPath()
					};
				} catch (err) {
					throw new Error(
						`Failed to read ${resource.getPath()} for project ${this.getName()}: ${err.message}`);
				}
			});
	}

	/**
	 * Determines the path of the library.js file
	 *
	 * @returns {Promise<string>} resolves with an a string containing the file system path
	 *								of the library.js file
	 */
	async _getLibraryJsPath() {
		if (this._pLibraryJs) {
			return this._pLibraryJs;
		}
		return this._pLibraryJs = this._getRawSourceReader().byGlob("**/library.js")
			.then(async (libraryJsResources) => {
				if (!libraryJsResources.length) {
					throw new Error(`Could not find library.js file for project ${this.getName()}`);
				}
				if (libraryJsResources.length > 1) {
					throw new Error(`Found multiple (${libraryJsResources.length}) library.js files ` +
						`for project ${this.getName()}`);
				}
				// Content is not yet relevant, so don't read it
				return libraryJsResources[0].getPath();
			});
	}
}

export default Library;

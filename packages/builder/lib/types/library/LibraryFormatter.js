const log = require("@ui5/logger").getLogger("types:library:LibraryFormatter");
const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const glob = require("globby");
const AbstractUi5Formatter = require("../AbstractUi5Formatter");

const SAP_THEMES_NS_EXEMPTIONS = ["themelib_sap_fiori_3", "themelib_sap_bluecrystal", "themelib_sap_belize"];

function isFrameworkProject(project) {
	return project.id.startsWith("@openui5/") || project.id.startsWith("@sapui5/");
}

class LibraryFormatter extends AbstractUi5Formatter {
	/**
	 * Formats and validates the project
	 *
	 * @returns {Promise}
	 */
	async format() {
		const project = this._project;
		await this.validate();

		log.verbose("Formatting library project %s...", project.metadata.name);
		project.resources.pathMappings = {
			"/resources/": project.resources.configuration.paths.src
		};

		if (project.resources.configuration.paths.test) {
			// Directory 'test' is somewhat optional for libraries
			project.resources.pathMappings["/test-resources/"] = project.resources.configuration.paths.test;
		} else {
			log.verbose(`Ignoring 'test' directory for project ${project.metadata.name}. ` +
				"Either no setting was provided or the path not found.");
		}

		try {
			project.metadata.namespace = await this.getNamespace();
		} catch (err) {
			if (SAP_THEMES_NS_EXEMPTIONS.includes(this._project.metadata.name)) {
				// Exceptional handling for SAP theme libraries which used to be of type "library"
				//	(today they use "theme-library").
				// To allow use of OpenUI5 theme libraries in versions lower than 1.75 we must ignore
				//	namespace detection errors.
				log.verbose(`Ignoring failed namespace detection for exempted SAP theme library ` +
					`${this._project.metadata.name}: ${err.message}`);
			} else {
				throw err;
			}
		}

		try {
			project.metadata.copyright = await this.getCopyright();
		} catch (err) {
			// Catch error because copyright is optional
			// TODO 2.0: Make copyright mandatory and just let the error throw
			log.verbose(err.message);
		}

		if (isFrameworkProject(project) && !SAP_THEMES_NS_EXEMPTIONS.includes(this._project.metadata.name)) {
			if (project.builder && project.builder.libraryPreload && project.builder.libraryPreload.excludes) {
				log.verbose(
					`Using preload excludes for framework library ${project.metadata.name} from project configuration`);
			} else {
				log.verbose(
					`No preload excludes defined in project configuration of framework library ` +
					`${project.metadata.name}. Falling back to .library...`);
				const excludes = await this.getPreloadExcludesFromDotLibrary();
				if (excludes) {
					if (!project.builder) {
						project.builder = {};
					}
					if (!project.builder.libraryPreload) {
						project.builder.libraryPreload = {};
					}
					project.builder.libraryPreload.excludes = excludes;
				}
			}
		}
	}

	/**
	 * Returns the base *source* path of the project. Runtime resources like manifest.json are expected
	 * to be located inside this path.
	 *
	 * @param {boolean} [posix] whether to return a POSIX path
	 * @returns {string} Base source path of the project
	 */
	getSourceBasePath(posix) {
		let p = path;
		let projectPath = this._project.path;
		if (posix) {
			projectPath = projectPath.replace(/\\/g, "/");
			p = path.posix;
		}
		return p.join(projectPath, this._project.resources.pathMappings["/resources/"]);
	}

	/**
	 * Determine library namespace by checking manifest.json with fallback to .library.
	 * Any maven placeholders are resolved from the projects pom.xml
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async getNamespace() {
		// Trigger both reads asynchronously
		const [{
			namespace: manifestNs,
			fsPath: manifestPath
		}, {
			namespace: dotLibraryNs,
			fsPath: dotLibraryPath
		}] = await Promise.all([
			this.getNamespaceFromManifest(),
			this.getNamespaceFromDotLibrary()
		]);

		let libraryNs;
		let fsNamespacePath;
		if (manifestNs && dotLibraryNs) {
			// Both files present
			// => check whether they are on the same level
			const manifestDepth = manifestPath.split(path.sep).length;
			const dotLibraryDepth = dotLibraryPath.split(path.sep).length;

			if (manifestDepth < dotLibraryDepth) {
				// We see the .library file as the "leading" file of a library
				// Therefore, a manifest.json on a higher level is something we do not except
				throw new Error(`Failed to detect namespace for project ${this._project.metadata.name}: ` +
					`Found a manifest.json on a higher directory level than the .library file. ` +
					`It should be on the same or a lower level. ` +
					`Note that a manifest.json on a lower level will be ignored.\n` +
					`  manifest.json path: ${manifestPath}\n` +
					`  is higher than\n` +
					`  .library path: ${dotLibraryPath}`);
			}
			if (manifestDepth === dotLibraryDepth) {
				if (path.dirname(manifestPath) !== path.dirname(dotLibraryPath)) {
					// This just should not happen in your project
					throw new Error(`Failed to detect namespace for project ${this._project.metadata.name}: ` +
					`Found a manifest.json on the same directory level but in a different directory ` +
					`than the .library file. They should be in the same directory.\n` +
					`  manifest.json path: ${manifestPath}\n` +
					`  is different to\n` +
					`  .library path: ${dotLibraryPath}`);
				}
				// Typical scenario if both files are present
				log.verbose(`Found a manifest.json and a .library file on the same level for ` +
					`project ${this._project.metadata.name}.`);
				log.verbose(`Resolving namespace of project ${this._project.metadata.name} from manifest.json...`);
				libraryNs = manifestNs;
				fsNamespacePath = path.dirname(manifestPath);
			} else {
				// Typical scenario: Some nested component has a manifest.json but the library itself only
				// features a .library.  => Ignore the manifest.json
				log.verbose(`Ignoring manifest.json found on a lower level than the .library file of ` +
					`project ${this._project.metadata.name}.`);
				log.verbose(`Resolving namespace of project ${this._project.metadata.name} from .library...`);
				libraryNs = dotLibraryNs;
				fsNamespacePath = path.dirname(dotLibraryPath);
			}
		} else if (manifestNs) {
			// Only manifest available
			log.verbose(`Resolving namespace of project ${this._project.metadata.name} from manifest.json...`);
			libraryNs = manifestNs;
			fsNamespacePath = path.dirname(manifestPath);
		} else if (dotLibraryNs) {
			// Only .library available
			log.verbose(`Resolving namespace of project ${this._project.metadata.name} from .library...`);
			libraryNs = dotLibraryNs;
			fsNamespacePath = path.dirname(dotLibraryPath);
		} else {
			log.verbose(`Failed to resolve namespace of project ${this._project.metadata.name} from manifest.json ` +
				`or .library file. Falling back to library.js file path...`);
		}

		let namespace;
		if (libraryNs) {
			// Maven placeholders can only exist in manifest.json or .library configuration
			if (this.hasMavenPlaceholder(libraryNs)) {
				try {
					libraryNs = await this.resolveMavenPlaceholder(libraryNs);
				} catch (err) {
					throw new Error(
						`Failed to resolve namespace maven placeholder of project ` +
						`${this._project.metadata.name}: ${err.message}`);
				}
			}

			namespace = libraryNs.replace(/\./g, "/");

			const namespacePath = this.getNamespaceFromFsPath(fsNamespacePath);
			if (namespacePath !== namespace) {
				throw new Error(
					`Detected namespace "${namespace}" does not match detected directory ` +
					`structure "${namespacePath}" for project ${this._project.metadata.name}`);
			}
		} else {
			try {
				const fsPath = await this.getLibraryJsPath();
				namespace = this.getNamespaceFromFsPath(path.dirname(fsPath));
				if (!namespace || namespace === "/") {
					throw new Error(`Found library.js file in root directory. ` +
						`Expected it to be in namespace directory.`);
				}
				log.verbose(`Deriving namespace for project ${this._project.metadata.name} from ` +
					`path of library.js file`);
			} catch (err) {
				log.verbose(`Namespace resolution from library.js file path failed for project ` +
					`${this._project.metadata.name}: ${err.message}`);
			}
		}

		if (!namespace) {
			throw new Error(`Failed to detect namespace or namespace is empty for ` +
				`project ${this._project.metadata.name}. Check verbose log for details.`);
		}

		log.verbose(`Namespace of project ${this._project.metadata.name} is ${namespace}`);
		return namespace;
	}

	async getNamespaceFromManifest() {
		try {
			const {content: manifest, fsPath} = await this.getManifest();
			// check for a proper sap.app/id in manifest.json to determine namespace
			if (manifest["sap.app"] && manifest["sap.app"].id) {
				const namespace = manifest["sap.app"].id;
				log.verbose(`Found namespace ${namespace} in manifest.json of project ${this._project.metadata.name} ` +
					`at ${fsPath}`);
				return {
					namespace,
					fsPath
				};
			} else {
				log.verbose(
					`No sap.app/id configuration found in manifest.json of project ${this._project.metadata.name} ` +
					`at ${fsPath}`);
			}
		} catch (err) {
			log.verbose(`Namespace resolution from manifest.json failed for project ` +
				`${this._project.metadata.name}: ${err.message}`);
		}
		return {};
	}

	async getNamespaceFromDotLibrary() {
		try {
			const {content: dotLibrary, fsPath} = await this.getDotLibrary();
			if (dotLibrary && dotLibrary.library && dotLibrary.library.name) {
				const namespace = dotLibrary.library.name._;
				log.verbose(`Found namespace ${namespace} in .library file of project ${this._project.metadata.name} ` +
					`at ${fsPath}`);
				return {
					namespace,
					fsPath
				};
			} else {
				throw new Error(
					`No library name found in .library of project ${this._project.metadata.name} ` +
					`at ${fsPath}`);
			}
		} catch (err) {
			log.verbose(`Namespace resolution from .library failed for project ` +
				`${this._project.metadata.name}: ${err.message}`);
		}
		return {};
	}

	getNamespaceFromFsPath(fsPath) {
		// Regex to ensure trailing slash
		const rOptionalTrailingSlash = /\/?$/;

		// Transform path to POSIX and ensure a trailing slash for correct comparison
		const posixFsPath = fsPath.replace(/\\/g, "/").replace(rOptionalTrailingSlash, "/");
		const posixBasePath = this.getSourceBasePath(true).replace(rOptionalTrailingSlash, "/");

		if (posixBasePath === posixFsPath) {
			// The given file system path does not contain a namespace path since it is equal to the source base path
			// Therefore return an empty namespace
			return "";
		}

		if (!posixFsPath.startsWith(posixBasePath)) {
			throw new Error(`Given file system path ${posixFsPath} is not based on source base ` +
				`path ${posixBasePath}.`);
		}

		// Remove base path from fsPath to get the namespace
		let namespacePath = posixFsPath.replace(posixBasePath, "");

		// Remove any leading and trailing slash
		namespacePath = namespacePath.replace(/(?:^\/)|(?:\/$)/g, "");
		return namespacePath;
	}

	/**
	 * Determines library copyright from given project configuration with fallback to .library.
	 *
	 * @returns {string} Copyright of the project
	 * @throws {Error} if copyright can not be determined
	 */
	async getCopyright() {
		if (this._project.metadata.copyright) {
			return this._project.metadata.copyright;
		}
		// If no copyright replacement was provided by ui5.yaml,
		// check if the .library file has a valid copyright replacement
		const {content: dotLibrary} = await this.getDotLibrary();
		if (dotLibrary && dotLibrary.library && dotLibrary.library.copyright) {
			log.verbose(`Using copyright from .library for project ${this._project.metadata.name}...`);
			return dotLibrary.library.copyright._;
		} else {
			throw new Error(`No copyright configuration found in .library ` +
				`of project ${this._project.metadata.name}`);
		}
	}

	async getPreloadExcludesFromDotLibrary() {
		const {content: dotLibrary, fsPath} = await this.getDotLibrary();
		if (dotLibrary && dotLibrary.library && dotLibrary.library.appData &&
			dotLibrary.library.appData.packaging &&
			dotLibrary.library.appData.packaging["all-in-one"] &&
			dotLibrary.library.appData.packaging["all-in-one"].exclude
		) {
			let excludes = dotLibrary.library.appData.packaging["all-in-one"].exclude;
			if (!Array.isArray(excludes)) {
				excludes = [excludes];
			}
			log.verbose(`Found ${excludes.length} preload excludes in .library file of ` +
				`project ${this._project.metadata.name} at ${fsPath}`);
			return excludes.map((exclude) => {
				return exclude.$.name;
			});
		} else {
			log.verbose(
				`No preload excludes found in .library of project ${this._project.metadata.name} ` +
				`at ${fsPath}`);
			return null;
		}
	}

	/**
	 * Reads the projects manifest.json
	 *
	 * @returns {Promise<object>} resolves with an object containing the <code>content</code> (as JSON) and
	 * 							<code>fsPath</code> (as string) of the manifest.json file
	 */
	async getManifest() {
		if (this._pManifest) {
			return this._pManifest;
		}
		const basePath = this.getSourceBasePath();
		return this._pManifest = glob("**/manifest.json", {
			cwd: basePath,
			followSymbolicLinks: false
		}).then(async (manifestResources) => {
			if (!manifestResources.length) {
				throw new Error(`Could not find manifest.json file for project ${this._project.metadata.name}`);
			}
			if (manifestResources.length > 1) {
				throw new Error(`Found multiple (${manifestResources.length}) manifest.json files ` +
					`for project ${this._project.metadata.name}`);
			}
			const fsPath = path.join(basePath, manifestResources[0]);
			try {
				const content = await readFile(fsPath);
				return {
					content: JSON.parse(content),
					fsPath
				};
			} catch (err) {
				throw new Error(
					`Failed to read manifest.json for project ${this._project.metadata.name}: ${err.message}`);
			}
		});
	}

	/**
	 * Reads the .library file
	 *
	 * @returns {Promise<object>} resolves with an object containing the <code>content</code> (as JSON) and
	 * 							<code>fsPath</code> (as string) of the .library file
	 */
	async getDotLibrary() {
		if (this._pDotLibrary) {
			return this._pDotLibrary;
		}
		const basePath = this.getSourceBasePath();
		return this._pDotLibrary = glob("**/.library", {
			cwd: basePath,
			followSymbolicLinks: false
		}).then(async (dotLibraryResources) => {
			if (!dotLibraryResources.length) {
				throw new Error(`Could not find .library file for project ${this._project.metadata.name}`);
			}
			if (dotLibraryResources.length > 1) {
				throw new Error(`Found multiple (${dotLibraryResources.length}) .library files ` +
					`for project ${this._project.metadata.name}`);
			}
			const fsPath = path.join(basePath, dotLibraryResources[0]);
			const content = await readFile(fsPath);
			const xml2js = require("xml2js");
			const parser = new xml2js.Parser({
				explicitArray: false,
				explicitCharkey: true
			});
			const readXML = promisify(parser.parseString);
			const contentJson = await readXML(content);
			return {
				content: contentJson,
				fsPath
			};
		});
	}

	/**
	 * Determines the path of the library.js file
	 *
	 * @returns {Promise<string>} resolves with an a string containing the file system path
	 *								of the library.js file
	 */
	async getLibraryJsPath() {
		if (this._pLibraryJs) {
			return this._pLibraryJs;
		}
		const basePath = this.getSourceBasePath();
		return this._pLibraryJs = glob("**/library.js", {
			cwd: basePath,
			followSymbolicLinks: false
		}).then(async (libraryJsResources) => {
			if (!libraryJsResources.length) {
				throw new Error(`Could not find library.js file for project ${this._project.metadata.name}`);
			}
			if (libraryJsResources.length > 1) {
				throw new Error(`Found multiple (${libraryJsResources.length}) library.js files ` +
					`for project ${this._project.metadata.name}`);
			}
			const fsPath = path.join(basePath, libraryJsResources[0]);

			// Content is not yet relevant, so don't read it
			return fsPath;
		});
	}

	/**
	 * Validates the project
	 *
	 * @returns {Promise} resolves if successfully validated
	 * @throws {Error} if validation fails
	 */
	validate() {
		const project = this._project;
		return Promise.resolve().then(() => {
			if (!project) {
				throw new Error("Project is undefined");
			} else if (!project.metadata || !project.metadata.name) {
				throw new Error(`"metadata.name" configuration is missing for project ${project.id}`);
			} else if (!project.type) {
				throw new Error(`"type" configuration is missing for project ${project.id}`);
			} else if (project.version === undefined) {
				throw new Error(`"version" is missing for project ${project.id}`);
			}
			if (!project.resources) {
				project.resources = {};
			}
			if (!project.resources.configuration) {
				project.resources.configuration = {};
			}
			if (!project.resources.configuration.paths) {
				project.resources.configuration.paths = {};
			}
			if (!project.resources.configuration.paths.src) {
				project.resources.configuration.paths.src = "src";
			}
			if (!project.resources.configuration.paths.test) {
				project.resources.configuration.paths.test = "test";
			}

			if (!project.resources.configuration.propertiesFileSourceEncoding) {
				if (["0.1", "1.0", "1.1"].includes(project.specVersion)) {
					// default encoding to "ISO-8859-1" for old specVersions
					project.resources.configuration.propertiesFileSourceEncoding = "ISO-8859-1";
				} else {
					// default encoding to "UTF-8" for all projects starting with specVersion 2.0
					project.resources.configuration.propertiesFileSourceEncoding = "UTF-8";
				}
			}
			if (!["ISO-8859-1", "UTF-8"].includes(project.resources.configuration.propertiesFileSourceEncoding)) {
				throw new Error(`Invalid properties file encoding specified for project ${project.id}. ` +
					`Encoding provided: ${project.resources.configuration.propertiesFileSourceEncoding}. ` +
					`Must be either "ISO-8859-1" or "UTF-8".`);
			}

			const absoluteSrcPath = path.join(project.path, project.resources.configuration.paths.src);
			const absoluteTestPath = path.join(project.path, project.resources.configuration.paths.test);
			return Promise.all([
				this.dirExists(absoluteSrcPath).then(function(bExists) {
					if (!bExists) {
						throw new Error(`Could not find source directory of project ${project.id}: ` +
							`${absoluteSrcPath}`);
					}
				}),
				this.dirExists(absoluteTestPath).then(function(bExists) {
					if (!bExists) {
						log.verbose(`Could not find (optional) test directory of project ${project.id}: ` +
							`${absoluteTestPath}`);
						// Current signal to following consumers that "test" is not available is null
						project.resources.configuration.paths.test = null;
					}
				})
			]);
		});
	}
}

module.exports = LibraryFormatter;

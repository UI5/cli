import fsPath from "node:path";
import posixPath from "node:path/posix";
import ComponentProject from "../ComponentProject.js";
import {createReader} from "@ui5/fs/resourceFactory";

/**
 * Component
 *
 * @public
 * @class
 * @alias @ui5/project/specifications/types/Component
 * @extends @ui5/project/specifications/ComponentProject
 * @hideconstructor
 */
class Component extends ComponentProject {
	constructor(parameters) {
		super(parameters);

		this._pManifests = Object.create(null);

		this._srcPath = "src";
		this._testPath = "test";
		this._testPathExists = false;

		this._propertiesFilesSourceEncoding = "UTF-8";
	}

	/* === Attributes === */

	/**
	* Get the cachebuster signature type configuration of the project
	*
	* @returns {string} <code>time</code> or <code>hash</code>
	*/
	getCachebusterSignatureType() {
		return this._config.builder && this._config.builder.cachebuster &&
			this._config.builder.cachebuster.signatureType || "time";
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

	getSourcePaths() {
		const paths = [this.getSourcePath()];
		if (this._testPathExists) {
			paths.push(fsPath.join(this.getRootPath(), this._testPath));
		}
		return paths;
	}

	getVirtualPath(sourceFilePath) {
		const sourcePath = this.getSourcePath();
		if (sourceFilePath.startsWith(sourcePath)) {
			const relSourceFilePath = fsPath.relative(sourcePath, sourceFilePath);
			let virBasePath = "/resources/";
			if (!this._isSourceNamespaced) {
				virBasePath += `${this._namespace}/`;
			}
			return posixPath.join(virBasePath, relSourceFilePath);
		}

		const testPath = fsPath.join(this.getRootPath(), this._testPath);
		if (sourceFilePath.startsWith(testPath)) {
			const relSourceFilePath = fsPath.relative(testPath, sourceFilePath);
			let virBasePath = "/test-resources/";
			if (!this._isSourceNamespaced) {
				virBasePath += `${this._namespace}/`;
			}
			return posixPath.join(virBasePath, relSourceFilePath);
		}

		throw new Error(
			`Unable to convert source path ${sourceFilePath} to virtual path for project ${this.getName()}`);
	}

	/* === Resource Access === */
	/**
	* Get a resource reader for the sources of the project (excluding any test resources)
	*
	* @param {string[]} excludes List of glob patterns to exclude
	* @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	_getSourceReader(excludes) {
		return createReader({
			fsBasePath: this.getSourcePath(),
			virBasePath: `/resources/${this._namespace}/`,
			name: `Source reader for component project ${this.getName()}`,
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
		const testReader = createReader({
			fsBasePath: fsPath.join(this.getRootPath(), this._testPath),
			virBasePath: `/test-resources/${this._namespace}/`,
			name: `Runtime test-resources reader for component project ${this.getName()}`,
			project: this,
			excludes
		});
		return testReader;
	}

	/**
	 * Get a resource reader for the sources of the project (excluding any test resources)
	 * without a virtual base path
	 *
	 * @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	_getRawSourceReader() {
		return createReader({
			fsBasePath: this.getSourcePath(),
			virBasePath: "/",
			name: `Raw source reader for component project ${this.getName()}`,
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
				`Unable to find source directory '${this._srcPath}' in component project ${this.getName()}`);
		}
		this._testPathExists = await this._dirExists("/" + this._testPath);

		this._log.verbose(`Path mapping for component project ${this.getName()}:`);
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
		await this._ensureComponent();
	}

	/**
	 * Determine component namespace either based on a project`s
	 * manifest.json or manifest.appdescr_variant (fallback if present)
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async _getNamespace() {
		try {
			return await this._getNamespaceFromManifestJson();
		} catch (manifestJsonError) {
			if (manifestJsonError.code !== "ENOENT") {
				throw manifestJsonError;
			}
			// No manifest.json present
			// => attempt fallback to manifest.appdescr_variant (typical for App Variants)
			try {
				return await this._getNamespaceFromManifestAppDescVariant();
			} catch (appDescVarError) {
				if (appDescVarError.code === "ENOENT") {
					// Fallback not possible: No manifest.appdescr_variant present
					// => Throw error indicating missing manifest.json
					// 	(do not mention manifest.appdescr_variant since it is only
					// 	relevant for the rather "uncommon" App Variants)
					throw new Error(
						`Could not find required manifest.json for project ` +
						`${this.getName()}: ${manifestJsonError.message}`);
				}
				throw appDescVarError;
			}
		}
	}

	/**
	 * Determine application namespace by checking manifest.json.
	 * Any maven placeholders are resolved from the projects pom.xml
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async _getNamespaceFromManifestJson() {
		const manifest = await this._getManifest("/manifest.json");
		let appId;
		// check for a proper sap.app/id in manifest.json to determine namespace
		if (manifest["sap.app"] && manifest["sap.app"].id) {
			appId = manifest["sap.app"].id;
		} else {
			throw new Error(
				`No sap.app/id configuration found in manifest.json of project ${this.getName()}`);
		}

		if (this._hasMavenPlaceholder(appId)) {
			try {
				appId = await this._resolveMavenPlaceholder(appId);
			} catch (err) {
				throw new Error(
					`Failed to resolve namespace of project ${this.getName()}: ${err.message}`);
			}
		}
		const namespace = appId.replace(/\./g, "/");
		this._log.verbose(
			`Namespace of project ${this.getName()} is ${namespace} (from manifest.json)`);
		return namespace;
	}

	/**
	 * Determine application namespace by checking manifest.appdescr_variant.
	 *
	 * @returns {string} Namespace of the project
	 * @throws {Error} if namespace can not be determined
	 */
	async _getNamespaceFromManifestAppDescVariant() {
		const manifest = await this._getManifest("/manifest.appdescr_variant");
		let appId;
		// check for the id property in manifest.appdescr_variant to determine namespace
		if (manifest && manifest.id) {
			appId = manifest.id;
		} else {
			throw new Error(
				`No "id" property found in manifest.appdescr_variant of project ${this.getName()}`);
		}

		const namespace = appId.replace(/\./g, "/");
		this._log.verbose(
			`Namespace of project ${this.getName()} is ${namespace} (from manifest.appdescr_variant)`);
		return namespace;
	}

	/**
	 * Reads and parses a JSON file with the provided name from the projects source directory
	 *
	 * @param {string} filePath Name of the JSON file to read. Typically "manifest.json" or "manifest.appdescr_variant"
	 * @returns {Promise<object>} resolves with an object containing the content requested manifest file
	 */
	async _getManifest(filePath) {
		if (this._pManifests[filePath]) {
			return this._pManifests[filePath];
		}
		return this._pManifests[filePath] = this._getRawSourceReader().byPath(filePath)
			.then(async (resource) => {
				if (!resource) {
					throw new Error(
						`Could not find resource ${filePath} in project ${this.getName()}`);
				}
				return JSON.parse(await resource.getString());
			}).catch((err) => {
				throw new Error(
					`Failed to read ${filePath} for project ` +
					`${this.getName()}: ${err.message}`);
			});
	}

	async _ensureComponent() {
		// Throw if neither Component.js nor Component.ts is present
		const componentResource = await this._getRawSourceReader().byPath("/Component.js") ||
			await this._getRawSourceReader().byPath("/Component.ts");
		if (!componentResource) {
			throw new Error(
				`Unable to find either required "Component.js" or "Component.ts"` +
				` in component project ${this.getName()}`
			);
		}
	}
}

export default Component;

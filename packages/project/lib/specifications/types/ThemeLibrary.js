const fsPath = require("path");
const resourceFactory = require("@ui5/fs").resourceFactory;
const Project = require("../Project");

class ThemeLibrary extends Project {
	constructor(parameters) {
		super(parameters);

		this._srcPath = "src";
		this._testPath = "test";
		this._testPathExists = false;
		this._writer = null;
	}

	/* === Attributes === */
	/**
	* @private
	*/
	getCopyright() {
		return this._config.metadata.copyright;
	}

	/* === Resource Access === */
	/**
	 * Get a [ReaderCollection]{@link module:@ui5/fs.ReaderCollection} for accessing all resources of the
	 * project.
	 * This is always of style <code>buildtime</code>, wich for theme libraries is identical to style
	 * <code>runtime</code>.
	 *
	 * @public
	 * @returns {module:@ui5/fs.ReaderCollection} Reader collection allowing access to all resources of the project
	 */
	getReader() {
		let reader = resourceFactory.createReader({
			fsBasePath: fsPath.join(this.getPath(), this._srcPath),
			virBasePath: "/resources/",
			name: `Runtime resources reader for theme-library project ${this.getName()}`,
			project: this,
			excludes: this.getBuilderResourcesExcludes()
		});
		if (this._testPathExists) {
			const testReader = resourceFactory.createReader({
				fsBasePath: fsPath.join(this.getPath(), this._testPath),
				virBasePath: "/test-resources/",
				name: `Runtime test-resources reader for theme-library project ${this.getName()}`,
				project: this,
				excludes: this.getBuilderResourcesExcludes()
			});
			reader = resourceFactory.createReaderCollection({
				name: `Reader collection for theme-library project ${this.getName()}`,
				readers: [reader, testReader]
			});
		}
		const writer = this._getWriter();

		return resourceFactory.createReaderCollectionPrioritized({
			name: `Reader/Writer collection for project ${this.getName()}`,
			readers: [writer, reader]
		});
	}

	/**
	* Get a [DuplexCollection]{@link module:@ui5/fs.DuplexCollection} for accessing and modifying a
	* project's resources.
	*
	* This is always of style <code>buildtime</code>, wich for theme libraries is identical to style
	* <code>runtime</code>.
	*
	* @public
	* @returns {module:@ui5/fs.DuplexCollection} DuplexCollection
	*/
	getWorkspace() {
		const reader = this.getReader();

		const writer = this._getWriter();
		return resourceFactory.createWorkspace({
			reader,
			writer
		});
	}

	_getWriter() {
		if (!this._writer) {
			this._writer = resourceFactory.createAdapter({
				virBasePath: "/",
				project: this
			});
		}

		return this._writer;
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

		this._log.verbose(`Path mapping for theme-library project ${this.getName()}:`);
		this._log.verbose(`  Physical root path: ${this.getPath()}`);
		this._log.verbose(`  Mapped to:`);
		this._log.verbose(`    /resources/ => ${this._srcPath}`);
		this._log.verbose(`    /test-resources/ => ${this._testPath}`);

		if (!await this._dirExists("/" + this._srcPath)) {
			throw new Error(
				`Unable to find directory '${this._srcPath}' in theme-library project ${this.getName()}`);
		}
		if (!await this._dirExists("/" + this._testPath)) {
			this._log.verbose(`    (/test-resources/ target does not exist)`);
		} else {
			this._testPathExists = true;
		}
	}
}

module.exports = ThemeLibrary;

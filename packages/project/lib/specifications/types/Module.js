import fsPath from "node:path";
import Project from "../Project.js";
import * as resourceFactory from "@ui5/fs/resourceFactory";

/**
 * Module
 *
 * @public
 * @class
 * @alias @ui5/project/specifications/types/Module
 * @extends @ui5/project/specifications/Project
 * @hideconstructor
 */
class Module extends Project {
	constructor(parameters) {
		super(parameters);

		this._paths = null;
		this._writer = null;
	}

	/* === Attributes === */

	/**
	 * Since Modules have multiple source paths, this function always throws with an exception
	 *
	 * @public
	 * @throws {Error} Projects of type module have more than one source path
	 */
	getSourcePath() {
		throw new Error(`Projects of type module have more than one source path`);
	}

	/* === Resource Access === */
	/**
	* Get a resource reader for accessing the project resources
	*
	* @public
	* @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	getReader() {
		const readers = this._paths.map((readerArgs) => resourceFactory.createReader(readerArgs));
		if (readers.length === 1) {
			return readers[0];
		}
		const readerCollection = resourceFactory.createReaderCollection({
			name: `Reader collection for module project ${this.getName()}`,
			readers
		});
		return resourceFactory.createReaderCollectionPrioritized({
			name: `Reader/Writer collection for project ${this.getName()}`,
			readers: [this._getWriter(), readerCollection]
		});
	}

	/**
	 * Get a resource reader/writer for accessing and modifying a project's resources
	 *
	 * @public
	 * @returns {@ui5/fs/ReaderCollection} A reader collection instance
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
				virBasePath: "/"
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

		this._log.verbose(`Path mapping for module project ${this.getName()}:`);
		this._log.verbose(`  Physical root path: ${this.getRootPath()}`);
		this._log.verbose(`  Mapped to:`);

		if (config.resources?.configuration?.paths) {
			const pathMappings = Object.entries(config.resources.configuration.paths);
			if (this._log.isLevelEnabled("verbose")) {
				// Log synchronously before async dir-exists checks
				pathMappings.forEach(([virBasePath, relFsPath]) => {
					this._log.verbose(`    ${virBasePath} => ${relFsPath}`);
				});
			}
			this._paths = await Promise.all(pathMappings.map(async ([virBasePath, relFsPath]) => {
				if (!(await this._dirExists("/" + relFsPath))) {
					throw new Error(
						`Unable to find source directory '${relFsPath}' in module project ${this.getName()}`);
				}
				return {
					name: `'${relFsPath}'' reader for module project ${this.getName()}`,
					virBasePath,
					fsBasePath: fsPath.join(this.getRootPath(), relFsPath),
					project: this,
					excludes: config.builder?.resources?.excludes
				};
			}));
		} else {
			this._log.verbose(`    / => <project root>`);
			if (!(await this._dirExists("/"))) {
				throw new Error(
					`Unable to find root directory of module project ${this.getName()}`);
			}
			this._paths = [{
				name: `Root reader for module project ${this.getName()}`,
				virBasePath: "/",
				fsBasePath: this.getRootPath(),
				project: this,
				excludes: config.builder?.resources?.excludes
			}];
		}
	}
}

export default Module;

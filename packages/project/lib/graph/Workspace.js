import fs from "graceful-fs";
import {globby, isDynamicPattern} from "globby";
import path from "node:path";
import {promisify} from "node:util";
import {getLogger} from "@ui5/logger";
import Module from "./Module.js";
import {validateWorkspace} from "../validation/validator.js";

const readFile = promisify(fs.readFile);
const log = getLogger("graph:Workspace");


/**
 * Workspace configuration. For details, refer to the
 * [UI5 Workspaces documentation]{@link https://sap.github.io/ui5-tooling/v3/pages/Workspace/#configuration}
 *
 * @public
 * @typedef {object} @ui5/project/graph/Workspace~Configuration
 * @property {string} node.specVersion Workspace Specification Version
 * @property {object} node.metadata
 * @property {string} node.metadata.name Name of the workspace configuration
 * @property {object} node.dependencyManagement
 * @property {@ui5/project/graph/Workspace~DependencyManagementResolutions[]} node.dependencyManagement.resolutions
 */

/**
 * A resolution entry for the dependency management section of the workspace configuration
 *
 * @public
 * @typedef {object} @ui5/project/graph/Workspace~DependencyManagementResolution
 * @property {string} path Relative path to use for the workspace resolution process
 */

/**
 * UI5 Workspace
 *
 * @public
 * @class
 * @alias @ui5/project/graph/Workspace
 */
class Workspace {
	#visitedNodePaths = new Set();
	#configValidated = false;
	#configuration;
	#cwd;

	/**
	 * @public
	 * @param {object} options
	 * @param {string} options.cwd Path to use for resolving all paths of the workspace configuration from.
	 *   This should contain platform-specific path separators (i.e. must not be POSIX on non-POSIX systems)
	 * @param {@ui5/project/graph/Workspace~Configuration} options.configuration
	 *   Workspace configuration
	 */
	constructor({cwd, configuration}) {
		if (!cwd) {
			throw new Error(`Could not create Workspace: Missing or empty parameter 'cwd'`);
		}
		if (!configuration) {
			throw new Error(`Could not create Workspace: Missing or empty parameter 'configuration'`);
		}

		this.#cwd = cwd;
		this.#configuration = configuration;
	}

	/**
	 * Get the name of this workspace
	 *
	 * @public
	 * @returns {string} Name of this workspace configuration
	 */
	getName() {
		return this.#configuration.metadata.name;
	}

	/**
	 * Returns an array of [Module]{@ui5/project/graph/Module} instances found in the configured
	 * dependency-management resolution paths of this workspace, sorted by module ID.
	 *
	 * @public
	 * @returns {Promise<@ui5/project/graph/Module[]>}
	 *   Array of Module instances sorted by module ID
	 */
	async getModules() {
		const {moduleIdMap} = await this._getResolvedModules();
		const sortedMap = new Map([...moduleIdMap].sort((a, b) => String(a[0]).localeCompare(b[0])));
		return Array.from(sortedMap.values());
	}

	/**
	 * For a given project name (e.g. the value of the <code>metadata.name</code> property in a ui5.yaml),
	 * returns a [Module]{@ui5/project/graph/Module} instance or <code>undefined</code> depending on whether the project
	 * has been found in the configured dependency-management resolution paths of this workspace
	 *
	 * @public
	 * @param {string} projectName Name of the project
	 * @returns {Promise<@ui5/project/graph/Module|undefined>}
	 *   Module instance, or <code>undefined</code> if none is found
	 */
	async getModuleByProjectName(projectName) {
		const {projectNameMap} = await this._getResolvedModules();
		return projectNameMap.get(projectName);
	}

	/**
	 * For a given node id (e.g. the value of the name property in a package.json),
	 * returns a [Module]{@ui5/project/graph/Module} instance or <code>undefined</code> depending on whether the module
	 * has been found in the configured dependency-management resolution paths of this workspace
	 * and contains at least one project or extension
	 *
	 * @public
	 * @param {string} nodeId Node ID of the module
	 * @returns {Promise<@ui5/project/graph/Module|undefined>}
	 *   Module instance, or <code>undefined</code> if none is found
	 */
	async getModuleByNodeId(nodeId) {
		const {moduleIdMap} = await this._getResolvedModules();
		return moduleIdMap.get(nodeId);
	}

	_getResolvedModules() {
		if (this._pResolvedModules) {
			return this._pResolvedModules;
		}

		return this._pResolvedModules = this._resolveModules();
	}

	async _resolveModules() {
		await this._validateConfig();
		const resolutions = this.#configuration.dependencyManagement?.resolutions;
		if (!resolutions?.length) {
			return {
				projectNameMap: new Map(),
				moduleIdMap: new Map()
			};
		}

		let resolvedModules = await Promise.all(resolutions.map(async (resolutionConfig) => {
			if (!resolutionConfig.path) {
				throw new Error(
					`Missing property 'path' in dependency resolution configuration of workspace ${this.getName()}`);
			}
			return await this._getModulesFromPath(
				this.#cwd, resolutionConfig.path);
		}));

		// Flatten array since package-workspaces might have resolved to multiple modules for a single resolution
		resolvedModules = Array.prototype.concat.apply([], resolvedModules);

		const projectNameMap = new Map();
		const moduleIdMap = new Map();
		await Promise.all(resolvedModules.map(async (module) => {
			const {project, extensions} = await module.getSpecifications();
			if (project || extensions.length) {
				moduleIdMap.set(module.getId(), module);
			} else {
				log.warn(
					`Failed to create a project or extensions from module ${module.getId()} at ${module.getPath()}`);
			}
			if (project) {
				projectNameMap.set(project.getName(), module);
				log.verbose(`Module ${module.getId()} contains project ${project.getName()}`);
			}
			if (extensions.length) {
				const extensionNames = extensions.map((e) => e.getName()).join(", ");
				log.verbose(`Module ${module.getId()} contains extensions: ${extensionNames}`);
			}
		}));
		return {
			projectNameMap,
			moduleIdMap
		};
	}

	async _getModulesFromPath(cwd, relPath, failOnMissingFiles = true) {
		const nodePath = path.join(cwd, relPath);
		if (this.#visitedNodePaths.has(nodePath)) {
			log.verbose(`Module located at ${nodePath} has already been visited`);
			return [];
		}
		this.#visitedNodePaths.add(nodePath);
		let pkg;
		try {
			pkg = await this._readPackageJson(nodePath);
			if (!pkg?.name || !pkg?.version) {
				throw new Error(
					`package.json must contain fields 'name' and 'version'`);
			}
		} catch (err) {
			if (!failOnMissingFiles && err.code === "ENOENT") {
				// When resolving a dynamic workspace pattern (not a static path), ignore modules that
				// are missing a package.json (this might simply indicate an empty directory)
				log.verbose(`Ignoring module at path ${nodePath}: Directory does not contain a package.json`);
				return [];
			}
			throw new Error(
				`Failed to resolve workspace dependency resolution path ${relPath} to ${nodePath}: ${err.message}`);
		}

		// If the package.json defines an npm "workspaces", or an equivalent "ui5.workspaces" configuration,
		// resolve the workspace and only use the resulting modules. The root package is ignored.
		const packageWorkspaceConfig = pkg.ui5?.workspaces || pkg.workspaces;
		if (packageWorkspaceConfig?.length) {
			log.verbose(`Module ${pkg.name} provides a package.json workspaces configuration. ` +
				`Ignoring the module and resolving workspaces instead...`);
			const staticPatterns = [];
			// Split provided patterns into dynamic and static patterns
			// This is necessary, since fast-glob currently behaves different from
			// 	"glob" (used by @npmcli/map-workspaces) in that it does not match the
			// 	base directory in case it is equal to the pattern (https://github.com/mrmlnc/fast-glob/issues/47)
			// For example a pattern "package-a" would not match a directory called
			// 	"package-a" in the root directory of the project.
			// 	We therefore detect the static pattern and resolve it directly
			const dynamicPatterns = packageWorkspaceConfig.filter((pattern) => {
				if (isDynamicPattern(pattern)) {
					return true;
				} else {
					staticPatterns.push(pattern);
					return false;
				}
			});

			let searchPaths = [];
			if (dynamicPatterns.length) {
				searchPaths = await globby(dynamicPatterns, {
					cwd: nodePath,
					followSymbolicLinks: false,
					onlyDirectories: true,
				});
			}
			searchPaths.push(...staticPatterns);

			const resolvedModules = new Map();
			await Promise.all(searchPaths.map(async (pkgPath) => {
				const modules = await this._getModulesFromPath(nodePath, pkgPath, staticPatterns.includes(pkgPath));
				modules.forEach((module) => {
					const id = module.getId();
					if (!resolvedModules.get(id)) {
						resolvedModules.set(id, module);
					}
				});
			}));
			return Array.from(resolvedModules.values());
		} else {
			return [new Module({
				id: pkg.name,
				version: pkg.version,
				modulePath: nodePath
			})];
		}
	}

	/**
	 * Reads the package.json file and returns its content
	 *
	 * @private
	 * @param {string} modulePath Path to the module containing the package.json
	 * @returns {object} Package json content
	 */
	async _readPackageJson(modulePath) {
		const content = await readFile(path.join(modulePath, "package.json"), "utf8");
		return JSON.parse(content);
	}

	async _validateConfig() {
		if (this.#configValidated) {
			return;
		}
		await validateWorkspace({
			config: this.#configuration
		});
		this.#configValidated = true;
	}
}

export default Workspace;

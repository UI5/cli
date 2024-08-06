import path from "node:path";
import {readPackageUp} from "read-package-up";
import {readPackage} from "read-pkg";
import {promisify} from "node:util";
import fs from "graceful-fs";
const realpath = promisify(fs.realpath);
import resolve from "resolve";
const resolveModulePath = promisify(resolve);
import {getLogger} from "@ui5/logger";
const log = getLogger("graph:providers:NodePackageDependencies");

// Packages to consider:
// * https://github.com/npm/read-package-json-fast
// * https://github.com/npm/name-from-folder ?

/**
 * @public
 * @class
 * @alias @ui5/project/graph/providers/NodePackageDependencies
 */
class NodePackageDependencies {
	/**
	 * Generates a project graph from npm modules
	 *
	 * @public
	 * @param {object} options
	 * @param {string} options.cwd Directory to start searching for the root module
	 * @param {object} [options.rootConfiguration]
	 *		Configuration object to use for the root module instead of reading from a configuration file
	 * @param {string} [options.rootConfigPath]
	 *		Configuration file to use for the root module instead the default ui5.yaml
	 */
	constructor({cwd, rootConfiguration, rootConfigPath}) {
		this._cwd = cwd;
		this._rootConfiguration = rootConfiguration;
		this._rootConfigPath = rootConfigPath;
	}

	async getRootNode() {
		const rootPkg = await readPackageUp({
			cwd: this._cwd,
			normalize: false
		});

		if (!rootPkg || !rootPkg.packageJson) {
			throw new Error(
				`Failed to locate package.json for directory ${path.resolve(this._cwd)}`);
		}

		const modulePath = path.dirname(rootPkg.path);
		if (!rootPkg.packageJson.name) {
			throw new Error(`Missing or empty 'name' attribute in package.json at ${modulePath}`);
		}
		if (!rootPkg.packageJson.version) {
			throw new Error(`Missing or empty 'version' attribute in package.json at ${modulePath}`);
		}

		return {
			id: rootPkg.packageJson.name,
			version: rootPkg.packageJson.version,
			path: modulePath,
			configuration: this._rootConfiguration,
			configPath: this._rootConfigPath,
			_dependencies: await this._getDependencies(modulePath, rootPkg.packageJson, true)
		};
	}

	async getDependencies(node, workspace) {
		log.verbose(`Resolving dependencies of ${node.id}...`);
		if (!node._dependencies) {
			return [];
		}
		return Promise.all(node._dependencies.map(async ({name, optional}) => {
			const modulePath = await this._resolveModulePath(node.path, name, workspace);
			return this._getNode(modulePath, optional, name);
		}));
	}

	async _resolveModulePath(baseDir, moduleName, workspace) {
		log.verbose(`Resolving module path for '${moduleName}'...`);

		if (workspace) {
			// Check whether node can be resolved via the provided Workspace instance
			// If yes, replace the node from NodeProvider with the one from Workspace
			const workspaceNode = await workspace.getModuleByNodeId(moduleName);
			if (workspaceNode) {
				log.info(`Resolved module ${moduleName} via ${workspace.getName()} workspace ` +
					`to version ${workspaceNode.getVersion()}`);
				log.verbose(`  Resolved module ${moduleName} to path ${workspaceNode.getPath()}`);
				return workspaceNode.getPath();
			}
		}

		try {
			let packageJsonPath = await resolveModulePath(moduleName + "/package.json", {
				basedir: baseDir,
				preserveSymlinks: false
			});
			packageJsonPath = await realpath(packageJsonPath);

			const modulePath = path.dirname(packageJsonPath);
			log.verbose(`Resolved module ${moduleName} to path ${modulePath}`);
			return modulePath;
		} catch (err) {
			throw new Error(
				`Unable to locate module ${moduleName} via resolve logic: ${err.message}`);
		}
	}

	/**
	 * Resolves a Node module by reading its package.json
	 *
	 * @param {string} modulePath Path to the module.
	 * @param {boolean} optional Whether this dependency is optional.
	 * @param {string} [nameAlias] The name of the module. It's usually the same as the name definfed
	 * 	in package.json and could easily be skipped. Useful when defining dependency as an alias:
	 * 	{@link https://github.com/npm/rfcs/blob/main/implemented/0001-package-aliases.md}
	 * @returns {Promise<object>}
	 */
	async _getNode(modulePath, optional, nameAlias) {
		log.verbose(`Reading package.json in directory ${modulePath}...`);
		const packageJson = await readPackage({
			cwd: modulePath,
			normalize: false
		});

		return {
			id: nameAlias || packageJson.name,
			version: packageJson.version,
			path: modulePath,
			optional,
			_dependencies: await this._getDependencies(modulePath, packageJson)
		};
	}

	async _getDependencies(modulePath, packageJson, rootModule = false) {
		const dependencies = [];
		if (packageJson.dependencies) {
			Object.keys(packageJson.dependencies).forEach((depName) => {
				dependencies.push({
					name: depName,
					optional: false
				});
			});
		}
		if (rootModule && packageJson.devDependencies) {
			Object.keys(packageJson.devDependencies).forEach((depName) => {
				dependencies.push({
					name: depName,
					optional: false
				});
			});
		}
		if (!rootModule && packageJson.devDependencies) {
			await Promise.all(Object.keys(packageJson.devDependencies).map(async (depName) => {
				try {
					await this._resolveModulePath(modulePath, depName);
					dependencies.push({
						name: depName,
						optional: true
					});
				} catch {
					// Ignore error since it's a development dependency of a non-root module
				}
			}));
		}
		if (packageJson.optionalDependencies) {
			await Promise.all(Object.keys(packageJson.optionalDependencies).map(async (depName) => {
				try {
					await this._resolveModulePath(modulePath, depName);
					dependencies.push({
						name: depName,
						optional: false
					});
				} catch {
					// Ignore error since it's an optional dependency
				}
			}));
		}
		return dependencies;
	}
}

export default NodePackageDependencies;

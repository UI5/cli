const log = require("@ui5/logger").getLogger("normalizer:translators:npm");
const path = require("path");
const readPkgUp = require("read-pkg-up");
const readPkg = require("read-pkg");
const {promisify} = require("util");
const fs = require("fs");
const realpath = promisify(fs.realpath);
const resolveModulePath = promisify(require("resolve"));

class NpmTranslator {
	constructor() {
		this.projectCache = {};
		this.projectsWoUi5Deps = [];
		this.pendingDeps = {};
	}

	/*
		Returns a promise with an array of projects
	*/
	async processPkg(data, parentName) {
		const cwd = data.path;
		const moduleName = data.name;
		const pkg = data.pkg;

		log.verbose("Analyzing %s (%s) (depenency of %s)", moduleName, cwd, parentName || "nothing - root project");

		/*
		 * 	Inject collection definitions for some known projects
		 *	until this is either not needed anymore or added to the actual project.
		 */
		this.shimCollection(moduleName, pkg);

		let dependencies = pkg.dependencies || {};
		let optDependencies = pkg.devDependencies || {};
		let version = pkg.version;

		// Also look for "napa" dependencies (see https://github.com/shama/napa)
		if (pkg.napa) {
			Object.keys(pkg.napa).forEach((napaName) => {
				dependencies[napaName] = pkg.napa[napaName];
			});
		}

		const ui5Deps = pkg.ui5 && pkg.ui5.dependencies;
		if (ui5Deps && ui5Deps.length) {
			for (let i = 0; i < ui5Deps.length; i++) {
				let depName = ui5Deps[i];
				if (!dependencies[depName] && !optDependencies[depName]) {
					throw new Error(`[npm translator] Module ${depName} is defined as UI5 dependency ` +
						`but missing from npm dependencies of module ${moduleName}`);
				}
			}
			// When UI5-dependencies are defined, we don't care whether an npm dependency is optional or not.
			//	All UI5-dependendies need to be there.
			dependencies = Object.assign({}, dependencies, optDependencies);
			optDependencies = {};

			for (let depName in dependencies) {
				if (dependencies.hasOwnProperty(depName) && ui5Deps.indexOf(depName) === -1) {
					log.verbose("Ignoring npm depenency %s. Not defined in UI5-dependency configuration.", depName);
					delete dependencies[depName];
				}
			}
		} else {
			this.projectsWoUi5Deps.push(moduleName);
		}

		/*
			It's either a project or a collection but never both!

			We don't care about dependencies of collections for now because we only remember dependencies
			on projects.
			Although we could add the collections dependencies as project dependencies to the related modules
		*/
		if (!pkg.collection) {
			return this.getDepProjects({
				cwd,
				parentName: moduleName,
				dependencies
			}).then((depProjects) => {
				// Array needs to be flattened because:
				// getDepProjects returns array * 2 = array with two arrays
				let projects = Array.prototype.concat.apply([], depProjects);

				return [{
					id: moduleName,
					version,
					path: cwd,
					dependencies: projects
				}];
			}).then(([project]) => {
				// Register optional dependencies as "pending" as we do not try to resolve them ourself.
				// If we would, we would *always* resolve them for modules that are linked into monorepos.
				// In such cases, dev-dependencies are typically always available in the node_modules directory.
				// Therefore we register them as pending. And if any other project resolved them, we add them to
				//	our dependencies later on.
				this.registerPendingDependencies({
					parentProject: project,
					dependencies: optDependencies
				});
				return [project];
			});
		} else { // collection
			log.verbose("Found a collection: %s", moduleName);
			const modules = pkg.collection && pkg.collection.modules || {};
			return Promise.all(
				Object.keys(modules).map((depName) => {
					const modulePath = path.join(cwd, modules[depName]);
					if (depName === parentName) { // TODO improve recursion detection here
						log.verbose("Ignoring module with same name as parent: " + parentName);
						return null;
					}
					return this.readProject({modulePath, moduleName: depName, parentName: moduleName});
				})
			).then((projects) => {
				// Array needs to be flattened because:
				//	readProject returns an array + Promise.all returns an array = array filled with arrays
				// Filter out null values of ignored packages
				return Array.prototype.concat.apply([], projects.filter((p) => p !== null));
			});
		}
	}

	getDepProjects({cwd, dependencies, parentName}) {
		return Promise.all(
			Object.keys(dependencies).map((moduleName) => {
				return this.findModulePath(cwd, moduleName).then((modulePath) => {
					return this.readProject({modulePath, moduleName, parentName});
				});
			})
		).then((depProjects) => {
			// Array needs to be flattened because:
			//	readProject returns an array + Promise.all returns an array = array filled with arrays
			// Filter out null values of ignored packages
			return Array.prototype.concat.apply([], depProjects.filter((p) => p !== null));
		});
	}

	readProject({modulePath, moduleName, parentName}) {
		if (this.projectCache[modulePath]) {
			return this.projectCache[modulePath];
		}

		return this.projectCache[modulePath] = readPkg(modulePath).catch((err) => {
			// Failed to read package
			// If dependency shim is available, fake the package

			/* Disabled shimming until shim-plugin is available
			const id = path.basename(modulePath);
			if (pkgDependenciesShims[id]) {
				const dependencies = JSON.parse(JSON.stringify(pkgDependenciesShims[id]));
				return { // Fake package.json content
					name: id,
					dependencies,
					version: "",
					ui5: {
						dependencies: Object.keys(dependencies)
					}
				};
			}*/
			throw err;
		}).then((pkg) => {
			return this.processPkg({
				name: moduleName,
				pkg: pkg,
				path: modulePath
			}, parentName).then((projects) => {
				// Flatten the array of project arrays (yes, because collections)
				return Array.prototype.concat.apply([], projects.filter((p) => p !== null));
			});
		}, () => {
			// Failed to read package. Create a project anyway
			return [{
				id: moduleName,
				version: "",
				path: modulePath,
				dependencies: []
			}];
		});
	}

	/* Returns path to a module
	*/
	findModulePath(basePath, moduleName) {
		return resolveModulePath(moduleName + "/package.json", {
			basedir: basePath,
			preserveSymlinks: false
		}).then((pkgPath) => {
			return realpath(pkgPath);
		}).then((pkgPath) => {
			return path.dirname(pkgPath);
		}).catch((err) => {
			// Fallback: Check for a collection above this module
			return readPkgUp({
				cwd: path.dirname(basePath)
			}).then((result) => {
				if (result.pkg) {
					const pkg = result.pkg;

					// As of today, collections only exist in shims
					this.shimCollection(pkg.name, pkg);
					if (pkg.collection) {
						log.verbose(
							"Unable to locate module %s via resolve logic but found a collection in parent hierarchy: %s",
							moduleName, pkg.name);
						const modules = pkg.collection.modules || {};
						if (modules[moduleName]) {
							const modulePath = path.join(path.dirname(result.path), modules[moduleName]);
							log.verbose("Found module %s in that collection", moduleName);
							return modulePath;
						}
						throw new Error(`Could not find module ${moduleName} in collection ${pkg.name}`);
					}
				}
				throw new Error(`Could not locate module ${moduleName} via resolve logic ` +
					`(error: ${err.message}) or in a collection`);
			});
		}).catch((err) => {
			throw new Error(
				`[npm translator] Failed to locate module ${moduleName} from ${basePath} - Error: ${err.message}`);
		});
	}

	registerPendingDependencies({dependencies, parentProject}) {
		Object.keys(dependencies).forEach((moduleName) => {
			if (this.pendingDeps[moduleName]) {
				this.pendingDeps[moduleName].parents.push(parentProject);
			} else {
				this.pendingDeps[moduleName] = {
					parents: [parentProject]
				};
			}
		});
	}

	processPendingDeps(tree) {
		const queue = [tree];
		const visited = new Set();

		// Breadth-first search to prefer projects closer to root
		while (queue.length) {
			const project = queue.shift(); // Get and remove first entry from queue
			if (!project.id) {
				throw new Error("Encountered project with missing id");
			}
			if (visited.has(project.id)) {
				continue;
			}
			visited.add(project.id);

			if (this.pendingDeps[project.id]) {
				for (let i = this.pendingDeps[project.id].parents.length - 1; i >= 0; i--) {
					this.pendingDeps[project.id].parents[i].dependencies.push(project);
				}
				this.pendingDeps[project.id] = null;
			}

			if (project.dependencies) {
				queue.push(...project.dependencies);
			}
		}
		return tree;
	}

	generateDependencyTree(dirPath) {
		return readPkgUp({
			cwd: dirPath
		}).then((result) => {
			if (!result.pkg) {
				throw new Error(
					`[npm translator] Failed to locate package.json for directory "${path.resolve(dirPath)}"`);
			}
			result.name = result.pkg.name;
			// resolved path points to the package.json, but we want just the folder path
			result.path = path.dirname(result.path);
			return result;
		}).then(this.processPkg.bind(this)).then((tree) => {
			if (this.projectsWoUi5Deps.length) {
				log.verbose(
					"[PERF] Consider defining UI5-dependencies in the package.json files of the relevant modules " +
					"from the following list to improve npm translator execution time: " +
					this.projectsWoUi5Deps.join(", "));
			}

			/*
			By default, there is just one root project in the tree,
			but in case a collection is returned, there are multiple roots.
			This can only happen:
			1. when running with a collection project as CWD
				=> This is not intended and will throw an error as no project will match the CWD
			2. when running in a project without a package.json within a collection project
				=> In case the CWD matches with a project from the collection, then that
					project is picked as root, otherwise an error is thrown
			*/

			for (let i = 0; i < tree.length; i++) {
				let rootPackage = tree[i];
				if (path.resolve(rootPackage.path) === path.resolve(dirPath)) {
					log.verbose("Built tree:");
					log.verbose(rootPackage);
					return rootPackage;
				}
			}

			throw new Error("[npm translator] Could not identify root project.");
		}).then(this.processPendingDeps.bind(this));
	}

	/*
	 * 	Inject collection definitions for some known projects
	 *	until this is either not needed anymore or added to the actual project.
	 */
	shimCollection(moduleName, pkg) {
		/* Disabled shimming until shim-plugin is available
		if (!pkg.collection && pkgCollectionShims[moduleName]) {
			pkg.collection = JSON.parse(JSON.stringify(pkgCollectionShims[moduleName]));
		}*/
	}
}

/**
 * Translator for npm resources
 *
 * @module normalizer/translators/npm
 */
module.exports = {
	/**
	 * Generates a dependency tree for npm projects
	 *
	 * @param {string} dirPath Project path
	 * @returns {Promise} Promise resolving with a dependency tree
	 */
	generateDependencyTree(dirPath) {
		return new NpmTranslator().generateDependencyTree(dirPath);
	}
};

const log = require("@ui5/logger").getLogger("normalizer:translators:npm");
const path = require("path");
const readPkgUp = require("read-pkg-up");
const readPkg = require("read-pkg");
const {promisify} = require("util");
const fs = require("graceful-fs");
const realpath = promisify(fs.realpath);
const resolveModulePath = promisify(require("resolve"));
const parentNameRegExp = new RegExp(/:([^:]+):$/i);

class NpmTranslator {
	constructor({includeDeduped}) {
		this.projectCache = {};
		this.projectsWoUi5Deps = [];
		this.pendingDeps = {};
		this.includeDeduped = includeDeduped;
		this.debugUnresolvedProjects = {};
	}

	/*
		Returns a promise with an array of projects
	*/
	async processPkg(data, parentPath) {
		const cwd = data.path;
		const moduleName = data.name;
		const pkg = data.pkg;
		const parentName = parentPath && this.getParentNameFromPath(parentPath) || "nothing - root project";

		log.verbose("Analyzing %s (%s) (dependency of %s)", moduleName, cwd, parentName);

		if (!parentPath) {
			parentPath = ":";
		}
		parentPath += `${moduleName}:`;

		/*
		 * 	Inject collection definitions for some known projects
		 *	until this is either not needed anymore or added to the actual project.
		 */
		this.shimCollection(moduleName, pkg);

		let dependencies = pkg.dependencies || {};
		let optDependencies = pkg.devDependencies || {};

		const version = pkg.version;

		// Also look for "napa" dependencies (see https://github.com/shama/napa)
		if (pkg.napa) {
			Object.keys(pkg.napa).forEach((napaName) => {
				dependencies[napaName] = pkg.napa[napaName];
			});
		}

		const ui5Deps = pkg.ui5 && pkg.ui5.dependencies;
		if (ui5Deps && Array.isArray(ui5Deps)) {
			for (let i = 0; i < ui5Deps.length; i++) {
				const depName = ui5Deps[i];
				if (!dependencies[depName] && !optDependencies[depName]) {
					throw new Error(`[npm translator] Module ${depName} is defined as UI5 dependency ` +
						`but missing from npm dependencies of module ${moduleName}`);
				}
			}
			// When UI5-dependencies are defined, we don't care whether an npm dependency is optional or not.
			//	All UI5-dependencies need to be there.
			dependencies = Object.assign({}, dependencies, optDependencies);
			optDependencies = {};

			for (const depName of Object.keys(dependencies)) {
				if (ui5Deps.indexOf(depName) === -1) {
					log.verbose("Ignoring npm dependency %s. Not defined in UI5-dependency configuration.", depName);
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
		const isCollection = typeof pkg.collection === "object" && typeof pkg.collection.modules === "object";
		if (!isCollection) {
			if (log.isLevelEnabled("silly")) {
				this.debugUnresolvedProjects[cwd] = {
					moduleName
				};
				const logParentPath = parentPath.replace(":", "(root) ").replace(/([^:]*):$/, "(current) $1");
				log.silly(`Parent path: ${logParentPath.replace(/:/ig, " ➡️  ")}`);
				log.silly(`Resolving dependencies of ${moduleName}...`);
			}
			return this.getDepProjects({
				cwd,
				parentPath,
				dependencies,
				optionalDependencies: pkg.optionalDependencies
			}).then((depProjects) => {
				// Array needs to be flattened because:
				// getDepProjects returns array * 2 = array with two arrays
				const projects = Array.prototype.concat.apply([], depProjects);
				if (log.isLevelEnabled("silly")) {
					delete this.debugUnresolvedProjects[cwd];
					log.silly(`Resolved dependencies of ${moduleName}`);
					const pendingModules = Object.keys(this.debugUnresolvedProjects).map((key) => {
						return this.debugUnresolvedProjects[key].moduleName;
					});
					if (pendingModules.length) {
						log.silly(`${pendingModules.length} resolutions left: ${pendingModules.join(", ")}`);
					} else {
						log.silly("All modules resolved.");
					}
				}

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
					parentPath,
					dependencies: optDependencies
				});
				return [project];
			});
		} else { // collection
			log.verbose("Found a collection: %s", moduleName);
			const modules = pkg.collection.modules;
			return Promise.all(
				Object.keys(modules).map((depName) => {
					const modulePath = path.join(cwd, modules[depName]);
					if (depName === parentName) { // TODO improve recursion detection here
						log.verbose("Ignoring module with same name as parent: " + parentName);
						return null;
					}
					return this.readProject({modulePath, moduleName: depName, parentPath});
				})
			).then((projects) => {
				// Array needs to be flattened because:
				//	readProject returns an array + Promise.all returns an array = array filled with arrays
				// Filter out null values of ignored packages
				return Array.prototype.concat.apply([], projects.filter((p) => p !== null));
			});
		}
	}

	getParentNameFromPath(parentPath) {
		const parentNameMatch = parentPath.match(parentNameRegExp);
		if (parentNameMatch) {
			return parentNameMatch[1];
		} else {
			log.error(`Failed to get parent name from path ${parentPath}`);
		}
	}

	getDepProjects({cwd, dependencies, optionalDependencies, parentPath}) {
		return Promise.all(
			Object.keys(dependencies).map((moduleName) => {
				return this.findModulePath(cwd, moduleName).then((modulePath) => {
					return this.readProject({modulePath, moduleName, parentPath});
				}, (err) => {
					// Due to normalization done by by the "read-pkg-up" module the values
					//  in "optionalDependencies" get added to the modules "dependencies". Also described here:
					//  https://github.com/npm/normalize-package-data#what-normalization-currently-entails
					// Ignore resolution errors for optional dependencies
					if (optionalDependencies && optionalDependencies[moduleName]) {
						return null;
					} else {
						throw err;
					}
				});
			})
		).then((depProjects) => {
			// Array needs to be flattened because:
			//	readProject returns an array + Promise.all returns an array = array filled with arrays
			// Also filter out null values of ignored packages
			return Array.prototype.concat.apply([], depProjects.filter((p) => p !== null));
		});
	}

	async readProject({modulePath, moduleName, parentPath}) {
		let {pPkg} = this.projectCache[modulePath] || {};
		if (!pPkg) {
			pPkg = readPkg({cwd: modulePath}).catch((err) => {
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
			});
			this.projectCache[modulePath] = {
				pPkg
			};
		}

		// Check whether module has already been processed in the current subtree (indicates a loop)
		if (parentPath.indexOf(`:${moduleName}:`) !== -1) {
			log.verbose(`Deduping project ${moduleName} with parent path ${parentPath}`);
			// This is a loop => abort further processing
			if (!this.includeDeduped) {
				// Ignore this dependency
				return null;
			} else {
				// Create deduped project
				const pkg = await pPkg;
				return this.createDedupedProject({
					id: moduleName,
					version: pkg.version,
					path: modulePath
				});
			}
		}

		// Check whether project has already been processed
		// Note: We can only cache already *processed* projects, not the promise waiting for the processing to complete
		//	Otherwise cyclic dependencies might wait for each other, emptying the event loop
		// Note 2: Currently caching can't be used at all. If a cached dependency has an indirect dependency to the
		//	requesting module, a circular reference would be created
		/*
		if (cachedProject) {
			if (log.isLevelEnabled("silly")) {
				log.silly(`${parentPath.match(/([^:]*):$/)[1]} retrieved already ` +
					`resolved project ${moduleName} from cache 🗄 `);
			}
			return cachedProject;
		}*/
		if (log.isLevelEnabled("silly")) {
			log.silly(`${parentPath.match(/([^:]*):$/)[1]} is waiting for ${moduleName}...`);
		}

		return pPkg.then((pkg) => {
			return this.processPkg({
				name: moduleName,
				pkg,
				path: modulePath
			}, parentPath).then((projects) => {
				// Flatten the array of project arrays (yes, because collections)
				return Array.prototype.concat.apply([], projects.filter((p) => p !== null));
			})/*
			// Currently no project caching, see above
			.then((projects) => {
				this.projectCache[modulePath].cachedProject = projects;
				return projects;
			})*/;
		}, (err) => {
			// Failed to read package. Create a project anyway
			log.error(`Failed to read package.json of module ${moduleName} at ${modulePath} - Error: ${err.message}`);
			log.error(`Ignoring module ${moduleName} due to errors.`);
			return null;
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
				if (result && result.packageJson) {
					const pkg = result.packageJson;

					// As of today, collections only exist in shims
					this.shimCollection(pkg.name, pkg);
					if (pkg.collection) {
						log.verbose(`Unable to locate module ${moduleName} via resolve logic, but found ` +
							`a collection in parent hierarchy: ${pkg.name}`);
						const modules = pkg.collection.modules || {};
						if (modules[moduleName]) {
							const modulePath = path.join(path.dirname(result.path), modules[moduleName]);
							log.verbose(`Found module ${moduleName} in that collection`);
							return modulePath;
						}
						throw new Error(
							`[npm translator] Could not find module ${moduleName} in collection ${pkg.name}`);
					}
				}

				throw new Error(`[npm translator] Could not locate module ${moduleName} via resolve logic ` +
					`(error: ${err.message}) or in a collection`);
			}, (err) => {
				throw new Error(
					`[npm translator] Failed to locate module ${moduleName} from ${basePath} - Error: ${err.message}`);
			});
		});
	}

	registerPendingDependencies({dependencies, parentProject, parentPath}) {
		Object.keys(dependencies).forEach((moduleName) => {
			if (this.pendingDeps[moduleName]) {
				// Register additional potential parent for pending dependency
				this.pendingDeps[moduleName].parents.push({
					project: parentProject,
					path: parentPath
				});
			} else {
				// Add new pending dependency
				this.pendingDeps[moduleName] = {
					parents: [{
						project: parentProject,
						path: parentPath,
					}]
				};
			}
		});
	}

	processPendingDeps(tree) {
		if (Object.keys(this.pendingDeps).length === 0) {
			// No pending deps => nothing to do
			log.verbose("No pending (optional) dependencies to process");
			return tree;
		}
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
					const parent = this.pendingDeps[project.id].parents[i];
					// Check whether module has already been processed in the current subtree (indicates a loop)
					if (parent.path.indexOf(`:${project.id}:`) !== -1) {
						// This is a loop
						log.verbose(`Deduping pending dependency ${project.id} with parent path ${parent.path}`);
						if (this.includeDeduped) {
							// Create project marked as deduped
							const dedupedProject = this.createDedupedProject({
								id: project.id,
								version: project.version,
								path: project.path
							});
							parent.project.dependencies.push(dedupedProject);
						} // else: do nothing
					} else {
						if (log.isLevelEnabled("silly")) {
							log.silly(`Adding optional dependency ${project.id} to project ${parent.project.id} ` +
								`(parent path: ${parent.path})...`);
						}
						const dedupedProject = this.dedupeTree(project, parent.path);
						parent.project.dependencies.push(dedupedProject);
					}
				}
				this.pendingDeps[project.id] = null;

				if (log.isLevelEnabled("silly")) {
					log.silly(`${Object.keys(this.pendingDeps).length} pending dependencies left`);
				}
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
			if (!result || !result.packageJson) {
				throw new Error(
					`[npm translator] Failed to locate package.json for directory "${path.resolve(dirPath)}"`);
			}
			return {
				// resolved path points to the package.json, but we want just the folder path
				path: path.dirname(result.path),
				name: result.packageJson.name,
				pkg: result.packageJson
			};
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
				const rootPackage = tree[i];
				if (path.resolve(rootPackage.path) === path.resolve(dirPath)) {
					log.verbose("Treetop:");
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

	dedupeTree(tree, parentPath) {
		const projectsToDedupe = new Set(parentPath.slice(1, -1).split(":"));
		const clonedTree = JSON.parse(JSON.stringify(tree));
		const queue = [{project: clonedTree}];
		// BFS
		while (queue.length) {
			const {project, parent} = queue.shift(); // Get and remove first entry from queue

			if (parent && projectsToDedupe.has(project.id)) {
				log.silly(`In tree "${tree.id}" (parent path "${parentPath}"): Deduplicating project ${project.id} `+
					`(child of ${parent.id})`);

				const idx = parent.dependencies.indexOf(project);
				if (this.includeDeduped) {
					const dedupedProject = this.createDedupedProject(project);
					parent.dependencies.splice(idx, 1, dedupedProject);
				} else {
					parent.dependencies.splice(idx, 1);
				}
			}

			if (project.dependencies) {
				queue.push(...project.dependencies.map((dependency) => {
					return {
						project: dependency,
						parent: project
					};
				}));
			}
		}
		return clonedTree;
	}

	createDedupedProject({id, version, path}) {
		return {
			id,
			version,
			path,
			dependencies: [],
			deduped: true
		};
	}
}

/**
 * Translator for npm resources
 *
 * @private
 * @namespace
 * @alias module:@ui5/project.translators.npm
 */
module.exports = {
	/**
	 * Generates a dependency tree for npm projects
	 *
	 * @public
	 * @param {string} dirPath Project path
	 * @param {object} [options]
	 * @param {boolean} [options.includeDeduped=false]
	 * @returns {Promise<object>} Promise resolving with a dependency tree
	 */
	generateDependencyTree(dirPath, options = {includeDeduped: false}) {
		return new NpmTranslator(options).generateDependencyTree(dirPath);
	}
};

// Export NpmTranslator class for testing only
if (process.env.NODE_ENV === "test") {
	module.exports._NpmTranslator = NpmTranslator;
}

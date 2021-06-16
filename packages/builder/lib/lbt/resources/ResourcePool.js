"use strict";

/*
const fs = require("fs");
const path = require("path");
*/
const {parseJS} = require("../utils/parseUtils");
const ComponentAnalyzer = require("../analyzer/ComponentAnalyzer");
const SmartTemplateAnalyzer = require("../analyzer/SmartTemplateAnalyzer");
const FioriElementsAnalyzer = require("../analyzer/FioriElementsAnalyzer");
const XMLCompositeAnalyzer = require("../analyzer/XMLCompositeAnalyzer");
const JSModuleAnalyzer = require("../analyzer/JSModuleAnalyzer");
const XMLTemplateAnalyzer = require("../analyzer/XMLTemplateAnalyzer");

const LibraryFileAnalyzer = require("./LibraryFileAnalyzer");
const ModuleInfo = require("./ModuleInfo");
const ResourceFilterList = require("./ResourceFilterList");
/*
const Resource = require("./Resource");
 */
const log = require("@ui5/logger").getLogger("lbt:resources:ResourcePool");

const jsAnalyzer = new JSModuleAnalyzer();

/*
function scanFileOrDir(fileOrDir, name, pool) {
	// console.log("visiting " + fileOrDir + " (" + name + ")");
	return new Promise( (resolve, reject) => {
		fs.stat(fileOrDir, (statErr, stat) => {
			if ( statErr ) {
				resolve(statErr);
			} else if ( stat.isDirectory() ) {
				if ( name && name.slice(-1) !== "/" ) {
					name = name + "/";
				}
				fs.readdir(fileOrDir, (dirErr, files) => {
					if ( dirErr ) {
						reject(dirErr);
					} else {
						resolve(
							Promise.all(
								files.map( (file) => scanFileOrDir(path.join(fileOrDir, file), name + file, pool) )
							)
						);
					}
				});
			} else if ( /\.(?:js|json|xml|html|properties|library)$/.test(name) ) {
				// TODO think about right place for configuration of such a global filtering
				const resource = new Resource(pool, name, fileOrDir, stat);
				resolve( pool.addResource( resource ) );
			} else {
				// else: ignore other resource types
				resolve(true);
			}
		});
	});
}
*/

async function determineDependencyInfo(resource, rawInfo, pool) {
	const info = new ModuleInfo(resource.name);
	info.size = resource.fileSize;
	if ( /\.js$/.test(resource.name) ) {
		// console.log("analyzing %s", resource.file);
		const code = await resource.buffer();
		info.size = code.length;
		const promises = [];
		let ast;
		try {
			ast = parseJS(code, {comment: true});
		} catch (err) {
			log.error("failed to parse %s: %s", resource.name, err.message);
		}
		if (ast) {
			try {
				jsAnalyzer.analyze(ast, resource.name, info);
				new XMLCompositeAnalyzer(pool).analyze(ast, resource.name, info);
			} catch (error) {
				log.error("failed to analyze %s: %s", resource.name, error.stack);
			}
		}
		if ( rawInfo ) {
			info.rawModule = true;
			// console.log("adding preconfigured dependencies for %s:", resource.name, rawInfo.dependencies);
			if ( rawInfo.dependencies ) {
				rawInfo.dependencies.forEach( (dep) => info.addDependency(dep) );
			}

			if ( rawInfo.requiresTopLevelScope != null ) {
				// an explicitly defined value for requiresTopLevelScope from .library overrides analysis result
				info.requiresTopLevelScope = rawInfo.requiresTopLevelScope;
			}

			if ( rawInfo.ignoredGlobals ) {
				info.removeIgnoredGlobalNames(rawInfo.ignoredGlobals);
			}
		}
		if ( /(?:^|\/)Component\.js/.test(resource.name) ) {
			promises.push(
				new ComponentAnalyzer(pool).analyze(resource, info),
				new SmartTemplateAnalyzer(pool).analyze(resource, info),
				new FioriElementsAnalyzer(pool).analyze(resource, info)
			);
		}

		await Promise.all(promises);

		// console.log(info);
	} else if ( /\.view.xml$/.test(resource.name) ) {
		const xmlView = await resource.buffer();
		info.size = xmlView.length;
		new XMLTemplateAnalyzer(pool).analyzeView(xmlView, info);
	} else if ( /\.control.xml$/.test(resource.name) ) {
		const xmlView = await resource.buffer();
		info.size = xmlView.length;
		new XMLTemplateAnalyzer(pool).analyzeFragment(xmlView, info);
	} else if ( /\.fragment.xml$/.test(resource.name) ) {
		const xmlView = await resource.buffer();
		info.size = xmlView.length;
		new XMLTemplateAnalyzer(pool).analyzeFragment(xmlView, info);
	}

	return info;
}

class ResourcePool {
	constructor({ignoreMissingModules} = {}) {
		this._ignoreMissingModules = !!ignoreMissingModules;
		// this._roots = [];
		this._resources = [];
		this._resourcesByName = new Map();
		this._dependencyInfos = new Map();
		this._rawModuleInfos = new Map();
		// this.whenReady = Promise.resolve(true);
	}

	/*
	TODO check relevance
	addRoot(fileOrFolder, prefix) {
		this._roots.push({
			root: fileOrFolder,
			prefix: prefix
		});
		log.verbose("  scanning <%s> for resources (prefix='%s')", fileOrFolder, prefix);
		const p = scanFileOrDir(fileOrFolder, prefix, this);
		this.whenReady = this.whenReady.then( () => p );
	}
	*/

	/**
	 * Adds a resource to the pool
  *
	 * @param {Resource} resource
	 * @returns {Promise|undefined} for libraries a Promise is returned undefined otherwise
	 */
	addResource( resource ) {
		if ( this._resourcesByName.has(resource.name) ) {
			log.warn("duplicate resource " + resource.name);
			// TODO return and let the first one always win?
		}

		this._resources.push(resource);
		this._resourcesByName.set(resource.name, resource);

		if ( /\.library$/.test(resource.name) ) {
			// read raw-module info from .library files
			return resource.buffer().then( (buffer) => {
				const infos = LibraryFileAnalyzer.getDependencyInfos( resource.name, buffer );
				for ( const name of Object.keys(infos) ) {
					this._rawModuleInfos.set(name, infos[name]);
				}
			});
		}
	}

	/**
	 * Retrieves the module info
	 *
	 * @param {string} name module name
	 * @returns {Promise<ModuleInfo>}
	 */
	async getModuleInfo(name) {
		let info = this._dependencyInfos.get(name);
		if ( info == null ) {
			info = Promise.resolve().then(async () => {
				const resource = await this.findResource(name);
				return determineDependencyInfo( resource, this._rawModuleInfos.get(name), this );
			});
			this._dependencyInfos.set(name, info);
		}
		return info;
	}

	async findResource(name) {
		const resource = this._resourcesByName.get(name);
		if ( resource == null ) {
			// TODO: Remove throw and return null to align with ui5-fs
			//	This would require changes in most consuming classes
			throw new Error("resource not found in pool: '" + name + "'");
		}
		return resource;
	}

	async findResourceWithInfo(name) {
		return this.findResource(name).then( (resource) => {
			return this.getModuleInfo(name).then( (info) => {
				// HACK: attach info to resource
				resource.info = info;
				return resource;
			}, (err) => resource);
		});
	}

	/**
	 * Finds the resources based matching the given pattern
  *
	 * @param {ResourceFilterList|RegExp} pattern
	 * @returns {Promise}
	 */
	async findResources(pattern) {
		if ( pattern instanceof ResourceFilterList ) {
			return this._resources.filter( (resource) => pattern.matches(resource.name) );
		}
		return this._resources.filter( (resource) => pattern.test(resource.name) );
	}

	get size() {
		return this._resources.length;
	}

	get resources() {
		return this._resources.slice();
	}

	getIgnoreMissingModules() {
		return this._ignoreMissingModules;
	}
}

module.exports = ResourcePool;


import ResourceInfoList from "./ResourceInfoList.js";
import ResourceFilterList from "./ResourceFilterList.js";
import ResourceInfo from "./ResourceInfo.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:resources:ResourceCollector");

const LOCALE = /^((?:[^/]+\/)*[^/]+?)_([A-Z]{2}(?:_[A-Z]{2}(?:_[A-Z0-9_]+)?)?)(\.properties|\.hdbtextbundle)$/i;
const THEME = /^((?:[^/]+\/)*)themes\/([^/]+)\//;

/**
 * Collects all resources in a set of resource folders or from an archive
 * and writes a 'resources.json' file for each component or library
 * that can be found in the resources.
 *
 * @since 1.29.0
 */
class ResourceCollector {
	/**
	 * Collects a set of ResourceInfo objects and groups them by components, libraries and themes.
	 *
	 * @param {ResourcePool} pool
	 * @param {ResourceFilterList} [filter] used to filter the resources based on their name
	 */
	constructor(pool, filter) {
		this._pool = pool;
		/**
		 * Global filters that should be taken into account when collecting resources.
		 *
		 * @type {ResourceFilterList}
		 * @private
		 */
		this._filter = filter != null ? filter : new ResourceFilterList();
		/**
		 * name to resource info
		 *
		 * @type {Map<string,ResourceInfo>}
		 */
		this._resources = new Map();

		/**
		 * prefix to ResourceInfoList
		 *
		 * @type {Map<string, ResourceInfoList>}
		 * @private
		 */
		this._components = new Map();

		/**
		 * prefix to ResourceInfoList
		 *
		 * @type {Map<string, ResourceInfoList>}
		 * @private
		 */
		this._themePackages = new Map();
	}

	/**
	 * Comma separated list of components to which orphaned resources should be added.
	 *
	 * A component and a separated list of resource patterns of orphans that should be added
	 * to the preceding component.
	 * If no such list is given, any orphaned resource will be added to the component.
	 * The evaluation logic for the filter list is the same as for the <code>filters</code>
	 * parameters: excludes can be denoted with a leading '-' or '!' and order is significant.
	 * Later filters can override the result of earlier ones.
	 *
	 * If no component is given, orphans will only be reported but not added to any component (default).
	 *
	 * @param {Object<string, string[]>} list component to list of components
	 */
	setExternalResources(list) {
		this._externalResources = list;
	}

	/**
	 * Processes a resource
	 *
	 * @param {@ui5/fs/Resource} resource
	 */
	async visitResource(resource) {
		const virPath = resource.getPath();
		if ( !virPath.startsWith("/resources/") ) {
			log.warn(`Non-runtime resource ${virPath} ignored`);
			return;
		}
		const name = virPath.slice("/resources/".length);
		if ( this._filter.matches(name) ) {
			const resourceInfo = new ResourceInfo(name);
			resourceInfo.size = await resource.getSize();
			this._resources.set(name, resourceInfo);

			const p = name.lastIndexOf("/");
			const prefix = name.substring(0, p + 1);
			const basename = name.substring(p + 1);
			if ( basename.match("^([^/]*\\.library|Component\\.js|manifest\\.json)$") &&
					!this._components.has(prefix)) {
				this._components.set(prefix, new ResourceInfoList(prefix));
			}
			// a .theme file within a theme folder indicates a library/theme package
			// Note: ignores .theme files in library folders

			// .theming files are not always present therefore this check is relevant for the library.source.less
			if ( name.match("(?:[^/]+/)*themes/[^/]+/(?:\\.theming|library\\.source\\.less)") &&
					!this._themePackages.has(prefix) ) {
				// log.info("Found new theme package %s", prefix);
				this._themePackages.set(prefix, new ResourceInfoList(prefix));
			}
		}
	}

	async enrichWithDependencyInfo(resourceInfo) {
		return this._pool.getModuleInfo(resourceInfo.name, resourceInfo.module).then(async (moduleInfo) => {
			if ( !resourceInfo.module && moduleInfo.name ) {
				resourceInfo.module = moduleInfo.name;
			}

			if ( moduleInfo.dynamicDependencies ) {
				resourceInfo.dynRequired = true;
			}

			if ( moduleInfo.dependencies.length > 0 ) {
				resourceInfo.required = resourceInfo.required || new Set();
				resourceInfo.condRequired = resourceInfo.condRequired || new Set();
				moduleInfo.dependencies.forEach((dep) => {
					if ( moduleInfo.isConditionalDependency(dep) ) {
						resourceInfo.condRequired.add(dep);
					} else if ( !moduleInfo.isImplicitDependency(dep) ) {
						resourceInfo.required.add(dep);
					}
				});
			}

			if ( moduleInfo.subModules.length > 0 ) {
				resourceInfo.included = resourceInfo.included || new Set();
				moduleInfo.subModules.forEach((mod) => {
					resourceInfo.included.add(mod);
				});
				await Promise.all(moduleInfo.subModules.map(async (subModule) => {
					// Try to inherit dependency info
					let subModuleInfo;
					try {
						subModuleInfo = await this._pool.getModuleInfo(subModule);
					} catch {
						log.verbose(`	Missing submodule ${subModule} included by ${moduleInfo.name}`);
					}
					if (subModuleInfo) {
						// Inherit subModule dependencies
						if ( subModuleInfo.dependencies.length > 0 ) {
							resourceInfo.required = resourceInfo.required || new Set();
							resourceInfo.condRequired = resourceInfo.condRequired || new Set();
							subModuleInfo.dependencies.forEach((dep) => {
								if (resourceInfo.included.has(dep)) {
									// Don't add dependency if module is already listed as "included"
									return;
								}
								if ( subModuleInfo.isConditionalDependency(dep) ) {
									// Avoid having module listed in both required and condRequired
									if (!resourceInfo.required.has(dep)) {
										resourceInfo.condRequired.add(dep);
									}
								} else if ( !subModuleInfo.isImplicitDependency(dep) ) {
									// Move module from condRequired to required
									if (resourceInfo.condRequired.has(dep)) {
										resourceInfo.condRequired.delete(dep);
									}
									resourceInfo.required.add(dep);
								}
							});
						}

						// Inherit dynamicDependencies flag
						if ( moduleInfo.dynamicDependencies ) {
							resourceInfo.dynRequired = true;
						}
					}
				}));
			}

			if (moduleInfo.requiresTopLevelScope) {
				resourceInfo.requiresTopLevelScope = true;
			}
			if (moduleInfo.exposedGlobals != null && moduleInfo.exposedGlobals.length) {
				resourceInfo.exposedGlobalNames = resourceInfo.exposedGlobalNames || new Set();
				moduleInfo.exposedGlobals.forEach((exposedGlobalName) => {
					resourceInfo.exposedGlobalNames.add(exposedGlobalName);
				});
			}

			if (moduleInfo.rawModule) {
				resourceInfo.format = "raw";
			}
		});
	}

	async determineResourceDetails({
		debugResources, mergedResources, designtimeResources, supportResources
	}) {
		const baseNames = new Set();
		const debugFilter = new ResourceFilterList(debugResources);
		const mergeFilter = new ResourceFilterList(mergedResources);
		const designtimeFilter = new ResourceFilterList(designtimeResources);
		const supportFilter = new ResourceFilterList(supportResources);

		const promises = [];
		const debugResourcesInfo = [];

		for (const [name, info] of this._resources.entries()) {
			if ( debugFilter.matches(name) ) {
				info.isDebug = true;
				log.verbose(`  Found potential debug resource '${name}'`);
			}

			// log.verbose(`  checking ${name}`);
			let m;
			if ( m = LOCALE.exec(name) ) {
				const baseName = m[1] + m[3];
				log.verbose(`  Found potential i18n resource '${name}', base name is '${baseName}', locale is ${m[2]}`);
				info.i18nName = baseName; // e.g. "i18n.properties"
				info.i18nLocale = m[2]; // e.g. "de"
				baseNames.add(baseName);
			}

			if ( m = THEME.exec(name) ) {
				// log.verbose("found theme candidate %s with prefix %s", name, m[1]);
				if ( this._themePackages.has(m[0]) ) {
					const theme = m[2];
					info.theme = theme;
					log.verbose(`  Found potential theme resource '${name}', theme ${theme}`);
				}
			}

			if ( /(?:\.js|\.view\.xml|\.control\.xml|\.fragment\.xml)$/.test(name) ) {
				if ( !info.isDebug ) {
					// Only analyze non-dbg files in first run
					promises.push(
						this.enrichWithDependencyInfo(info)
					);
				} else {
					// Collect dbg files to be handled in a second step (see below)
					debugResourcesInfo.push(info);
				}
			}

			// set the module name for .properties and .json
			if ( /(?:\.properties|\.json)$/.test(name) ) {
				promises.push(new Promise((resolve) => {
					return this._pool.getModuleInfo(info.name).then((moduleInfo) => {
						if (moduleInfo.name) {
							info.module = moduleInfo.name;
						}
						resolve();
					});
				}));
			}

			if ( mergeFilter.matches(name) ) {
				info.merged = true;
				log.verbose(`  Found potential merged resource '${name}'`);
			}

			if ( designtimeFilter.matches(name) ) {
				info.designtime = true;
				log.verbose(`  Found potential designtime resource '${name}'`);
			}

			if ( supportFilter.matches(name) ) {
				info.support = true;
				log.verbose(`  Found potential support resource '${name}'`);
			}
		}

		for (const baseName of baseNames) {
			if ( this._resources.has(baseName) ) {
				const info = this._resources.get(baseName);
				info.i18nName = baseName;
				info.i18nLocale = "";
			}
		}

		await Promise.all(promises);

		await Promise.all(debugResourcesInfo.map(async (dbgInfo) => {
			const debugName = dbgInfo.name;
			const nonDebugName = ResourceInfoList.getNonDebugName(debugName);
			const nonDbgInfo = this._resources.get(nonDebugName);

			// FIXME: "merged" property is only calculated in ResourceInfo#copyFrom
			// Therefore using the same logic here to compute it.

			// TODO: Idea: Use IsDebugVariant tag to decide whether to analyze the resource
			// If the tag is set, we don't expect different analysis results so we can copy the info (else-path)
			// Only when the tag is not set, we analyze the resource with its name (incl. -dbg)

			if (!nonDbgInfo || (nonDbgInfo.included != null && nonDbgInfo.included.size > 0)) {
				// We need to analyze the dbg resource if there is no non-dbg variant or
				// it is a bundle because we will (usually) have different content.

				if (nonDbgInfo) {
					// Always use the non-debug module name, if available
					dbgInfo.module = nonDbgInfo.module;
				}
				await this.enrichWithDependencyInfo(dbgInfo);
			} else {
				// If the non-dbg resource is not a bundle, we can just copy over the info and skip
				// analyzing the dbg variant as both should have the same info.

				const newDbgInfo = new ResourceInfo(debugName);

				// First copy info of analysis from non-dbg file (included, required, condRequired, ...)
				newDbgInfo.copyFrom(null, nonDbgInfo);
				// Then copy over info from dbg file to properly set name, isDebug, etc.
				newDbgInfo.copyFrom(null, dbgInfo);
				// Finally, set the module name to the non-dbg name
				newDbgInfo.module = nonDbgInfo.module;

				this._resources.set(debugName, newDbgInfo);
			}
		}));
	}

	createOrphanFilters() {
		log.verbose(
			`  Configured external resources filters (resources outside the namespace): ` +
			`${this._externalResources == null ? "(none)" : this._externalResources}`);

		const filtersByComponent = new Map();

		if ( this._externalResources != null ) {
			for ( let [component, filters] of Object.entries(this._externalResources) ) {
				const packageFilters = new ResourceFilterList(filters);
				if ( component === "/" || component === "" ) {
					component = "";
				} else if ( !component.endsWith("/") ) {
					component += "/";
				}
				log.verbose(`	Resulting filter list for '${component}': '${packageFilters}'`);
				filtersByComponent.set(component, packageFilters);
			}
		}
		return filtersByComponent;
	}

	groupResourcesByComponents() {
		const orphanFilters = this.createOrphanFilters();
		for (const resource of this._resources.values()) {
			let contained = false;
			for (const [prefix, list] of this._components.entries()) {
				if ( resource.name.startsWith(prefix) ) {
					list.add(resource);
					contained = true;
				} else if ( orphanFilters.has(prefix) ) {
					// log.verbose(`  checking '${resource.name}' against orphan filter ` +
					// 	`'${orphanFilters.get(prefix)}' (${prefix})`);
					if ( orphanFilters.get(prefix).matches(resource.name) ) {
						list.add(resource);
						contained = true;
					}
				}
			}

			if ( resource.theme != null ) {
				// assign theme resources additionally to theme packages
				for (const [prefix, list] of this._themePackages.entries()) {
					if ( resource.name.startsWith(prefix) ) {
						list.add(resource);
						contained = true;
					}
				}
			}

			if ( contained ) {
				this._resources.delete(resource.name);
			}
		}
	}

	/**
	 *
	 * @returns {Set<string>} resource names
	 */
	get resources() {
		return new Set(this._resources.keys());
	}

	/**
	 * Components
	 *
	 * @returns {Map<string, ResourceInfoList>}
	 */
	get components() {
		return this._components;
	}

	/**
	 * @returns {Map<string, ResourceInfoList>}
	 */
	get themePackages() {
		return this._themePackages;
	}
}

export default ResourceCollector;

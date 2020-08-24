const ResourceInfoList = require("./ResourceInfoList");
const ResourceFilterList = require("./ResourceFilterList");
const ResourceInfo = require("./ResourceInfo");


const LOCALE = /^((?:[^/]+\/)*[^/]+?)_([A-Z]{2}(?:_[A-Z]{2}(?:_[A-Z0-9_]+)?)?)(\.properties|\.hdbtextbundle)$/i;
const THEME = /^((?:[^/]+\/)*)themes\/([^/]+)\//;

const log = require("@ui5/logger").getLogger("lbt:resources:ResourceCollector");

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
	 * @param {object<string, string[]>} list component to list of components
	 */
	setExternalResources(list) {
		this._externalResources = list;
	}

	/**
	 * Processes a resource
	 *
	 * @param {module:@ui5/fs.Resource} resource
	 */
	async visitResource(resource) {
		const virPath = resource.getPath();
		if ( !virPath.startsWith("/resources/") ) {
			log.warn(`non-runtime resource ${virPath} ignored`);
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
			if ( basename.match("[^/]*\\.library|Component\\.js|manifest\\.json") && !this._components.has(prefix) ) {
				this._components.set(prefix, new ResourceInfoList(prefix));
			}
			// a .theme file within a theme folder indicates a library/theme package
			// Note: ignores .theme files in library folders

			// .theming files are not always present therefore this check is relevant for the library.source.less
			if ( name.match("(?:[^/]+/)*themes/[^/]+/(?:\\.theming|library\\.source\\.less)") && !this._themePackages.has(prefix) ) {
				// log.info("found new theme package %s", prefix);
				this._themePackages.set(prefix, new ResourceInfoList(prefix));
			}
		}
	}

	async enrichWithDependencyInfo(resourceInfo) {
		return this._pool.getModuleInfo(resourceInfo.name).then((moduleInfo) => {
			if ( moduleInfo.name ) {
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

	async determineResourceDetails({pool, debugResources, mergedResources, designtimeResources, supportResources}) {
		const baseNames = new Set();
		const debugFilter = new ResourceFilterList(debugResources);
		const mergeFilter = new ResourceFilterList(mergedResources);
		const designtimeFilter = new ResourceFilterList(designtimeResources);
		const supportFilter = new ResourceFilterList(supportResources);

		const promises = [];

		for (const [name, info] of this._resources.entries()) {
			// log.verbose(`  checking ${name}`);
			let m;
			if ( m = LOCALE.exec(name) ) {
				const baseName = m[1] + m[3];
				log.verbose(`  found potential i18n resource '${name}', base name is '${baseName}', locale is ${m[2]}`);
				info.i18nName = baseName; // e.g. "i18n.properties"
				info.i18nLocale = m[2]; // e.g. "de"
				baseNames.add(baseName);
			}

			if ( m = THEME.exec(name) ) {
				// log.verbose("found theme candidate %s with prefix %s", name, m[1]);
				if ( this._themePackages.has(m[0]) ) {
					const theme = m[2];
					info.theme = theme;
					log.verbose(`  found potential theme resource '${name}', theme ${theme}`);
				}
			}

			if ( /(?:\.js|\.view\.xml|\.control\.xml|\.fragment\.xml)$/.test(name) ) {
				promises.push(
					this.enrichWithDependencyInfo(info)
				);
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

			if ( debugFilter.matches(name) ) {
				info.isDebug = true;
				log.verbose(`  found potential debug resource '${name}'`);
			}

			if ( mergeFilter.matches(name) ) {
				info.merged = true;
				log.verbose(`  found potential merged resource '${name}'`);
			}

			if ( designtimeFilter.matches(name) ) {
				info.designtime = true;
				log.verbose(`  found potential designtime resource '${name}'`);
			}

			if ( supportFilter.matches(name) ) {
				info.support = true;
				log.verbose(`  found potential support resource '${name}'`);
			}
		}

		for (const baseName of baseNames) {
			if ( this._resources.has(baseName) ) {
				const info = this._resources.get(baseName);
				info.i18nName = baseName;
				info.i18nLocale = "";
			}
		}

		return Promise.all(promises);
	}

	createOrphanFilters() {
		log.verbose(
			`  configured external resources filters (resources outside the namespace): ${this._externalResources == null ? "(none)" : this._externalResources}`);

		const filtersByComponent = new Map();

		if ( this._externalResources != null ) {
			for ( let [component, filters] of Object.entries(this._externalResources) ) {
				const packageFilters = new ResourceFilterList(filters);
				if ( component === "/" || component === "" ) {
					component = "";
				} else if ( !component.endsWith("/") ) {
					component += "/";
				}
				log.verbose(`	resulting filter list for '${component}': '${packageFilters}'`);
				filtersByComponent.set(component, packageFilters);
			}
		}
		return filtersByComponent;
	}

	groupResourcesByComponents(options) {
		const orphanFilters = this.createOrphanFilters();
		const debugBundlesFilter = new ResourceFilterList(options.debugBundles);
		for (const resource of this._resources.values()) {
			let contained = false;
			for (const [prefix, list] of this._components.entries()) {
				const isDebugBundle = debugBundlesFilter.matches(resource.name);
				if ( resource.name.startsWith(prefix) ) {
					list.add(resource, !isDebugBundle);
					contained = true;
				} else if ( orphanFilters.has(prefix) ) {
					// log.verbose(`  checking '${resource.name}' against orphan filter '${orphanFilters.get(prefix)}' (${prefix})`);
					if ( orphanFilters.get(prefix).matches(resource.name) ) {
						list.add(resource, !isDebugBundle);
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

module.exports = ResourceCollector;

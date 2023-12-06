
import {pd} from "pretty-data";
import {toRequireJSName} from "../utils/ModuleName.js";
import {SectionType} from "./BundleDefinition.js";
import escapePropertiesFile from "../utils/escapePropertiesFile.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:bundle:AutoSplitter");

const xmlHtmlPrePattern = /<(?:\w+:)?pre\b/;

/**
 *
 * @author Frank Weigel
 * @since 1.27.1
 * @private
 */
class AutoSplitter {
	/**
	 * Used to split resources
	 *
	 * @param {ResourcePool} pool
	 * @param {Resolver} resolver
	 */
	constructor(pool, resolver) {
		this.pool = pool;
		this.resolver = resolver;
		this.optimizeXMLViews = false;
	}

	// TODO refactor JSMergedModuleBuilder(Ext) so that it can be used with a NullWriter to collect all resource sizes
	// this would avoid the redundant compression code in this class
	/**
	 * Runs the split operation
	 *
	 * @param {object} moduleDef
	 * @param {object} options
	 * @returns {Promise<Array>}
	 */
	async run(moduleDef, options) {
		options = options || {};
		const numberOfParts = options.numberOfParts;
		let totalSize = 0;
		const moduleSizes = Object.create(null);
		const depCacheSizes = [];
		let depCacheLoaderSize = 0;
		this.optimize = !!options.optimize;

		// ---- resolve module definition
		const resolvedModule = await this.resolver.resolve(moduleDef);
		// ---- calculate overall size of merged module

		if ( moduleDef.configuration ) {
			totalSize += 1024; // just a rough estimate
		}

		const promises = [];

		resolvedModule.sections.forEach( (section) => {
			switch ( section.mode ) {
			case SectionType.Provided:
				// provided modules don't contribute to the final size
				break;
			case SectionType.Raw:
			case SectionType.Preload:
				section.modules.forEach( (module) => {
					promises.push(
						this._calcMinSize(module).then( (size) => {
							totalSize += size;
							moduleSizes[module] = size;
						})
					);
				});
				break;
			case SectionType.Require:
				section.modules.forEach( (module) => {
					totalSize += "sap.ui.requireSync('');".length + toRequireJSName(module).length;
				});
				break;
			case SectionType.DepCache:
				depCacheLoaderSize = "sap.ui.loader.config({depCacheUI5:{}});".length;
				totalSize += depCacheLoaderSize;

				section.modules.forEach( (module) => {
					promises.push((async () => {
						const resource = await this.pool.findResourceWithInfo(module);
						const deps = resource.info.dependencies.filter(
							(dep) =>
								!resource.info.isConditionalDependency(dep) &&
								!resource.info.isImplicitDependency(dep)
						);
						if (deps.length > 0) {
							const depSize = `"${module}": [${deps.map((dep) => `"${dep}"`).join(",")}],`.length;
							totalSize += depSize;

							depCacheSizes.push({size: depSize, module});
						}
					})());
				});
				break;
			default:
				break;
			}
		});

		await Promise.all(promises);

		const partSize = Math.floor(totalSize / numberOfParts);
		log.verbose(
			`Total size of modules ${totalSize} (chars), target size for each ` +
			`of the ${numberOfParts} parts: ${partSize} (chars)`);

		// ---- create a separate module definition for each part
		const splittedModules = [];
		let moduleNameWithPart = moduleDef.name;
		if ( !/__part__/.test(moduleNameWithPart) ) {
			moduleNameWithPart = toRequireJSName(moduleNameWithPart) + "-__part__.js";
		}
		// vars = Object.create(null);

		let part = 0;
		totalSize = 0;
		let currentModule = {
			name: moduleNameWithPart.replace(/__part__/, part),
			sections: []
		};
		// vars.put("part",	Integer.toString(part));
		// currentModule.setName((ModuleName) ModuleNamePattern.resolvePlaceholders(moduleNameWithPart, vars));
		splittedModules.push(currentModule);
		if ( moduleDef.configuration ) {
			currentModule.configuration = moduleDef.configuration;
			totalSize += 1024; // TODO calculate a real size?
		}

		resolvedModule.sections.forEach( (section) => {
			let currentSection;
			let sequence;
			switch ( section.mode ) {
			case SectionType.Provided:
				// 'provided' sections are no longer needed in a fully resolved module
				break;
			case SectionType.Raw:
				// raw sections are always copied as a whole
				currentSection = {
					mode: SectionType.Raw,
					filters: []
				};
				currentSection.declareRawModules = section.sectionDefinition.declareRawModules;
				currentSection.sort = section.sectionDefinition.sort;
				currentModule.sections.push( currentSection );
				section.modules.forEach( (module) => {
					currentSection.filters.push(module);
					totalSize += moduleSizes[module];
				});
				break;
			case SectionType.Preload:
				sequence = section.modules.slice();
				// simple version: just sort alphabetically
				sequence.sort();

				// NODE_TODO: sort by copyright:
				// jsBuilder.beforeWriteFunctionPreloadSection((List<ModuleName>) sequence);

				currentSection = {
					mode: SectionType.Preload,
					filters: []
				};
				currentSection.name = section.name;
				currentModule.sections.push( currentSection );
				sequence.forEach( (module) => {
					const moduleSize = moduleSizes[module];
					if ( part + 1 < numberOfParts && totalSize + moduleSize / 2 > partSize ) {
						part++;
						// start a new module
						totalSize = 0;
						currentModule = {
							name: moduleNameWithPart.replace(/__part__/, part),
							sections: []
						};
						// vars.put("part",	Integer.toString(part));
						// currentModule.setName(
						//     (ModuleName) ModuleNamePattern.resolvePlaceholders(moduleNameWithPart, vars));
						splittedModules.push(currentModule);
						currentSection = {
							name: section.name,
							mode: SectionType.Preload,
							filters: []
						};
						currentModule.sections.push( currentSection );
					}
					// add module to current section
					currentSection.filters.push(module);
					totalSize += moduleSize;
				});
				break;
			case SectionType.Require:
				currentSection = {
					mode: SectionType.Require,
					filters: []
				};
				currentModule.sections.push( currentSection );
				section.modules.forEach( (module) => {
					currentSection.filters.push( module );
					totalSize += 21 + toRequireJSName(module).length;
				});
				break;
			case SectionType.DepCache:
				currentSection = {
					mode: SectionType.DepCache,
					filters: []
				};
				currentModule.sections.push( currentSection );
				totalSize += depCacheLoaderSize;

				depCacheSizes.forEach((depCache) => {
					if ( part + 1 < numberOfParts && totalSize + depCache.size / 2 > partSize ) {
						part++;
						// start a new module
						totalSize = depCacheLoaderSize;
						currentSection = {
							mode: SectionType.DepCache,
							filters: []
						};
						currentModule = {
							name: moduleNameWithPart.replace(/__part__/, part),
							sections: [currentSection]
						};
						splittedModules.push(currentModule);
					}

					if (!currentSection.filters.includes(depCache.module)) {
						currentSection.filters.push(depCache.module);
						totalSize += depCache.size;
					}
				});
				break;
			default:
				break;
			}
		});

		log.verbose(`Splitted modules: ${splittedModules}`);
		return splittedModules;
	}

	async _calcMinSize(module) {
		const resource = await this.pool.findResourceWithInfo(module);
		if ( resource != null ) {
			if ( resource.info && resource.info.compressedSize &&
					resource.info.compressedSize !== resource.info.size ) {
				return resource.info.compressedSize;
			}

			if ( /\.js$/.test(module) ) {
				// No optimize / minify step here as the input should be
				// either already optimized or not, based on the bundle options
				const fileContent = await resource.buffer();
				return fileContent.length;
			} else if ( /\.properties$/.test(module) ) {
				/* NODE-TODO minimize *.properties
				Properties props = new Properties();
				props.load(in);
				in.close();
				Writer out = new StringWriter();
				props.store(out, "");
				return out.toString().length();
				*/

				// Since AutoSplitter is also used when splitting non-project resources (e.g. dependencies)
				// *.properties files should be escaped if encoding option is specified
				const fileContent = await escapePropertiesFile(resource);

				return fileContent.length;
			} else if ( this.optimizeXMLViews && /\.view.xml$/.test(module) ) {
				// needs to be activated when it gets activated in JSMergedModuleBuilderExt
				let fileContent = await resource.buffer();
				if ( this.optimize ) {
					// For XML we use the pretty data
					// Do not minify if XML(View) contains an <*:pre> tag because whitespace of
					//	HTML <pre> should be preserved (should only happen rarely)
					if (!xmlHtmlPrePattern.test(fileContent.toString())) {
						fileContent = pd.xmlmin(fileContent.toString(), false);
					}
				}
				return fileContent.length;
			}

			// if there is no precompiled information about the resource, just determine its length
			if ( !resource.info && /\.(js|json|xml)$/.test(module) ) {
				const fileContent = await resource.buffer();
				return fileContent.length;
			}
		}

		return resource && resource.info && resource.info.size ? resource.info.size : 0;
	}

	/* NODE-TODO debug resources
	private URL findResource(ModuleName name) {
		URL result = null;
		if ( debugMode ) {
			ModuleName debugName = ModuleName.getDebugName(name);
			if ( debugName != null ) {
				result = pool.findResource(debugName);
			}
		}
		if ( result == null ) {
			result = pool.findResource(name);
		}
		return result;
	} */
}

export default AutoSplitter;

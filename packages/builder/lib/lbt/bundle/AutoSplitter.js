"use strict";

const terser = require("terser");
const {pd} = require("pretty-data");

const ModuleName = require("../utils/ModuleName");
const {SectionType} = require("./BundleDefinition");
const escapePropertiesFile = require("../utils/escapePropertiesFile");
const log = require("@ui5/logger").getLogger("lbt:bundle:AutoSplitter");

const copyrightCommentsPattern = /copyright|\(c\)(?:[0-9]+|\s+[0-9A-za-z])|released under|license|\u00a9/i;
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
					totalSize += "sap.ui.requireSync('');".length + ModuleName.toRequireJSName(module).length;
				});
				break;
			default:
				break;
			}
		});

		await Promise.all(promises);

		const partSize = Math.floor(totalSize / numberOfParts);
		log.verbose("total size of modules %d (chars), target size for each of the %d parts: %d (chars)",
			totalSize, numberOfParts, partSize);

		// ---- create a separate module definition for each part
		const splittedModules = [];
		let moduleNameWithPart = moduleDef.name;
		if ( !/__part__/.test(moduleNameWithPart) ) {
			moduleNameWithPart = ModuleName.toRequireJSName(moduleNameWithPart) + "-__part__.js";
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
				// NODE_TODO: sort by copyright:
				// sequence = section.modules.slice();
				// jsBuilder.beforeWriteFunctionPreloadSection((List<ModuleName>) sequence);
				currentSection = {
					mode: SectionType.Preload,
					filters: []
				};
				currentSection.name = section.name;
				currentModule.sections.push( currentSection );
				section.modules.forEach( (module) => {
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
					totalSize += 21 + ModuleName.toRequireJSName(module).length;
				});
				break;
			default:
				break;
			}
		});

		log.verbose("splitted modules: %s", splittedModules);
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
				// console.log("determining compressed size for %s", module);
				let fileContent = await resource.buffer();
				if ( this.optimize ) {
					// console.log("uglify %s start", module);
					const result = await terser.minify({
						[resource.name]: String(fileContent)
					}, {
						warnings: false, // TODO configure?
						compress: false, // TODO configure?
						output: {
							comments: copyrightCommentsPattern,
							wrap_func_args: false
						}
						// , outFileName: resource.name
						// , outSourceMap: true
					});
					// console.log("uglify %s end", module);
					fileContent = result.code;
				}
				// trace.debug("analyzed %s:%d%n", module, mw.getTargetLength());
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

module.exports = AutoSplitter;

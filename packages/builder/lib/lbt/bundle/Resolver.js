/**
 * Takes a bundle definition and resolves it against the given pool.
 */

import topologicalSort from "../graph/topologicalSort.js";
import {getRendererName} from "../UI5ClientConstants.js";
import ResourceFilterList from "../resources/ResourceFilterList.js";
import {SectionType} from "./BundleDefinition.js";
import ResolvedBundleDefinition from "./ResolvedBundleDefinition.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:bundle:Resolver");

let dependencyTracker;

const DEFAULT_FILE_TYPES = [
	".js",
	".control.xml", // XMLComposite
	".fragment.html",
	".fragment.json",
	".fragment.xml",
	".view.html",
	".view.json",
	".view.xml"
];

/**
 * Resolve a bundle definition.
 *
 * - evaluate include / exclude filters for each section
 * - follow dependencies, if option 'resolve' is configured for a section
 *
 * TODO ModuleResolver changes the order of the configured modules even if resolve isn't true
 *
 * @private
 */
class BundleResolver {
	// private final Trace trace;
	constructor(pool) {
		this.pool = pool;
	}
	// NODE-TODO private final Map<ModuleName, AbstractModuleDefinition> moduleDefinitions;

	/**
	 * @param {ModuleDefinition} bundle Bundle definition to resolve
	 			List of default file types to which a prefix pattern shall be expanded.
	 * @returns {Promise<ResolvedBundleDefinition>}
	 */
	resolve(bundle) {
		const fileTypes = bundle.defaultFileTypes || DEFAULT_FILE_TYPES;
		let visitedResources = Object.create(null);
		let selectedResources = Object.create(null);
		let selectedResourcesSequence = [];
		const pool = this.pool;
		/**
		 * Names of modules that are required in some way but could not be found
		 * in the resource pool.
		 */
		const missingModules = Object.create(null);
		/**
		 * Names of modules that are included in non-decomposable bundles.
		 * If they occur in the missingModules, then this is not an error.
		 */
		const includedModules = new Set();

		/**
		 * @param {JSModuleSectionDefinition} section
		 * @returns {Collection<ModuleName>}
		 */
		function collectModulesForSection(section) {
			let prevLength;
			let newKeys;

			// NODE-TODO resolvePlaceholders(section.getFilters());
			const filters = new ResourceFilterList( section.filters, fileTypes );

			function isAccepted(resourceName, required) {
				let match = required;
				// evaluate module filters only when global filters match
				match = filters.matches(resourceName, required); // NODE-TODO filter.matches(name, match, required);
				return match;
			}

			function checkForDecomposableBundle(resource) {
				const isBundle =
					resource?.info?.subModules.length > 0 &&
					!/(?:^|\/)library.js$/.test(resource.info.name);

				if (!isBundle) {
					return {
						resource,
						isBundle,
						decomposable: false
					};
				}

				return Promise.all(
					resource.info.subModules.map((sub) => pool.findResource(sub).catch(() => false))
				).then((modules) => {
					// it might look more natural to expect 'all' embedded modules to exist in the pool,
					// but expecting only 'some' module to exist is a more conservative approach
					return {
						resource,
						isBundle,
						decomposable: modules.some(($) => ($))
					};
				});
			}

			function checkAndAddResource(resourceName, depth, msg) {
				// console.log("    checking " + resourceName + " at depth " + depth);
				let maybeAccepted = true;
				let done;

				if ( !(resourceName in visitedResources) && (maybeAccepted = isAccepted(resourceName, depth > 0)) ) {
					// console.log("    accepted: " + resourceName );
					if ( dependencyTracker != null ) {
						dependencyTracker.visitDependency(resourceName);
					}

					// remember that we have seen this module already
					visitedResources[resourceName] = resourceName;

					done = pool.findResourceWithInfo(resourceName)
						.catch( (err) => {
							// if the caller provided an error message, log it
							if ( msg ) {
								missingModules[resourceName] ??= [];
								missingModules[resourceName].push(msg);
							}
							// return undefined
						})
						.then( (resource) => checkForDecomposableBundle(resource) )
						.then( ({resource, isBundle, decomposable}) => {
							const dependencyInfo = resource && resource.info;
							let promises = [];

							if ( isBundle && !decomposable ) {
								resource.info.subModules.forEach(
									(included) => {
										includedModules.add(included);
									}
								);
							}

							if ( decomposable ) {
								// bundles are not added, only their embedded modules
								promises = dependencyInfo.subModules.map( (included) => {
									return checkAndAddResource(included, depth + 1,
										`**** error: missing submodule ${included}, included by ${resourceName}`);
								});
							} else if ( resource != null ) {
								// trace.trace("    checking dependencies of " + resource.name );
								selectedResources[resourceName] = resourceName;
								selectedResourcesSequence.push(resourceName);

								// trace.info("    collecting %s", resource.name);

								// add dependencies, if 'resolve' is configured
								if ( section.resolve && dependencyInfo ) {
									promises = dependencyInfo.dependencies.map( function(required) {
										// ignore conditional dependencies if not configured
										if ( !section.resolveConditional &&
												dependencyInfo.isConditionalDependency(required) ) {
											return;
										}

										return checkAndAddResource(required, depth + 1,
											`**** error: missing module ${required}, required by ${resourceName}`);
									});
								}

								// add renderer, if 'renderer' is configured and if it exists
								if ( section.renderer ) {
									const rendererModuleName = getRendererName( resourceName );
									promises.push( checkAndAddResource( rendererModuleName, depth + 1) );
								}
							}

							return Promise.all( promises.filter( ($) => $ ) );
						});

					if ( dependencyTracker != null ) {
						dependencyTracker.endVisitDependency(resourceName);
					}
				} else if ( dependencyTracker != null && maybeAccepted && isAccepted(resourceName, depth>0) ) {
					// Note: the additional 'maybeAccepted' condition avoids calling the expensive 'isAccepted'
					// twice if it already returned false in the 'if' condition

					dependencyTracker.visitDependencyAgain(resourceName);

					done = Promise.resolve(true);
				}

				return done;
			}

			let oldSelectedResources;
			let oldIgnoredResources;
			let oldSelectedResourcesSequence;

			if ( [SectionType.Require, SectionType.DepCache].includes(section.mode) ) {
				oldSelectedResources = selectedResources;
				oldIgnoredResources = visitedResources;
				oldSelectedResourcesSequence = selectedResourcesSequence;
				selectedResources = Object.create(null);
				selectedResourcesSequence = [];
				visitedResources = Object.create(null);
			} else {
				// remember current state of module collection - needed to determine difference set later
				prevLength = selectedResourcesSequence.length;
			}

			/*
			 * In the Maven version of the bundle tooling, it was possible to define the content
			 * of a section of type 'provided' by listing a set of other bundle definition files.
			 * The whole content of those bundles then was determined and excluded from the current bundle.
			 *
			 * In the NodeJS version of the tooling, this is not supported. Instead, the resulting JS file for
			 * a bundle can be specified and the dependency analysis will determine the content of the bundle
			 * and exclude it from the current bundle.
			 *
			if ( section.mode == SectionType.Provided && section.modules ) {
				throw new Error("unsupported");
				for(ModuleName providedModuleDefinitionName : section.getProvidedModules()) {
					AbstractModuleDefinition providedModuleDefinition =
						moduleDefinitions.get(providedModuleDefinitionName);
					if ( providedModuleDefinition instanceof JSModuleDefinition ) {
						trace.verbose("    resolving provided module %s", providedModuleDefinitionName);
						ModuleResolver resolver = new ModuleResolver(trace, pool, moduleDefinitions, null);
						ResolvedBundleDefinition resolved = resolver.run((JSModuleDefinition) providedModuleDefinition,
							placeholderValues);
						for(ResolvedBundleDefinitionSection resolvedSection : resolved.getSections()) {
							if ( resolvedSection.getMode() != SectionType.Require ) {
								for(ModuleName providedModuleName : resolvedSection.getModules()) {
									ModuleInfo providedModuleInfo = pool.getModuleInfo(providedModuleName);
									if ( providedModuleInfo != null &&
											!visitedModules.containsKey(providedModuleName) ) {
										visitedModules.put(providedModuleName, providedModuleInfo);
									}
								}
							}
						}
					} else {
						trace.error("provided module could not be found or is not a JS module : %s",
							providedModuleDefinitionName);
					}
				}
			}
			*/

			// scan all known resources
			const promises = pool.resources.map( function(resource) {
				return checkAndAddResource(resource.name, 0);
			});

			return Promise.all(promises).then( function() {
				if ( [SectionType.Require, SectionType.DepCache].includes(section.mode) ) {
					newKeys = selectedResourcesSequence;
					selectedResources = oldSelectedResources;
					visitedResources = oldIgnoredResources;
					selectedResourcesSequence = oldSelectedResourcesSequence;
				} else {
					newKeys = selectedResourcesSequence.slice( prevLength ); // preserve order (for raw sections)
				}

				// console.log("    resolved module set: %s", newKeys);
				return newKeys;
			});
		}

		/*
		 * In the Maven version of the bundle tooling, a bundle definition could be
		 * parameterized by locale, ltr/rtl mode and theme. The LBT doesn't support this yet.
		 *
		 * As theming files are build with less now, only the parameterization by locale
		 * might be needed. It's lack can be compensated by programmatically building the
		 * necessary bundle definitions and e.g. injecting the locale into the Id or the
		 * filters defining the content of the bundle.
		 * .
		private Collection<ModuleFilter> resolvePlaceholders(Collection<ModuleFilter> list) {
			if ( !placeholderValues.isEmpty() ) {
				List<ModuleFilter> modifiedList = new ArrayList<ModuleFilter>(list);
				for(int i=0; i<modifiedList.size(); i++) {
					ModuleNameMatcher matcher = modifiedList.get(i).getMatcher();
					ModuleNameMatcher resolved = ModuleNamePattern.resolvePlaceholders(matcher, placeholderValues);
					if ( resolved != matcher ) {
						modifiedList.set(i, new ModuleFilter(resolved, modifiedList.get(i).getMode()));
					}
				}
				list = modifiedList;
			}
			return list;
		} */

		// NODE-TODO if ( PerfMeasurement.ACTIVE ) PerfMeasurement.start(PerfKeys.RESOLVE_MODULE);

		if ( dependencyTracker != null ) {
			dependencyTracker.startResolution(bundle);
		}

		// NODE-TODO placeholderValues = vars;

		log.verbose(`  Resolving bundle definition ${bundle.name}`);

		const resolved = new ResolvedBundleDefinition(bundle /* , vars*/);

		let previous = Promise.resolve(true);

		bundle.sections.forEach(function(section, index) {
			previous = previous.then( function() {
				log.verbose(
					`    Resolving section${section.name ? " '" + section.name + "'" : ""} of type ${section.mode}`);

				// NODE-TODO long t0=System.nanoTime();
				const resolvedSection = resolved.sections[index];

				return collectModulesForSection(section).
					then( (modules) => {
						if ( section.mode == SectionType.Raw && section.sort !== false ) {
							// sort the modules in topological order
							return topologicalSort(pool, modules).then( (modules) => {
								log.silly(`      Resolved modules (sorted): ${modules}`);
								return modules;
							});
						}
						if ( section.mode === SectionType.BundleInfo ) {
							modules.sort();
						}
						log.silly(`      Resolved modules: ${modules}`);
						return modules;
					}).then( function(modules) {
						resolvedSection.modules = modules;
					});
				// NODE-TODO long t1=System.nanoTime();

				// NODE-TODO if ( PerfMeasurement.ACTIVE ) trace.info("[Measurement] %12d nsec - %s", t1-t0,
				// 												"Module collection and filtering");
			});
		});

		if ( dependencyTracker != null ) {
			dependencyTracker.endResolution(bundle, /* NODE-TODO, vars*/);
		}

		// NODE-TODO if ( PerfMeasurement.ACTIVE ) PerfMeasurement.stop(PerfKeys.RESOLVE_MODULE);

		return previous.then( function() {
			// ignore missing modules that have been found in non-decomposable bundles
			includedModules.forEach((included) => delete missingModules[included]);

			// report the remaining missing modules
			Object.keys(missingModules).sort().forEach((missing) => {
				const messages = missingModules[missing];
				messages.sort().forEach((msg) => {
					log.error(msg);
				});
			});

			log.verbose("  Resolving bundle done");

			return resolved;
		});
	}
}


export default BundleResolver;


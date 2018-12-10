/**
 * Analyzes a UI5 Component to collect dependency information.
 *
 * Tries to find a manifest.json in the same package. If it is found and if
 * it is a valid JSON, an "sap.ui5" section is searched and evaluated in the following way
 *  - any library dependency is added as a dependency to the library.js module
 *    of that library. If the library dependency is modelled as 'lazy', the
 *    module dependency will be added as 'conditional'
 *  - any component dependency is added as a dependency to the Component.js module
 *    of that component. If the Component dependency is modeled as 'lazy', the
 *    module dependency will be added as 'conditional'
 *  - for each configured UI5 module for which a type is configured, a module
 *    dependency to that type is added
 *  - for each route that contains a view name, a module dependency to that view will be
 *    added
 * TODO component usages have to be handled
 *
 * This class can handle multiple concurrent analysis calls, it has no instance state
 * other than the pool (which is readonly).
 */
"use strict";

const ModuleName = require("../utils/ModuleName");
const log = require("@ui5/logger").getLogger("lbt:analyzer:ComponentAnalyzer");

// ---------------------------------------------------------------------------------------------------------

function each(obj, fn) {
	if ( obj ) {
		Object.keys(obj).forEach(
			(key) => fn(obj[key], key, obj)
		);
	}
}

function makeArray(value) {
	if ( Array.isArray(value) ) {
		return value;
	}
	return value == null ? [] : [value];
}

/**
 * Analyzes the manifest for a Component.js to find more dependencies.
 * @since 1.47.0
 * @private
 */
class ComponentAnalyzer {
	constructor(pool) {
		this._pool = pool;
	}

	async analyze(resource, info) {
		// ignore base class for components
		if ( resource.name === "sap/ui/core/Component.js" ) {
			return info;
		}

		const manifestName = resource.name.replace(/Component\.js$/, "manifest.json");
		try {
			const manifestResource = await this._pool.findResource(manifestName).catch(() => null);
			if ( manifestResource ) {
				const fileContent = await manifestResource.buffer();
				this._analyzeManifest( JSON.parse(fileContent.toString()), info );
			} else {
				log.verbose("No manifest found for '%s', skipping analysis", resource.name);
			}
		} catch (err) {
			log.error("an error occurred while analyzing component %s (ignored)", resource.name, err);
		}

		return info;
	}

	/**
	 * Evaluates a manifest after it has been read and parsed
	 * and adds any newly found dependencies to the given info object.
	 *
	 * @param {object} manifest JSON with app descriptor structure
	 * @param {ModuleInfo} info ModuleInfo object that should be enriched
	 * @returns {ModuleInfo} ModuleInfo object that should be enriched
	 * @private
	 */
	_analyzeManifest( manifest, info ) {
		const ui5 = (manifest && manifest["sap.ui5"]) || {};

		if ( ui5.resources && ui5.resources.css ) {
			// TODO how to handle CSS dependencies?
		}

		if ( ui5.resources && ui5.resources.js ) {
			// TODO how to handle JS dependencies (they are URLs, not module names)
		}

		if ( ui5.rootView ) {
			let rootView;
			if ( typeof ui5.rootView === "string" ) {
				rootView = {
					viewName: ui5.rootView,
					type: "XML"
				};
			} else {
				rootView = ui5.rootView;
			}
			const module = ModuleName.fromUI5LegacyName(
				rootView.viewName,
				".view." + rootView.type.toLowerCase() );
			log.verbose("adding root view dependency ", module);
			info.addDependency( module );
		}

		each( ui5.dependencies && ui5.dependencies.libs, (options, lib) => {
			const module = ModuleName.fromUI5LegacyName(lib, "/library.js");
			log.verbose("adding library dependency ", module, options.lazy || false);
			info.addDependency( module, options.lazy ); // lazy -> conditional dependency
		});

		each( ui5.dependencies && ui5.dependencies.components, (options, component) => {
			const module = ModuleName.fromUI5LegacyName(component, "/Component.js");
			log.verbose("adding component dependency ", module, options.lazy || false);
			info.addDependency( module, options.lazy ); // lazy -> conditional dependency
		});

		// TODO usages

		each( ui5.models, (options, model) => {
			if ( options.type ) {
				const module = ModuleName.fromUI5LegacyName( options.type );
				log.verbose("derived model implementation dependency ", module);
				info.addDependency(module);
			}
		});

		const routing = ui5.routing;
		if ( routing ) {
			if (Array.isArray(routing.routes)) {
				routing.routes.forEach((route) => this._visitRoute(route, routing, info));
			} else {
				for (const key in routing.routes) {
					if (!routing.routes.hasOwnProperty(key)) {
						continue;
					}
					const route = routing.routes[key];
					this._visitRoute(route, routing, info);
				}
			}
		}

		return info;
	}

	/**
	 * called for any route, this adds the view used by a route as a dependency.
	 *
	 * @param {object} route the single route
	 * @param {object} routing the full routing object from the manifest
	 * @param {ModuleInfo} info  ModuleInfo object that should be enriched
	 * @private
	 */
	_visitRoute( route, routing, info ) {
		makeArray(route.target).forEach((targetRef) => {
			const target = routing.targets[targetRef];
			if ( target && target.viewName ) {
				// merge target config with default config
				const config = Object.assign({}, routing.config, target);
				const module = ModuleName.fromUI5LegacyName(
					(config.viewPath ? config.viewPath + "." : "") +
					config.viewName, ".view." + config.viewType.toLowerCase() );
				log.verbose("converting routing target '%s' to view dependency '%s'", targetRef, module);
				// TODO make this a conditional dependency, depending on the pattern?
				info.addDependency(module);
			}
		});
	}
}

module.exports = ComponentAnalyzer;

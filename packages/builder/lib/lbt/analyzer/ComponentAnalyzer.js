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
const log = require("@ui5/logger").getLogger("ComponentAnalyzer");

// ---------------------------------------------------------------------------------------------------------

function each(obj, fn) {
	if ( obj ) {
		Object.keys(obj).forEach(
			(key) => fn(obj[key], key, obj)
		);
	}
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

		let manifestName = resource.name.replace(/Component\.js$/, "manifest.json");
		try {
			let manifestResource = await this._pool.findResource(manifestName);
			let fileContent = await manifestResource.buffer();
			this._analyzeManifest( JSON.parse(fileContent.toString()), info );
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
		let ui5 = (manifest && manifest["sap.ui5"]) || {};

		if ( ui5.resources && ui5.resources.css ) {
			// TODO how to handle CSS dependencies?
		}

		if ( ui5.resources && ui5.resources.js ) {
			// TODO how to handle JS dependencies (they are URLs, not module names)
		}

		if ( ui5.rootView ) {
			let module = ModuleName.fromUI5LegacyName(
				ui5.rootView.viewName,
				".view." + ui5.rootView.type.toLowerCase() );
			log.verbose("adding root view dependency ", module);
			info.addDependency( module );
		}

		each( ui5.dependencies && ui5.dependencies.libs, (options, lib) => {
			let module = ModuleName.fromUI5LegacyName(lib, "/library.js");
			log.verbose("adding library dependency ", module, options.lazy || false);
			info.addDependency( module, options.lazy ); // lazy -> conditional dependency
		});

		each( ui5.dependencies && ui5.dependencies.components, (options, component) => {
			let module = ModuleName.fromUI5LegacyName(component, "/Component.js");
			log.verbose("adding component dependency ", module, options.lazy || false);
			info.addDependency( module, options.lazy ); // lazy -> conditional dependency
		});

		// TODO usages

		each( ui5.models, (options, model) => {
			if ( options.type ) {
				let module = ModuleName.fromUI5LegacyName( options.type );
				log.verbose("derived model implementation dependency ", module);
				info.addDependency(module);
			}
		});

		let routing = ui5.routing;
		if ( routing ) {
			// console.log("routing: ", routing);
			routing.routes.forEach( (route) => {
				let target = routing.targets[route.target];
				if ( target && target.viewName ) {
					let module = ModuleName.fromUI5LegacyName(
						(routing.config.viewPath ? routing.config.viewPath + "." : "") +
						target.viewName, ".view." + routing.config.viewType.toLowerCase() );
					log.verbose("converting route to view dependency ", module);
					// TODO make this a conditional dependency, depending on the pattern?
					info.addDependency(module);
				}
			});
		}

		return info;
	}
}

module.exports = ComponentAnalyzer;

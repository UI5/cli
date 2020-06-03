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

/**
 * Analyzes the manifest for a Component.js to find more dependencies.
 *
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
			log.error("an error occurred while analyzing component %s (ignored)", resource.name, err.stack);
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
		const sapApp = (manifest && manifest["sap.app"]) || {};
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

		// See sap/ui/core/Component._createManifestModelConfigurations
		each( ui5.models, (options, model) => {
			let modelType;
			if ( options.type ) {
				modelType = options.type;
			} else if ( options.dataSource ) {
				const oDataSource = sapApp.dataSources && sapApp.dataSources[options.dataSource];
				if (!oDataSource) {
					log.warn(`Provided dataSource "${options.dataSource}" for model "${model}" does not exist.`);
					return;
				}
				// default dataSource type is OData
				const dataSourceType = oDataSource.type || "OData";
				let odataVersion;
				switch (dataSourceType) {
				case "OData":
					odataVersion = oDataSource.settings && oDataSource.settings.odataVersion;
					if (odataVersion === "4.0") {
						modelType = "sap.ui.model.odata.v4.ODataModel";
					} else if (!odataVersion || odataVersion === "2.0") {
						// Default if no version is specified
						modelType = "sap.ui.model.odata.v2.ODataModel";
					} else {
						log.warn(`Provided OData version "${odataVersion}" in ` +
							`dataSource "${options.dataSource}" for model "${model}" is unknown. ` +
							`You might be using an outdated version of the UI5 Tooling.`);
						return;
					}
					break;
				case "JSON":
					modelType = "sap.ui.model.json.JSONModel";
					break;
				case "XML":
					modelType = "sap.ui.model.xml.XMLModel";
					break;
				default:
					// for custom dataSource types, the class should already be specified in the sap.ui5 models config
					log.warn(`Unknown dataSource type "${dataSourceType}" defined for model "${model}". ` +
						`Please configure a "type" in the model config.`);
					return;
				}
			} else {
				log.warn(`Neither a type nor a dataSource has been defined for model "${model}".`);
				return;
			}
			const module = ModuleName.fromUI5LegacyName( modelType );
			log.verbose("derived model implementation dependency ", module);
			info.addDependency(module);
		});

		const routing = ui5.routing;
		if ( routing ) {
			const routingConfig = routing.config || {};

			// See sap/ui/core/UIComponent#init
			if (routing.routes) {
				const routerClassName = routingConfig.routerClass || "sap.ui.core.routing.Router";
				const routerClassModule = ModuleName.fromUI5LegacyName(routerClassName);
				log.verbose(`adding router dependency '${routerClassModule}'`);
				info.addDependency(routerClassModule);
			} else if (routing.targets) {
				const targetsModule = routingConfig.targetsClass || "sap/ui/core/routing/Targets.js";
				log.verbose(`adding routing targets dependency '${targetsModule}'`);
				info.addDependency(targetsModule);

				const viewsModule = "sap/ui/core/routing/Views.js";
				log.verbose(`adding routing views dependency '${viewsModule}'`);
				info.addDependency(viewsModule);
			}

			if (routing.targets) {
				for (const targetName of Object.keys(routing.targets)) {
					const target = routing.targets[targetName];
					if (target && target.viewName) {
						// merge target config with default config
						const config = Object.assign({}, routing.config, target);
						const module = ModuleName.fromUI5LegacyName(
							(config.viewPath ? config.viewPath + "." : "") +
							config.viewName, ".view." + config.viewType.toLowerCase() );
						log.verbose("converting routing target '%s' to view dependency '%s'", targetName, module);
						// TODO make this a conditional dependency, depending on the route pattern?
						info.addDependency(module);
					}
				}
			}
		}

		return info;
	}
}

module.exports = ComponentAnalyzer;

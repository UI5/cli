/**
 * Analyzes a FioriElements app and its underlying template components to collect dependency information.
 *
 * Tries to find a manifest.json in the same package. If it is found and if
 * it is a valid JSON, an "sap.fe" section is searched and evaluated in the following way
 * - for each entity set in the "entitySets" object, each sub-entry is checked for a "default"."template" property
 * - when found, that string is interpreted as the short name of a template component in package sap.fe.templates
 * - a dependency to that template component is added to the analyzed app
 *
 * For a full analysis, "routing" also should be taken into account. Only when a sub-entry of the entity set
 * is referenced by a route, then the template for that entry will be used. Routes thereby could form entry points.
 *
 * <pre>
 *  {
 *      ...
 *
 *      "sap.fe" : {
 *          "entitySets" : {
 *              "C_AIVS_MDBU_ArtistTP" : {
 *                  "feed": {
 *                      "default": {
 *                          "template": "ListReport"
 *                      }
 *                  },
 *                  "entry" : {
 *                      "default" : {
 *                          "outbound" : "musicV2Display"
 *                      }
 *                  }
 *              }
 *          },
 *          "routing" : {
 *              "routes" :{
 *                  "ArtistList": {
 *                      "target": "C_AIVS_MDBU_ArtistTP/feed"
 *                  }
 *              }
 *          }
 *      }
 *
 *      ...
 * </pre>
 *
 * The template component is analyzed in the following way:
 * - precondition: template component class is defined in an AMD-style module, using define or sap.ui.define
 * - precondition: the module 'sap/fe/core/TemplateAssembler' is imported
 * - precondition: a call to TemplateAssembler.getTemplateComponent is used to define the component class
 * - precondition: that call is used in a top level return statement of the factory function
 * - precondition: necessary parameters to that call are given as an object literal (no further coding)
 * - precondition: the settings define a managed property property 'metadata.properties.templateName' with a
 *                 defaultValue of type string
 * The default value of the property represents the template view of the template component.
 * The manifest of the template app in theory could specify an alternative template as setting.templateName,
 * but as of June 2017, this possibility is currently not used.
 *
 * This class can handle multiple concurrent analysis calls, it has no instance state other than the pool
 * (which is readonly).
 */

import {fromUI5LegacyName} from "../utils/ModuleName.js";
import SapUiDefine from "../calls/SapUiDefine.js";
import {parseJS, Syntax} from "../utils/parseUtils.js";
import {getValue, isMethodCall, getStringValue} from "../utils/ASTUtils.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:analyzer:FioriElementAnalyzer");

// ---------------------------------------------------------------------------------------------------------

function each(obj, fn) {
	if ( obj ) {
		Object.keys(obj).forEach(
			(key) => fn(obj[key], key, obj)
		);
	}
}

const CALL_DEFINE = ["define"];
const CALL_SAP_UI_DEFINE = ["sap", "ui", "define"];

/**
 * Analyzes the manifest for a Fiori Elements application (next to its Component.js) to find more dependencies.
 *
 * @private
 */
class FioriElementsAnalyzer {
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
				await this._analyzeManifest( JSON.parse(fileContent.toString()), info );
			} else {
				log.verbose(`No manifest found for '${resource.name}', skipping analysis`);
			}
		} catch (err) {
			log.error(`An error occurred while analyzing template app ${resource.name} (ignored): ${err.message}`);
			log.verbose(err.stack);
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
	async _analyzeManifest( manifest, info ) {
		const promises = [];
		const st = (manifest && manifest["sap.fe"]) || {};

		each(st.entitySets, (entitySetCfg) => {
			each(entitySetCfg, (activityCfg, activity) => {
				if ( activity === "entitySet" ) {
					return;
				}
				each(activityCfg, (actionCfg) => {
					if ( actionCfg.template ) {
						const module = fromUI5LegacyName( "sap.fe.templates." +
										actionCfg.template + ".Component" );
						log.verbose(`Template app: Add dependency to template component ${module}`);
						info.addDependency(module);
						promises.push( this._analyzeTemplateComponent(module, actionCfg, info) );
					}
				});
			});
		});

		return Promise.all(promises);
	}

	async _analyzeTemplateComponent(moduleName, pageConfig, appInfo) {
		// console.log("analyzing template component %s", moduleName);
		const resource = await this._pool.findResource(moduleName);
		const code = await resource.buffer();
		const ast = parseJS(code);
		const defaultTemplateName = this._analyzeAST(moduleName, ast);
		const templateName = (pageConfig.component && pageConfig.component.settings &&
								pageConfig.component.settings.templateName) || defaultTemplateName;
		if ( templateName ) {
			const templateModuleName = fromUI5LegacyName( templateName, ".view.xml" );
			log.verbose(`Template app: Add dependency to template view ${templateModuleName}`);
			appInfo.addDependency(templateModuleName);
		}
	}

	_analyzeAST(moduleName, ast) {
		let templateName = "";
		if ( ast.body.length > 0 && (isMethodCall(ast.body[0].expression, CALL_SAP_UI_DEFINE) ||
				isMethodCall(ast.body[0].expression, CALL_DEFINE)) ) {
			const defineCall = new SapUiDefine(ast.body[0].expression, moduleName);
			const TA = defineCall.findImportName("sap/fe/core/TemplateAssembler.js");
			// console.log("local name for TemplateAssembler: %s", TA);
			if ( TA && defineCall.factory ) {
				if (defineCall.factory.type === Syntax.ArrowFunctionExpression &&
					defineCall.factory.expression === true) {
					if ( this._isTemplateClassDefinition(TA, defineCall.factory.body) ) {
						templateName =
							this._analyzeTemplateClassDefinition(defineCall.factory.body.arguments[2]) || templateName;
					}
				} else {
					defineCall.factory.body.body.forEach( (stmt) => {
						if ( stmt.type === Syntax.ReturnStatement &&
							this._isTemplateClassDefinition(TA, stmt.argument)
						) {
							templateName =
								this._analyzeTemplateClassDefinition(stmt.argument.arguments[2]) || templateName;
						}
					});
				}
			}
		}
		return templateName;
	}

	_isTemplateClassDefinition(TA, node) {
		return isMethodCall(node, [TA, "getTemplateComponent"]) &&
			node.arguments.length > 2 &&
			node.arguments[2].type === "ObjectExpression";
	}

	_analyzeTemplateClassDefinition(clazz) {
		return getStringValue(getValue(clazz, ["metadata", "properties", "templateName", "defaultValue"]));
	}
}

export default FioriElementsAnalyzer;

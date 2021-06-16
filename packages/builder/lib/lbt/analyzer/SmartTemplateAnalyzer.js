/**
 * Analyzes a SmartTemplate app and its underlying template components to collect dependency information.
 *
 * Tries to find a manifest.json in the same package. If it is found and if
 * it is a valid JSON, an "sap.ui.generic.app" section is searched and evaluated in the following way
 *  - for each page configuration, the configured component is added as a dependency to the template app module
 *  - If the page configuration contains a templateName, a dependency to that template view is added to the app
 *  - Otherwise, the class definition of the component is analyzed to find a default template view name
 *    If found, a dependency to that view is added to the app module
 *
 * The template component is analyzed in the following way:
 * - precondition: template component class is defined in an AMD-style module, using define or sap.ui.define
 * - precondition: the module 'sap/suite/ui/generic/template/lib/TemplateAssembler' is imported
 * - precondition: a call to TemplateAssembler.getTemplateComponent is used to define the component class
 * - precondition: that call is used in a top level return statement of the factory function
 * - precondition: necessary parameters to that call are given as an object literal (no further coding)
 * - precondition: the settings define a managed property property 'metadata.properties.templateName'
 *                 with a defaultValue of type string
 * The default value of the property represents the template view of the template component.
 * The manifest of the template app in theory could specify an alternative template in
 * component.settings.templateName,
 *
 * This class can handle multiple concurrent analysis calls, it has no instance state other than the pool
 * (which is readonly).
 */
"use strict";

const ModuleName = require("../utils/ModuleName");
const SapUiDefine = require("../calls/SapUiDefine");
const {parseJS, Syntax} = require("../utils/parseUtils");
const {getValue, isMethodCall, isString} = require("../utils/ASTUtils");
const log = require("@ui5/logger").getLogger("lbt:analyzer:SmartTemplateAnalyzer");

// ---------------------------------------------------------------------------------------------------------

const CALL_DEFINE = ["define"];
const CALL_SAP_UI_DEFINE = ["sap", "ui", "define"];

/**
 * Analyzes the manifest for a Smart Template App (next to its Component.js) to find more dependencies.
 *
 * @private
 */
class TemplateComponentAnalyzer {
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
				log.verbose("No manifest found for '%s', skipping analysis", resource.name);
			}
		} catch (err) {
			log.error("an error occurred while analyzing template app %s (ignored):", resource.name);
			log.error(err.stack);
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
		const that = this;
		const st = (manifest && manifest["sap.ui.generic.app"]) || {};
		function recursePage(page) {
			if ( page.component && page.component.name ) {
				const module = ModuleName.fromUI5LegacyName( page.component.name + ".Component" );
				log.verbose("template app: add dependency to template component %s", module);
				info.addDependency(module);
				promises.push( that._analyzeTemplateComponent(module, page, info) );
			}
			recurse(page);
		}
		function recurse(ctx) {
			if ( Array.isArray(ctx.pages) ) {
				ctx.pages.forEach(recursePage);
			} else if (typeof ctx.pages === "object") {
				Object.values(ctx.pages).forEach(recursePage);
			}
		}
		recurse(st);

		return Promise.all(promises);
	}

	async _analyzeTemplateComponent(moduleName, pageConfig, appInfo) {
		// console.log("analyzing template component %s", moduleName);
		try {
			const resource = await this._pool.findResource(moduleName);
			const code = await resource.buffer();
			const ast = parseJS(code);
			const defaultTemplateName = this._analyzeAST(moduleName, ast);
			const templateName = (pageConfig.component && pageConfig.component.settings &&
									pageConfig.component.settings.templateName) || defaultTemplateName;
			if ( templateName ) {
				const templateModuleName = ModuleName.fromUI5LegacyName( templateName, ".view.xml" );
				log.verbose("template app: add dependency to template view %s", templateModuleName);
				appInfo.addDependency(templateModuleName);
			}
		} catch (err) {
			if (this._pool.getIgnoreMissingModules() && err.message.startsWith("resource not found in pool")) {
				log.verbose("Ignoring missing module as per ResourcePool configuration: " + err.message);
			} else {
				throw err;
			}
		}
	}

	_analyzeAST(moduleName, ast) {
		let templateName = "";
		if ( ast.body.length > 0 && (isMethodCall(ast.body[0].expression, CALL_SAP_UI_DEFINE) ||
				isMethodCall(ast.body[0].expression, CALL_DEFINE)) ) {
			const defineCall = new SapUiDefine(ast.body[0].expression, moduleName);
			const TA = defineCall.findImportName("sap/suite/ui/generic/template/lib/TemplateAssembler.js");
			// console.log("local name for TemplateAssembler: %s", TA);
			if ( TA && defineCall.factory ) {
				defineCall.factory.body.body.forEach( (stmt) => {
					if ( stmt.type === Syntax.ReturnStatement &&
							isMethodCall(stmt.argument, [TA, "getTemplateComponent"]) &&
							stmt.argument.arguments.length > 2 &&
							stmt.argument.arguments[2].type === "ObjectExpression" ) {
						templateName = this._analyzeTemplateClassDefinition(stmt.argument.arguments[2]) || templateName;
					}
				});
			}
		}
		return templateName;
	}

	_analyzeTemplateClassDefinition(clazz) {
		const defaultValue = getValue(clazz, ["metadata", "properties", "templateName", "defaultValue"]);
		if ( isString(defaultValue) ) {
			return defaultValue.value;
		}
	}
}

module.exports = TemplateComponentAnalyzer;

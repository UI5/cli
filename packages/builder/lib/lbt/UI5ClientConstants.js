
export const MODULE__UI5LOADER = "ui5loader.js";
export const MODULE__UI5LOADER_AUTOCONFIG = "ui5loader-autoconfig.js";
export const MODULE__JQUERY_SAP_GLOBAL = "jquery.sap.global.js";
export const MODULE__SAP_UI_CORE_CORE = "sap/ui/core/Core.js";
export const EVO_MARKER_RESOURCE = MODULE__UI5LOADER;

export function getRendererName( module ) {
	if ( /\.js$/.test(module) ) {
		return module.replace(/\.js$/, "Renderer.js");
	}
}

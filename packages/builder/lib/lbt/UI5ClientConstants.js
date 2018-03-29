"use strict";

module.exports.MODULE__UI5LOADER = "ui5loader.js";
module.exports.MODULE__UI5LOADER_AUTOCONFIG = "ui5loader-autoconfig.js";
module.exports.MODULE__JQUERY_SAP_GLOBAL = "jquery.sap.global.js";
module.exports.MODULE__SAP_UI_CORE_CORE = "sap/ui/core/Core.js";
module.exports.EVO_MARKER_RESOURCE = module.exports.MODULE__UI5LOADER;

module.exports.getRendererName = function( module ) {
	if ( /\.js$/.test(module) ) {
		return module.replace(/\.js$/, "Renderer.js");
	}
};

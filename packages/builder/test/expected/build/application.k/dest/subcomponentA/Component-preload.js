//@ui5-bundle application/k/subcomponentA/Component-preload.js
sap.ui.predefine("application/k/subcomponentA/Component", ["sap/ui/core/UIComponent"], function(UIComponent){
	"use strict";
	return UIComponent.extend('application.k.subcomponentA.Component', {
		metadata: {
			manifest: "json"
		}
	});
});
sap.ui.require.preload({
	"application/k/subcomponentA/manifest.json":'{"_version":"1.1.0","sap.app":{"_version":"1.1.0","id":"application.k.subcomponentA","type":"application","applicationVersion":{"version":"1.2.2"},"embeds":["embedded"],"title":"{{title}}"}}'
});
//# sourceMappingURL=Component-preload.js.map

//@ui5-bundle application/k/Component-preload.js
sap.ui.require.preload({
	"application/k/Component.js":function(){
sap.ui.define(["sap/ui/core/UIComponent"], function(UIComponent){
	"use strict";
	return UIComponent.extend('application.k.Component', {
		metadata: {
			manifest: "json"
		}
	});
});
},
	"application/k/manifest.json":'{"_version":"1.1.0","sap.app":{"_version":"1.1.0","id":"application.k","type":"application","applicationVersion":{"version":"${version}"},"embeds":["embedded"],"title":"{{title}}"},"customCopyrightString":"${copyright}"}'
});
//# sourceMappingURL=Component-preload.js.map

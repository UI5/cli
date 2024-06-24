//@ui5-bundle sap-ui-custom.js
sap.ui.predefine("application/n/Component", ["sap/ui/core/UIComponent","sap/m/Button","application/n/MyModuleRequiringGlobalScope"],(e,t)=>{"use strict";return e.extend("application.n.Component",{metadata:{manifest:"json"},createContent(){return new t({text:magic.text})}})});
sap.ui.require.preload({
	"application/n/manifest.json":'{"_version":"1.21.0","sap.app":{"id":"application.n","type":"application","applicationVersion":{"version":"1.0.0"}},"sap.ui5":{"contentDensities":{"compact":true,"cozy":true},"dependencies":{"minUI5Version":"1.108.0","libs":{"sap.ui.core":{},"sap.m":{}}}}}'
});
//# sourceMappingURL=sap-ui-custom.js.map

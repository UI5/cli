//@ui5-bundle application/m/Component-preload.js
sap.ui.predefine("application/m/Component", ["sap/ui/core/UIComponent","sap/ui/core/mvc/View"],(e,t)=>{"use strict";return e.extend("application.m.Component",{metadata:{manifest:"json",interfaces:["sap.ui.core.IAsyncContentCreation"]},createContent(){return t.create({viewName:"module:application/m/MyView"})}})});

sap.ui.predefine("application/m/MyView", ["sap/ui/core/mvc/View","sap/m/Button"],(t,e)=>{"use strict";return t.extend("application.m.MyView",{async createContent(){return new e({id:this.createId("myButton"),text:"My Button"})}})});
sap.ui.require.preload({
	"application/m/manifest.json":'{"_version":"1.21.0","sap.app":{"id":"application.m","type":"application","applicationVersion":{"version":"1.0.0"}},"sap.ui5":{"contentDensities":{"compact":true,"cozy":true},"dependencies":{"minUI5Version":"1.108.0","libs":{"sap.ui.core":{},"sap.m":{}}}}}'
});
//# sourceMappingURL=Component-preload.js.map

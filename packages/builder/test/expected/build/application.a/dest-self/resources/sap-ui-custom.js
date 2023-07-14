//@ui5-bundle sap-ui-custom.js
sap.ui.require.preload({
	"id1/manifest.json":'{"_version":"1.1.0","sap.app":{"_version":"1.1.0","id":"id1","type":"application","applicationVersion":{"version":"1.2.2"},"embeds":["embedded"],"title":"{{title}}"}}',
	"id1/test.js":function(){
sap.ui.define(["library/d/some"],function(n){function o(n){var o=n;console.log(o)}o()});
},
	"library/d/library.js":function(){
/*
 * Some fancy copyright
 */
sap.ui.define(["sap/ui/core/Lib","sap/ui/core/library"],function(e){"use strict";return e.init({name:"library.d",version:"1.0.0",dependencies:["sap.ui.core"],types:[],interfaces:[],controls:[],elements:[],noLibraryCSS:true})});
},
	"library/d/manifest.json":'{"_version":"1.21.0","sap.app":{"id":"library.d","type":"library","embeds":[],"applicationVersion":{"version":"1.0.0"},"title":"Library D","description":"Library D","resources":"resources.json","offline":true},"sap.ui":{"technology":"UI5","supportedThemes":[]},"sap.ui5":{"dependencies":{"minUI5Version":"1.0","libs":{}},"library":{"i18n":false,"css":false,"content":{"controls":[],"elements":[],"types":[],"interfaces":[]}}}}',
	"library/d/some.js":function(){
/*!
 * Some fancy copyright
 */
sap.ui.define(["./library"],l=>{var o="World";console.log("Hello "+o)});
}
});
//# sourceMappingURL=sap-ui-custom.js.map

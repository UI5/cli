//@ui5-bundle sap-ui-custom.js
sap.ui.predefine("id1/test", ["library/d/some"],function(n){function o(n){var o=n;console.log(o)}o()});
/*
 * Some fancy copyright
 */
sap.ui.predefine("library/d/library", ["sap/ui/core/Lib","sap/ui/core/library"],function(e){"use strict";return e.init({name:"library.d",version:"1.0.0",dependencies:["sap.ui.core"],types:[],interfaces:[],controls:[],elements:[],noLibraryCSS:true})});
/*!
 * Some fancy copyright
 */
sap.ui.predefine("library/d/some", ["./library"],l=>{var o="World";console.log("Hello "+o)});
sap.ui.require.preload({
	"id1/manifest.json":'{"_version":"1.1.0","sap.app":{"_version":"1.1.0","id":"id1","type":"application","applicationVersion":{"version":"1.2.2"},"embeds":["embedded"],"title":"{{title}}"}}'
});
//# sourceMappingURL=sap-ui-custom.js.map

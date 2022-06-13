//@ui5-bundle sap-ui-custom.js
sap.ui.require.preload({
	"id1/manifest.json":'{"_version":"1.1.0","sap.app":{"_version":"1.1.0","id":"id1","type":"application","applicationVersion":{"version":"1.2.2"},"embeds":["embedded"],"title":"{{title}}"}}',
	"id1/test.js":function(){
sap.ui.define(["library/d/some"],function(n){function o(n){var o=n;console.log(o)}o()});
},
	"library/d/some.js":function(){
/*!
 * Some fancy copyright
 */
(function(){var o="World";console.log("Hello "+o)})();
}
});
//# sourceMappingURL=sap-ui-custom.js.map

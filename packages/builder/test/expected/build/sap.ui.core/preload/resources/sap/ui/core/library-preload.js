//@ui5-bundle sap/ui/core/library-preload.js
sap.ui.require.preload({
	"sap/ui/core/one.js":function(){
function One(){return 1}
this.One=One;
},
	"sap/ui/core/some.js":function(){
/*!
 * ${copyright}
 */
console.log("HelloWorld");
},
	"ui5loader.js":function(){
(function(){var o=true;console.log(o)})();
}
});
//# sourceMappingURL=library-preload.js.map

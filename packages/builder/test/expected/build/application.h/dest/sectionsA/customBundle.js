//@ui5-bundle application/h/sectionsA/customBundle.js
sap.ui.require.preload({
	"application/h/sectionsA/section1.js":function(){
sap.ui.define(["sap/m/Button"],function(n){console.log("Section 1 included")});
},
	"application/h/sectionsA/section3.js":function(){
sap.ui.define(["sap/m/Button"],function(n){console.log("Section 3 included")});
}
});
//# sourceMappingURL=customBundle.js.map

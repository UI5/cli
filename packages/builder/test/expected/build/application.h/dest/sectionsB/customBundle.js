//@ui5-bundle application/h/sectionsB/customBundle.js
jQuery.sap.registerPreloadedModules({
"version":"2.0",
"modules":{
	"application/h/sectionsB/section1.js":function(){sap.ui.define(["sap/m/Button"],function(n){console.log("Section 1 included")});
},
	"application/h/sectionsB/section2.js":function(){sap.ui.define(["sap/m/Button"],function(n){console.log("Section 2 included")});
},
	"application/h/sectionsB/section3.js":function(){sap.ui.define(["sap/m/Button"],function(n){console.log("Section 3 included")});
}
}});

jQuery.sap.registerPreloadedModules({
"version":"2.0",
"modules":{
	"application/h/sectionsA/section1.js":function(){sap.ui.define(["sap/m/Button"],function(n){console.log("Section 1 included")});
},
	"application/h/sectionsA/section3.js":function(){sap.ui.define(["sap/m/Button"],function(n){console.log("Section 3 included")});
}
}});

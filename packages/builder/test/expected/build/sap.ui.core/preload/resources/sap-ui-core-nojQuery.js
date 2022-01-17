//@ui5-bundle sap-ui-core-nojQuery.js
window["sap-ui-optimized"] = true;
try {
//@ui5-bundle-raw-include ui5loader-autoconfig.js
(function(){var o=true;console.log(o)})();
//# sourceMappingURL=ui5loader-autoconfig.js.map
sap.ui.require.preload({
	"sap/ui/core/Core.js":function(){(function(){var o=true;console.log(o)})();
//# sourceMappingURL=Core.js.map
}
});
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}

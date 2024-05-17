//@ui5-bundle sap-ui-core.js
window["sap-ui-optimized"] = true;
try {
//@ui5-bundle-raw-include ui5loader-autoconfig.js
(function(){var o=true;console.log(o)})();
sap.ui.require.preload({
	"sap/ui/core/Core.js":function(){
(function(){var o=true;console.log(o)})();
}
});
sap.ui.require(["sap/ui/core/Core"], (Core) => Core.boot?.());
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}
//# sourceMappingURL=sap-ui-core.js.map

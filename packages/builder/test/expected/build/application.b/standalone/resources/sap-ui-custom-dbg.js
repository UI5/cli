//@ui5-bundle sap-ui-custom-dbg.js
//@ui5-bundle-raw-include ui5loader-autoconfig.js
(function () {
	var thisIsTheUi5LoaderAutoconfig = true;
	console.log(thisIsTheUi5LoaderAutoconfig);
})()
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
//# sourceMappingURL=sap-ui-custom-dbg.js.map

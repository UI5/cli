// Feature: issue #512 - local name alias for sap.ui.requireSync
// When sap/ui/core/Core is passed as a factory parameter, the parameter gives access
// to the sap.ui namespace, so alias.requireSync("...") should be detected.
sap.ui.define(["sap/ui/core/Core"], function(ui) {
	var m1 = ui.requireSync("my/module");
	var m2 = ui.requireSync("other/module");
});

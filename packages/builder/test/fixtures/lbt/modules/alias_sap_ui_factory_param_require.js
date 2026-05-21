// Feature: issue #512 - local name alias for sap.ui.require
// When sap/ui/core/Core is passed as a factory parameter, the parameter gives access
// to the sap.ui namespace, so alias.require([...]) should be detected.
sap.ui.define(["sap/ui/core/Core"], function(ui) {
	ui.require(["my/module", "other/module"]);
});

// Feature: issue #512 - top-level variable alias for sap.ui
// When a top-level variable is assigned from sap.ui, calls on that
// variable like alias.require([...]) and alias.requireSync("...") should be detected.
sap.ui.define([], function() {
	var ui = sap.ui;
	ui.require(["my/module"]);
	ui.requireSync("other/module");
});

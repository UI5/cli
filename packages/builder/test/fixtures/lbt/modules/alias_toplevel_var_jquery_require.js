// Feature: issue #512 - top-level variable alias for jQuery
// When a top-level variable is assigned from jQuery (or $), calls on that
// variable like alias.sap.require("...") should be detected.
var jq = jQuery;
jq.sap.declare("sap.ui.testmodule");
jq.sap.require("my.module");
jq.sap.require("other.module");

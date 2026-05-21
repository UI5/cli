// Feature: issue #512 - local name alias for jQuery.sap.declare
// When jquery.sap.global is passed as a factory parameter under a local alias name,
// calls on that alias like alias.sap.declare(...) should be detected.
// Note: this is actually a standalone legacy module using declare, not inside sap.ui.define
// but it receives jQuery under a different local name via top-level aliasing.
var jq = jQuery;
jq.sap.declare("sap.ui.testmodule");
jq.sap.require("my.module");

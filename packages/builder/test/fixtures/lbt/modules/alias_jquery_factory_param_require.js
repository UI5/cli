// Feature: issue #512 - local name alias for jQuery.sap.require
// When jquery.sap.global is passed as a factory parameter under a local alias name,
// calls on that alias like alias.sap.require(...) should be detected as dependencies.
sap.ui.define(["jquery.sap.global"], function(jq) {
	jq.sap.require("my.module");
	jq.sap.require("other.module");
});

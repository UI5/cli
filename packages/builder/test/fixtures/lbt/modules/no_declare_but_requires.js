jQuery.sap.require("dependency1");
jQuery.sap.require("dependency2");
// this module has dependencies, but does not declare a name.
// When such a module is scanned without enough knowledge about the folder structure, the name might be "unknown" (null)
/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper1", ["./dep1","../dep2"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper2", ["./dep1","../dep2"], function() {});

/* amd-multiple-modules-other-than-first-one-unnamed
 * 
 * Multiple modules, the first one unnamed, the others having names that don't match the file name.
 * The unnamed one should be interpreted as the main module, its documentation should be used 
 * as module documentation. 
 * 
 * The dependencies of the different modules contain special AMD dependencies. 
 * They should not be listed in the dependency info. 
 */
sap.ui.define(["./dep1","../dep2"], function() {});

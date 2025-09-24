/* amd-multiple-modules-first-unnamed
 * 
 * Multiple modules, the first one unnamed, the others having names that don't match the file name.
 * The unnamed one should be interpreted as the main module, its documentation should be used 
 * as module documentation.  
 */
sap.ui.define(["./dep1","../dep2"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper1", ["./dep1","../dep2"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper2", ["./dep1","../dep2"], function() {});
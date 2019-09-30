/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper1", ["./dep1","../dep2"], function() {});
/* amd-multiple-named-modules-one-matching-filename
 * 
 * Multiple named modules, the id of one of them matches the default id derived from the file path.
 * That module should be interpreted as the main module, its documentation should be used 
 * as module documentation.  
 */
sap.ui.define("modules/amd_multiple_named_modules_one_matching_filename", ["./dep1","../dep2"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper2", ["./dep1","../dep2"], function() {});
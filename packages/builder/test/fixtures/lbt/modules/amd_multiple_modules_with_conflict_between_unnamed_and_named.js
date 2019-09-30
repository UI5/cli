/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper1", ["./dep1","../dep2"], function() {});
/* amd-multiple-modules-with-conflict-between-unnamed-and-named
 * 
 * Multiple modules, named and unnamed, the id of one of the named modules matches 
 * the default id derived from the file path. An earlier module is unnamed.
 * Analyzing the file must throw an exception because of the conflict between the named
 * and unnamed module.  
 */
sap.ui.define(["./dep1","../dep2"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("modules/amd_multiple_modules_with_conflict_between_unnamed_and_named", ["./dep1","../dep2"], function() {});

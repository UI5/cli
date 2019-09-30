/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper1", ["./dep1","../dep2"], function() {});
/* amd-multiple-modules-with-conflict-between-two-named
 * 
 * Multiple named modules, the id of more than one of them matches 
 * the default id derived from the file path.
 * Analyzing the file must throw an exception because of the conflict between the two named
 * modules.
 */
sap.ui.define("modules/amd_multiple_modules_with_conflict_between_two_named", ["./dep2","../dep1"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("modules/amd_multiple_modules_with_conflict_between_two_named", ["./dep1","../dep2"], function() {});

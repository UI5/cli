/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper1", ["./dep1","../dep2", "exports"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper2", ["require", "./dep1","../dep2"], function() {});

/* amd-special-dependencies
 * 
 * When the dependencies contain one or more of the AMD special dependencies, 
 * they should be ignored and not be listed in the dependency info. 
 */
sap.ui.define(["./dep1","../dep2", "module"], function() {});
/*
 * irrelevant documentation
 */
sap.ui.define("utils/helper3", ["require", "exports", "module"], function() {});


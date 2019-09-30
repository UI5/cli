/* 
 * A file with multiple unnamed modules should cause an exception when being analyzed.
 * The exception should indicate that only one module can omit the name, the others must be named.  
 */
sap.ui.define(["./dep1","../dep2"], function() {});
sap.ui.define("utils/helper1",["./dep1","../dep2"], function() {});
sap.ui.define(["./dep1","../dep2"], function() {});
sap.ui.define("utils/helper2",["./dep1","../dep2"], function() {});

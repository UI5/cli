//uses a function invocation expr to create a scope
(function($2, window){
	
	//declares module sap.ui.testmodule
	jQuery.sap.declare("sap.ui.testmodule");
	
	// top level statements in the scope 
	jQuery.sap.require("top.require.void");
	var x = jQuery.sap.require("top.require.var");
	x = jQuery.sap.require("top.require.assign");
	var xs = sap.ui.requireSync("top/requireSync/var");
	xs = sap.ui.requireSync("top/requireSync/assign");

	// a block with require statements
	{ 
		jQuery.sap.require("block.require.void");
		var z = jQuery.sap.require("block.require.var");
		z = jQuery.sap.require("block.require.assign");
		var zs = sap.ui.requireSync("block/requireSync/var");
		zs = sap.ui.requireSync("block/requireSync/assign");
	}

	// a nested function invocation with require statements
	(function() { 
		jQuery.sap.require("nested.scope.require.void");
		var z = jQuery.sap.require("nested.scope.require.var");
		z = jQuery.sap.require("nested.scope.require.assign");
		var zs = sap.ui.requireSync("nested/scope/requireSync/var");
		zs = sap.ui.requireSync("nested/scope/requireSync/assign");
	}());

	//a nested function expression with require statements
	(function() { 
		jQuery.sap.require("nested.scope2.require.void");
		var z = jQuery.sap.require("nested.scope2.require.var");
		z = jQuery.sap.require("nested.scope2.require.assign");
		var zs = sap.ui.requireSync("nested/scope2/requireSync/var");
		zs = sap.ui.requireSync("nested/scope2/requireSync/assign");
	})();
	
}(jQuery, this));

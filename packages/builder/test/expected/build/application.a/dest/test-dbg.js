sap.ui.define([
    "library/d/some"
], function(someObject) {
	function test(paramA) {
		var variableA = paramA;
		console.log(variableA);
	}
	test();
});

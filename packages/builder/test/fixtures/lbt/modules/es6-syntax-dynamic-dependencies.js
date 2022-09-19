sap.ui.define([
	'static/module1'
], () => {
	// spread expression, currently not detected as dependency
	const dynamicModules = ["not-detected/module1"];
	sap.ui.require(["static/module1", ...dynamicModules]);
});

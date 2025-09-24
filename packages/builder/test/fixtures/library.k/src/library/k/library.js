/*!
 * Some fancy copyright
 */
sap.ui.define([
	'sap/ui/core/Core',
], function(Core) {

	"use strict";

	sap.ui.getCore().initLibrary({
		name : "library.k",
		version: "1.0.0",
		dependencies : [],
		types: [
			"library.k.AnyType"
		],
		interfaces: [
			"library.k.IAny"
		],
		controls: [
			"library.k.AnyControl"
		],
		elements: [
			"library.k.AnyElement"
		],
	});

	return thisLib;

});

/*!
 * ${copyright}
 */
sap.ui.define([
	'sap/ui/core/Core',
], function(Core) {

	"use strict";

	sap.ui.getCore().initLibrary({
		name : "library.i",
		version: "${version}",
		dependencies : ["sap.ui.core"],
		types: [
			"library.i.ButtonType",
			"library.i.DialogType",
		],
		interfaces: [
			"library.i.IContent",
		],
		controls: [
			"library.i.Button",
			"library.i.CheckBox",
			"library.i.Dialog",
			"library.i.Input",
			"library.i.Label",
			"library.i.Link",
			"library.i.Menu",
			"library.i.Text"
		],
		elements: [
			"library.i.MenuItem"
		],
	});

	return thisLib;

});

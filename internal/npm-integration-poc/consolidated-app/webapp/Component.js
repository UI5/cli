sap.ui.define([
	"sap/ui/core/UIComponent"
], function(UIComponent) {
	"use strict";

	return UIComponent.extend("com.example.app.Component", {
		metadata: {
			manifest: "json"
		},

		init: function() {
			// Call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);
		}
	});
});

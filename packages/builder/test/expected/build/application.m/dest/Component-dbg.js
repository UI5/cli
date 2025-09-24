sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/core/mvc/View"], (UIComponent, View) => {
	"use strict";
	return UIComponent.extend("application.m.Component", {
		metadata: {
			manifest: "json",
			interfaces: [
				"sap.ui.core.IAsyncContentCreation"
			]
		},
		createContent() {
			return View.create({
				viewName: "module:application/m/MyView"
			})
		}
	});
});

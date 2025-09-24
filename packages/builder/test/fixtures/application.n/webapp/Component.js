sap.ui.define(["sap/ui/core/UIComponent", "sap/m/Button", "application/n/MyModuleRequiringGlobalScope"], (UIComponent, Button) => {
	"use strict";
	return UIComponent.extend("application.n.Component", {
		metadata: {
			manifest: "json"
		},
		createContent() {
			return new Button({text: magic.text});
		}
	});
});

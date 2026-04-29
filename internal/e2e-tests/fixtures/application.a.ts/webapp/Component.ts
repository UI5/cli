// Modified version of SAP-samples/ui5-typescript-tutorial
// (https://github.com/SAP-samples/ui5-typescript-tutorial/blob/215be77bd786797884f010cd5f4a3341af91152b/exercises/ex4/com.myorg.myapp/webapp/Component.ts)

import UIComponent from "sap/ui/core/UIComponent";
import models from "./model/models";

export default class Component extends UIComponent {
	public static metadata = {
		manifest: "json",
	};

	public init(): void {
		// call the base component's init function
		super.init();

		// create the device model
		this.setModel(models.createDeviceModel(), "device");

		// create the views based on the url/hash
		this.getRouter().initialize();
	}
}

//@ui5-bundle library/h/components/Component-preload.js
sap.ui.predefine("library/h/components/Component", ["sap/ui/core/UIComponent"], function(UIComponent){
	"use strict";
	return UIComponent.extend('application.g.Component', {
	});
});
sap.ui.require.preload({
	"library/h/components/TodoComponent.js":function(){
/*!
 * Some fancy copyright
 */
console.log(' File ');
}
});
//# sourceMappingURL=Component-preload.js.map

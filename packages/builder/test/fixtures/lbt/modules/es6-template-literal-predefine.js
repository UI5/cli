// template literal as module name
sap.ui.predefine(`mypath/mymodule`, [`static/module1`, "static/module2" ], () => {
		return sap.ui.require([`static/module3`], () => { }); 	// template literal when loading module
});

// template literal as module name
sap.ui.define(`mypath/mymodule`, [`static/module1`, "static/module2" ], () => {
		const i = 4;
		return sap.ui.require([
			`static/module3`,
			`not-detected/module${i}` // template literal with expression when loading module, not detected by the JSModuleAnalayzer
		], () => { });
});

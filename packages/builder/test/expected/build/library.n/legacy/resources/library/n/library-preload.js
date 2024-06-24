//@ui5-bundle library/n/library-preload.js
/*!
 * ${copyright}
 */
sap.ui.predefine("library/n/Some", [], () => {
	const some = {text: "Just a module."};
	return some;
})
sap.ui.require.preload({
	"library/n/MyModuleRequiringGlobalScope.js":'const magic = {text: "It\'s magic!"};\n'
});
//# sourceMappingURL=library-preload.js.map

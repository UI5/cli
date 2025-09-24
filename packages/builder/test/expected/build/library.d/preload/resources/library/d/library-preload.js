//@ui5-bundle library/d/library-preload.js
/*
 * ${copyright}
 */

sap.ui.predefine("library/d/library", [
	"sap/ui/core/Lib",
	"sap/ui/core/library"
], function (Library) {
	"use strict";

	return Library.init({
		name: "library.d",
		version: "${version}",
		dependencies: [
			"sap.ui.core"
		],
		types: [],
		interfaces: [],
		controls: [],
		elements: [],
		noLibraryCSS: true
	});
});
/*!
 * ${copyright}
 */

sap.ui.predefine("library/d/some", ["./library"], (_library) => {
	var someNonUglifiedVariable = "World";
	console.log('Hello ' + someNonUglifiedVariable);
});
sap.ui.require.preload({
	"library/d/empty.js":function(){
/*!
 * ${copyright}
 */
},
	"library/d/legacy.js":'/*!\n * ${copyright}\n */\nvar topLevelVar = "Old World";\nconsole.log(\'Hello \' + topLevelVar);\n'
});
//# sourceMappingURL=library-preload.js.map

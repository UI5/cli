//@ui5-bundle library/d/library-preload.js
sap.ui.require.preload({
	"library/d/legacy.js":'/*!\n * ${copyright}\n */\nvar topLevelVar = "Old World";\nconsole.log(\'Hello \' + topLevelVar);\n',
	"library/d/some.js":function(){
/*!
 * ${copyright}
 */
(function() {
	var someNonUglifiedVariable = "World";
	console.log('Hello ' + someNonUglifiedVariable);
})();
}
});
//# sourceMappingURL=library-preload.js.map

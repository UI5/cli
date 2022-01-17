//@ui5-bundle library/h/customBundle.js
sap.ui.require.preload({
	"library/h/file.js":function(){/*!
 * Some fancy copyright
 */
console.log(" File ");
//# sourceMappingURL=file.js.map
},
	"library/h/library.js":function(){/*!
 * Some fancy copyright
 */
console.log(" Library ");
//# sourceMappingURL=library.js.map
},
	"library/h/some.js":function(){/*!
 * Some fancy copyright
 */
//@ui5-bundle-raw-include library/h/other.js
console.log(" Some ");
//# sourceMappingURL=some.js.map
}
});
//@ui5-bundle-raw-include library/h/not.js
/*!
 * Some fancy copyright
 */
console.log(" Not including ");
//# sourceMappingURL=not.js.map
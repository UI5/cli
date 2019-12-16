//@ui5-bundle sap-ui-custom.js
sap.ui.require.preload({
	"application/a/test.js":function(){sap.ui.define(["library/d/some"],function(n){function o(n){var o=n;console.log(o)}o()});
},
	"library/d/some.js":function(){/*!
 * Some fancy copyright
 */
(function(){var o="World";console.log("Hello "+o)})();
}
});

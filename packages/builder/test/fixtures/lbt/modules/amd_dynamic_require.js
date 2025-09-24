sap.ui.define([], function() {
	return {
		load: function(modName) {
			sap.ui.require([modName], function(modExport) {
				// module was loaded
			}, function(err) {
				// error occurred
			});
		}
	}
});
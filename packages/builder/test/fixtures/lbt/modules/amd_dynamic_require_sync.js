sap.ui.define([], function() {
	return {
		load: function(modName) {
			return sap.ui.requireSync(modName);
		}
	}
});

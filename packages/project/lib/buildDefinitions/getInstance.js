
function createInstance(moduleName, params) {
	const BuildDefinition = require(`./${moduleName}`);
	return new BuildDefinition(params);
}

/**
 * Get build definition instance
 *
 * @param {object} parameters
 * @param {object} parameters.graph
 * @param {object} parameters.project
 * @param {object} parameters.taskUtil
 * @param {GroupLogger} parameters.parentLogger Logger to use
 */
module.exports = function(parameters) {
	switch (parameters.project.getType()) {
	case "application":
		return createInstance("ApplicationBuilder", parameters);
	case "library":
		return createInstance("LibraryBuilder", parameters);
	case "module":
		return createInstance("ModuleBuilder", parameters);
	case "theme-library":
		return createInstance("ThemeLibraryBuilder", parameters);
	}
};

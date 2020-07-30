const ModuleFormatter = require("./ModuleFormatter");
const ModuleBuilder = require("./ModuleBuilder");

module.exports = {
	format: function(project) {
		return new ModuleFormatter({project}).format();
	},
	build: function({resourceCollections, tasks, project, parentLogger, taskUtil}) {
		return new ModuleBuilder({resourceCollections, project, parentLogger, taskUtil}).build(tasks);
	},

	// Export type classes for extensibility
	Builder: ModuleBuilder,
	Formatter: ModuleFormatter
};

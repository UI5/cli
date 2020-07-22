const ThemeLibraryFormatter = require("./ThemeLibraryFormatter");
const ThemeLibraryBuilder = require("./ThemeLibraryBuilder");

module.exports = {
	format: function(project) {
		return new ThemeLibraryFormatter({project}).format();
	},
	build: function({resourceCollections, tasks, project, parentLogger, taskUtil}) {
		return new ThemeLibraryBuilder({resourceCollections, project, parentLogger, taskUtil}).build(tasks);
	},

	// Export type classes for extensibility
	Builder: ThemeLibraryBuilder,
	Formatter: ThemeLibraryFormatter
};

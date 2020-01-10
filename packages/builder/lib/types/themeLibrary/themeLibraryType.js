const ThemeLibraryFormatter = require("./ThemeLibraryFormatter");
const ThemeLibraryBuilder = require("./ThemeLibraryBuilder");

module.exports = {
	format: function(project) {
		return new ThemeLibraryFormatter({project}).format();
	},
	build: function({resourceCollections, tasks, project, parentLogger, buildContext}) {
		return new ThemeLibraryBuilder({resourceCollections, project, parentLogger, buildContext}).build(tasks);
	},

	// Export type classes for extensibility
	Builder: ThemeLibraryBuilder,
	Formatter: ThemeLibraryFormatter
};

const LibraryFormatter = require("./LibraryFormatter");
const LibraryBuilder = require("./LibraryBuilder");

module.exports = {
	format: function(project) {
		return new LibraryFormatter().format(project);
	},
	build: function({resourceCollections, tasks, project, parentLogger}) {
		return new LibraryBuilder({resourceCollections, project, parentLogger}).build(tasks);
	},

	// Export type classes for extensibility
	Builder: LibraryBuilder,
	Formatter: LibraryFormatter
};

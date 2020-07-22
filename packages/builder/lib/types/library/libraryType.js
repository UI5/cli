const LibraryFormatter = require("./LibraryFormatter");
const LibraryBuilder = require("./LibraryBuilder");

module.exports = {
	format: function(project) {
		return new LibraryFormatter({project}).format();
	},
	build: function({resourceCollections, tasks, project, parentLogger, taskUtil}) {
		return new LibraryBuilder({resourceCollections, project, parentLogger, taskUtil}).build(tasks);
	},

	// Export type classes for extensibility
	Builder: LibraryBuilder,
	Formatter: LibraryFormatter
};

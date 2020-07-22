const ApplicationFormatter = require("./ApplicationFormatter");
const ApplicationBuilder = require("./ApplicationBuilder");

module.exports = {
	format: function(project) {
		return new ApplicationFormatter({project}).format();
	},
	build: function({resourceCollections, tasks, project, parentLogger, taskUtil}) {
		return new ApplicationBuilder({resourceCollections, project, parentLogger, taskUtil}).build(tasks);
	},

	// Export type classes for extensibility
	Builder: ApplicationBuilder,
	Formatter: ApplicationFormatter
};

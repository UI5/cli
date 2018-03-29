const ApplicationFormatter = require("./ApplicationFormatter");
const ApplicationBuilder = require("./ApplicationBuilder");

module.exports = {
	format: function(project) {
		return new ApplicationFormatter().format(project);
	},
	build: function({resourceCollections, tasks, project, parentLogger}) {
		return new ApplicationBuilder({resourceCollections, project, parentLogger}).build(tasks);
	},

	// Export type classes for extensibility
	Builder: ApplicationBuilder,
	Formatter: ApplicationFormatter
};

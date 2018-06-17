const AbstractBuilder = require("../AbstractBuilder");

class ModuleBuilder extends AbstractBuilder {
	constructor({resourceCollections, project, parentLogger}) {
		super({project, parentLogger});

		// All available library tasks in execution order
		this.availableTasks = [];
	}
}

module.exports = ModuleBuilder;

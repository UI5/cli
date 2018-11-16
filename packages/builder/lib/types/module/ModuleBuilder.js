const AbstractBuilder = require("../AbstractBuilder");

class ModuleBuilder extends AbstractBuilder {
	constructor({resourceCollections, project, parentLogger}) {
		super({resourceCollections, project, parentLogger});
	}

	addStandardTasks() {/* nothing to do*/}
}

module.exports = ModuleBuilder;

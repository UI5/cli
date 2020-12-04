const Specification = require("./Specification");

class Extension extends Specification {
	constructor(parameters) {
		super(parameters);
		if (new.target === Extension) {
			throw new TypeError("Class 'Project' is abstract. Please use one of the 'types' subclasses");
		}
	}

	/*
	* TODO
	*/
}

module.exports = Extension;

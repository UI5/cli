const applicationType = require("./application/applicationType");
const libraryType = require("./library/libraryType");

let types = {
	application: applicationType,
	library: libraryType
};

function getType(typeName) {
	let type = types[typeName];

	if (!type) {
		throw new Error("Unkown type '" + typeName + "'");
	}
	return type;
}

function addType(name, type) {
	if (types[name]) {
		throw new Error("Type already registered '" + name + "'");
	}
	types[name] = type;
}

module.exports = {
	getType: getType,
	addType: addType
};

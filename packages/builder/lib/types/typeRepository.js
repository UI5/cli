const applicationType = require("./application/applicationType");
const libraryType = require("./library/libraryType");
const themeLibraryType = require("./themeLibrary/themeLibraryType");
const moduleType = require("./module/moduleType");

const types = {
	"application": applicationType,
	"library": libraryType,
	"theme-library": themeLibraryType,
	"module": moduleType
};

/**
 * Gets a type
 *
 * @param {string} typeName unique identifier for the type
 * @returns {object} type identified by name
 * @throws {Error} if not found
 */
function getType(typeName) {
	const type = types[typeName];

	if (!type) {
		throw new Error("Unknown type '" + typeName + "'");
	}
	return type;
}

/**
 * Adds a type
 *
 * @param {string} typeName unique identifier for the type
 * @param {object} type
 * @throws {Error} if duplicate with same name was found
 */
function addType(typeName, type) {
	if (types[typeName]) {
		throw new Error("Type already registered '" + typeName + "'");
	}
	types[typeName] = type;
}

module.exports = {
	getType: getType,
	addType: addType
};

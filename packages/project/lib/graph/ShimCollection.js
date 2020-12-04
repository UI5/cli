const log = require("@ui5/logger").getLogger("graph:ShimCollection");

function addToMap(name, fromMap, toMap) {
	for (const [moduleId, shim] of Object.entries(fromMap)) {
		if (!toMap[moduleId]) {
			toMap[moduleId] = [];
		}
		toMap[moduleId].push({
			name,
			shim
		});
	}
}

class ShimCollection {
	constructor() {
		this._projectConfigShims = {};
		this._dependencyShims = {};
		this._collectionShims = {};
	}

	addProjectShim(shimExtension) {
		const name = shimExtension.getName();
		log.verbose(`Adding new shim ${name}...`);

		const configurations = shimExtension.getConfigurationShims();
		if (configurations) {
			addToMap(name, configurations, this._projectConfigShims);
		}
		const dependencies = shimExtension.getDependencyShims();
		if (dependencies) {
			addToMap(name, dependencies, this._dependencyShims);
		}
		const collections = shimExtension.getCollectionShims();
		if (collections) {
			addToMap(name, collections, this._collectionShims);
		}
	}

	getProjectConfigurationShims(moduleId) {
		return this._projectConfigShims[moduleId];
	}

	getAllDependencyShims() {
		return this._dependencyShims;
	}

	getCollectionShims(moduleId) {
		return this._collectionShims[moduleId];
	}
}

module.exports = ShimCollection;

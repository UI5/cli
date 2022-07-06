const log = require("@ui5/logger").getLogger("graph:ShimCollection");

function addToMap(name, fromMap, toMap) {
	/* Dynamically populate the given map "toMap" with the following structure:
		<module-id>: [{
			name: <shim-name>,
			shim: <shim-configuration>
		}, {
			name: <shim-name>,
			shim: <shim-configuration>
		}, ...]
	*/
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

	getCollectionShims(moduleId) {
		return this._collectionShims[moduleId];
	}

	getAllDependencyShims() {
		return this._dependencyShims;
	}
}

module.exports = ShimCollection;

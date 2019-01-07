const resourceFactory = require("@ui5/fs").resourceFactory;

/**
 * Creates sap-ui-version.json.
 *
 * @public
 * @module @ui5/builder/processors/versionInfoGenerator
 * @param {Object} parameters Parameters
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.rootProjectName Name of the root project
 * @param {string} parameters.options.rootProjectVersion Version of the root project
 * @param {Array} parameters.options.libraryInfos Array of objects representing libraries, e.g. <code>{name: "library.xy", version: "1.0.0"}</code>
 * @returns {Promise<Resource[]>} Promise resolving with an array containing the versioninfo resource
 */

module.exports = async function({options}) {
	if (!options.rootProjectName || options.rootProjectVersion === undefined || options.libraryInfos === undefined) {
		throw new Error("[versionInfoGenerator]: Missing options parameters");
	}

	const buildTimestamp = new Date().getTime();
	const versionJson = {
		name: options.rootProjectName,
		version: options.rootProjectVersion, // TODO: insert current application version here
		buildTimestamp: buildTimestamp,
		scmRevision: "", // TODO: insert current application scm revision here
		// gav: "", // TODO: insert current application id + version here
		libraries: options.libraryInfos.map(function(libraryInfo) {
			return {
				name: libraryInfo.name,
				version: libraryInfo.version,
				buildTimestamp: buildTimestamp,
				scmRevision: "" // TODO: insert current library scm revision here
			};
		})
	};

	return [resourceFactory.createResource({
		path: "/resources/sap-ui-version.json",
		string: JSON.stringify(versionJson, null, "\t")
	})];
};

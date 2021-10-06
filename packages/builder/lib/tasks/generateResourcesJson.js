"use strict";

const resourceListCreator = require("../processors/resourceListCreator");

const DEFAULT_EXCLUDES = [
	/*
	 * exclude mac metadata files
	 */
	"!**/.DS_Store",
	/*
	 * sap-ui-version.json is not part of the resources
	 */
	"!/resources/sap-ui-version.json"
];

function getCreatorOptions(projectName) {
	const creatorOptions = {};
	// TODO: Move configuration into ui5.yaml
	if ( projectName === "sap.ui.core" ) {
		Object.assign(creatorOptions, {
			externalResources: {
				"sap/ui/core": [
					"*",
					"sap/base/",
					"sap/ui/"
				]
			}
		});
	} else if ( projectName === "sap.ui.integration" ) {
		Object.assign(creatorOptions, {
			externalResources: {
				"sap/ui/integration": [
					"sap-ui-integration*.js",
				]
			}
		});
	}
	return creatorOptions;
}

/**
 * Task for creating a resources.json file, describing all productive build resources.
 *
 * <p>
 * The detailed structure can be found in the documentation:
 * {@link https://openui5.hana.ondemand.com/#topic/adcbcf8b50924556ab3f321fcd9353ea}
 * </p>
 *
 * <p>
 * Not supported in combination with task {@link module:@ui5/builder.tasks.generateStandaloneAppBundle}.
 * Therefore it is also not supported in combination with self-contained build.
 * </p>
 *
 * @example <caption>sample resources.json</caption>
 * const resourcesJson = {
 * 	"_version": "1.1.0",
 * 	"resources": [
 * 		{
 * 			"name": "Component-preload.js",
 * 			"module": "application/mine/Component-preload.js",
 * 			"size": 3746,
 * 			"merged": true,
 * 			"included": [
 * 				"application/mine/Component.js",
 * 				"application/mine/changes/coding/MyExtension.js",
 * 				"application/mine/changes/flexibility-bundle.json",
 * 				"application/mine/changes/fragments/MyFragment.fragment.xml",
 * 				"application/mine/manifest.json"
 * 			]
 * 		},
 * 		{
 * 			"name": "resources.json",
 * 			"size": 1870
 * 		},
 * 		{
 * 			"name": "rules/Button-dbg.support.js",
 * 			"module": "application/mine/rules/Button.support.js",
 * 			"size": 211,
 * 			"format": "raw",
 * 			"isDebug": true,
 * 			"required": [
 * 				"application/mine/library.js",
 * 				"sap/ui/core/Control.js"
 * 			],
 * 			"condRequired": [
 * 				"application/mine/changeHandler/SplitButton.js",
 * 				"sap/ui/core/format/DateFormat.js"
 * 			],
 * 			"dynRequired": true,
 * 			"support": true
 * 		}
 * 	]
 * };
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateResourcesJson
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} [parameters.dependencies] Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, dependencies, options: {projectName}}) {
	const resources = await workspace.byGlob(["/resources/**/*"].concat(DEFAULT_EXCLUDES));

	// TODO 3.0: Make dependencies parameter mandatory
	let dependencyResources;
	if (dependencies) {
		dependencyResources =
			await dependencies.byGlob("/resources/**/*.{js,json,xml,html,properties,library}");
	}

	const resourceLists = await resourceListCreator({
		resources,
		dependencyResources,
		options: getCreatorOptions(projectName),
	});
	await Promise.all(
		resourceLists.map((resourceList) => workspace.write(resourceList))
	);
};

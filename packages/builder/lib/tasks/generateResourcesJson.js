
import resourceListCreator from "../processors/resourceListCreator.js";

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
 * @public
 * @module @ui5/builder/tasks/generateResourcesJson
 */

/**
 * Task for creating a resources.json file, describing all productive build resources.
 *
 * <p>
 * The detailed structure can be found in the documentation:
 * {@link https://sdk.openui5.org/topic/adcbcf8b50924556ab3f321fcd9353ea}
 * </p>
 *
 * <p>
 * Not supported in combination with task {@link @ui5/builder/tasks/bundlers/generateStandaloneAppBundle}.
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
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/fs/AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, dependencies, taskUtil, options: {projectName}}) {
	let resources = await workspace.byGlob(["/resources/**/*"].concat(DEFAULT_EXCLUDES));
	let dependencyResources =
			await dependencies.byGlob("/resources/**/*.{js,json,xml,html,properties,library,js.map}");

	if (taskUtil) {
		// Filter out resources that will be omitted from the build results
		resources = resources.filter((resource) => {
			return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
		});
		dependencyResources = dependencyResources.filter((resource) => {
			return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
		});
	}

	const resourceLists = await resourceListCreator({
		resources,
		dependencyResources,
		options: getCreatorOptions(projectName),
	});
	await Promise.all(
		resourceLists.map((resourceList) => workspace.write(resourceList))
	);
}

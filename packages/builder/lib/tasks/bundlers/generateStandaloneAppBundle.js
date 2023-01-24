import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:bundlers:generateStandaloneAppBundle");
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import moduleBundler from "../../processors/bundlers/moduleBundler.js";
import createModuleNameMapping from "./utils/createModuleNameMapping.js";

function getBundleDefinition(config) {
	const bundleDefinition = {
		name: config.name,
		defaultFileTypes: [
			".js",
			".control.xml",
			".fragment.html",
			".fragment.json",
			".fragment.xml",
			".view.html",
			".view.json",
			".view.xml",
			".properties"
		],
		sections: []
	};

	// add raw section
	bundleDefinition.sections.push({
		// include all 'raw' modules that are needed for the UI5 loader
		mode: "raw",
		filters: config.filters,
		resolve: true, // dependencies for raw modules are taken from shims in .library files
		sort: true, // topological sort on raw modules is mandatory
		declareModules: false
	});

	// preload section is only relevant for sap-ui-custom.js
	if (config.preloadSection) {
		bundleDefinition.sections.push({
			mode: "preload",
			filters: [
				`${config.namespace || ""}/`,
				`${config.namespace || ""}/**/manifest.json`,
				`${config.namespace || ""}/changes/changes-bundle.json`,
				`${config.namespace || ""}/changes/flexibility-bundle.json`,
				`!${config.namespace || ""}/test/`,
				"sap/ui/core/Core.js"
			],
			resolve: true,
			resolveConditional: true,
			renderer: true
		});
	}

	bundleDefinition.sections.push({
		mode: "require",
		filters: [
			"sap/ui/core/Core.js"
		]
	});

	return bundleDefinition;
}

/**
 * @public
 * @module @ui5/builder/tasks/bundlers/generateStandaloneAppBundle
 */

/* eslint "jsdoc/check-param-names": ["error", {"disableExtraPropertyReporting":true}] */
/**
 * Task for bundling standalone applications.
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
 * @param {string} [parameters.options.projectNamespace] Project namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, dependencies, taskUtil, options}) {
	const {projectName} = options;
	// Backward compatibility: "namespace" option got renamed to "projectNamespace"
	const namespace = options.projectNamespace || options.namespace;

	if (!namespace) {
		log.warn(`Namespace of project ${projectName} is not known. Self contained bundling is currently ` +
			`unable to generate complete bundles for such projects.`);
	}

	const combo = new ReaderCollectionPrioritized({
		name: `generateStandaloneAppBundle - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	let resourceReader = combo;
	if (taskUtil) {
		// Omit -dbg files
		resourceReader = await taskUtil.resourceFactory.createFilterReader({
			reader: combo,
			callback: function(resource) {
				return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant);
			}
		});
	}
	const resources = await resourceReader.byGlob("/resources/**/*.{js,json,xml,html,properties,library,js.map}");

	const isEvo = resources.find((resource) => {
		return resource.getPath() === "/resources/ui5loader.js";
	});
	let filters;
	if (isEvo) {
		filters = ["ui5loader-autoconfig.js"];
	} else {
		filters = ["jquery.sap.global.js"];
	}

	let unoptimizedModuleNameMapping;
	let unoptimizedResources = resources;
	if (taskUtil) {
		const unoptimizedResourceReader = await taskUtil.resourceFactory.createFilterReader({
			reader: combo,
			callback: function(resource) {
				// Remove any non-debug variants
				return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.HasDebugVariant);
			}
		});

		unoptimizedResources = await unoptimizedResourceReader
			.byGlob("/resources/**/*.{js,json,xml,html,properties,library,js.map}");

		unoptimizedModuleNameMapping = createModuleNameMapping({
			resources: unoptimizedResources,
			taskUtil
		});
	}

	await Promise.all([
		moduleBundler({
			resources,
			options: {
				bundleDefinition: getBundleDefinition({
					name: "sap-ui-custom.js",
					filters,
					namespace,
					preloadSection: true
				})
			}
		}),
		moduleBundler({
			resources: unoptimizedResources,
			options: {
				bundleDefinition: getBundleDefinition({
					name: "sap-ui-custom-dbg.js",
					filters,
					namespace
				}),
				bundleOptions: {
					optimize: false
				},
				moduleNameMapping: unoptimizedModuleNameMapping
			}
		})
	]).then((results) => {
		const bundles = Array.prototype.concat.apply([], results);
		return Promise.all(bundles.map(({bundle, sourceMap}) => {
			if (taskUtil) {
				taskUtil.setTag(bundle, taskUtil.STANDARD_TAGS.IsBundle);
				if (sourceMap) {
					// Clear tag that might have been set by the minify task, in cases where
					// the bundle name is identical to a source file
					taskUtil.clearTag(sourceMap, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
				}
			}
			const writes = [workspace.write(bundle)];
			if (sourceMap) {
				writes.push(workspace.write(sourceMap));
			}
			return Promise.all(writes);
		}));
	});
}

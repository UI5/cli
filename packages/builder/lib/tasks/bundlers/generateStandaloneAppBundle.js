const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateStandaloneAppBundle");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;
const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ModuleName = require("../../lbt/utils/ModuleName");

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
 * Task for bundling standalone applications.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateStandaloneAppBundle
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {module:@ui5/builder.tasks.TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} [parameters.options.namespace] Project namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, dependencies, taskUtil, options: {projectName, namespace}}) {
	if (!namespace) {
		log.warn(`Namespace of project ${projectName} is not known. Self contained bundling is currently ` +
			`unable to generate complete bundles for such projects.`);
	}

	let combo = new ReaderCollectionPrioritized({
		name: `generateStandaloneAppBundle - prioritize workspace over dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	if (taskUtil) {
		// Omit -dbg files
		combo = combo.filter(function(resource) {
			return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant);
		});
	}
	const resources = await combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library,js.map}");

	const isEvo = resources.find((resource) => {
		return resource.getPath() === "/resources/ui5loader.js";
	});
	let filters;
	if (isEvo) {
		filters = ["ui5loader-autoconfig.js"];
	} else {
		filters = ["jquery.sap.global.js"];
	}

	const unoptimizedModuleNameMapping = {};
	let unoptimizedResources = resources;
	if (taskUtil) {
		unoptimizedResources = await new ReaderCollectionPrioritized({
			name: `generateStandaloneAppBundle - prioritize workspace over dependencies: ${projectName}`,
			readers: [workspace, dependencies]
		}).filter(function(resource) {
			// Remove any non-debug variants
			return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.HasDebugVariant);
		}).byGlob("/resources/**/*.{js,json,xml,html,properties,library,js.map}");

		// For "unoptimized" bundles, the non-debug files have already been filtered out above.
		// Now we need to create a mapping from the debug-variant resource path to the respective module name,
		// which is basically the non-debug resource path, minus the "/resources/"" prefix.
		// This mapping overwrites internal logic of the LocatorResourcePool which would otherwise determine
		// the module name from the resource path, which would contain "-dbg" in this case. That would be
		// incorrect since debug-variants should still keep the original module name.
		for (let i = unoptimizedResources.length - 1; i >= 0; i--) {
			const resourcePath = unoptimizedResources[i].getPath();
			if (taskUtil.getTag(resourcePath, taskUtil.STANDARD_TAGS.IsDebugVariant)) {
				const nonDbgPath = ModuleName.getNonDebugName(resourcePath);
				if (!nonDbgPath) {
					throw new Error(`Failed to resolve non-debug name for ${resourcePath}`);
				}
				unoptimizedModuleNameMapping[resourcePath] = nonDbgPath.slice("/resources/".length);
			}
		}
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
};

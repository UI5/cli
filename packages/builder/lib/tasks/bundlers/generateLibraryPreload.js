const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateLibraryPreload");
const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

function getBundleDefinition(namespace) {
	// TODO: move to config of actual core project
	if (namespace === "sap/ui/core") {
		return {
			name: `${namespace}/library-preload.js`,
			defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
			sections: [
				{
					mode: "preload",
					filters: [
						`${namespace}/`,
						`!${namespace}/.library`,
						`!${namespace}/themes/`,
						`!${namespace}/cldr/`,
						`!${namespace}/messagebundle*`,

						"*.js",
						"sap/ui/base/",
						"sap/ui/model/",
						"sap/ui/xml/",
						"sap/ui/Global.js",

						// files are already part of sap-ui-core.js
						"!sap/ui/thirdparty/es6-promise.js",
						"!jquery.sap.global.js",
						"!ui5loader-autoconfig.js",
						"!ui5loader.js",
						"!ui5loader-amd.js",
						"!sap-ui-*.js"
					],
					resolve: false,
					resolveConditional: false,
					renderer: true
				}
			]
		};
	}
	return {
		name: `${namespace}/library-preload.js`,
		defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
		sections: [
			{
				mode: "preload",
				filters: [
					`${namespace}/`,
					`!${namespace}/.library`,
					`!${namespace}/themes/`,
					`!${namespace}/messagebundle*`
				],
				resolve: false,
				resolveConditional: false,
				renderer: true
			}
		]
	};
}

/**
 * Task for library bundling.
 *
 * @module builder/tasks/bundlers/generateLibraryPreload
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	const combo = new ReaderCollectionPrioritized({
		name: `libraryBundler - prioritize workspace over dependencies: ${options.projectName}`,
		readers: [workspace, dependencies]
	});
	return combo.byGlob("/**/*.{js,json,xml,html,properties,library}").then((resources) => {
		// Find all libraries and create a library-preload.js bundle

		let p;

		// Create sap-ui-core.js
		// TODO: move to config of actual core project
		if (options.projectName === "sap.ui.core") {
			// Filter out sap-ui-core.js from further uglification/replacement processors
			//	to prevent them from overwriting it
			resources = resources.filter((resource) => {
				return resource.getPath() !== "/resources/sap-ui-core.js";
			});

			const isEvo = resources.find((resource) => {
				return resource.getPath() === "/resources/ui5loader.js";
			});
			let filters;
			if (isEvo) {
				filters = ["ui5loader-autoconfig.js"];
			} else {
				filters = ["jquery.sap.global.js"];
			}

			p = moduleBundler({
				options: {
					bundleDefinition: {
						name: "sap-ui-core.js",
						sections: [
							{
								// include all 'raw' modules that are needed for the UI5 loader
								mode: "raw",
								filters,
								resolve: true, // dependencies for raw modules are taken from shims in .library files
								sort: true, // topological sort on raw modules is mandatory
								declareModules: false
							},
							{
								mode: "preload",
								filters: [
									"sap/ui/core/Core.js"
								],
								resolve: true
							},
							{
								mode: "require",
								filters: [
									"sap/ui/core/Core.js"
								]
							}
						]
					}
				},
				resources
			}).then(([bundle]) => {
				if (bundle) {
					// console.log("sap-ui-core.js bundle created");
					return workspace.write(bundle);
				}
			});
		} else {
			p = Promise.resolve();
		}

		return p.then(() => {
			return workspace.byGlob("/resources/**/.library").then((libraryIndicatorResources) => {
				if (libraryIndicatorResources.length > 0) {
					return libraryIndicatorResources;
				} else {
					// Fallback to "library.js" as library indicator
					log.verbose(`Could not find a ".library" file for project ${options.projectName}, falling back to "library.js".`);
					return workspace.byGlob("/resources/**/library.js");
				}
			}).then((libraryIndicatorResources) => {
				if (libraryIndicatorResources.length < 1) {
					// No library found - nothing to do
					log.verbose(`Could not find a ".library" or "library.js" file for project ${options.projectName}. Skipping library preload bundling.`);
					return;
				}

				return Promise.all(libraryIndicatorResources.map((libraryIndicatorResource) => {
					// Determine library namespace from library indicator file path
					// ending with either ".library" or "library.js" (see fallback logic above)
					// e.g. /resources/sap/foo/.library => sap/foo
					//      /resources/sap/bar/library.js => sap/bar
					const libraryNamespacePattern = /^\/resources\/(.*)\/(?:\.library|library\.js)$/;
					const libraryIndicatorPath = libraryIndicatorResource.getPath();
					const libraryNamespaceMatch = libraryIndicatorPath.match(libraryNamespacePattern);
					if (libraryNamespaceMatch && libraryNamespaceMatch[1]) {
						const libraryNamespace = libraryNamespaceMatch[1];
						return moduleBundler({
							options: {
								bundleDefinition: getBundleDefinition(libraryNamespace)
							},
							resources
						}).then(([bundle]) => {
							if (bundle) {
								// console.log(`${libraryNamespace}/library-preload.js bundle created`);
								return workspace.write(bundle);
							}
						});
					} else {
						log.verbose(`Could not determine library namespace from file "${libraryIndicatorPath}" for project ${options.projectName}. Skipping library preload bundling.`);
						return Promise.resolve();
					}
				}));
			});
		});
	});
};

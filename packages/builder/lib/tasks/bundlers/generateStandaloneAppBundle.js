const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateStandaloneAppBundle");
const moduleBundler = require("../../processors/bundlers/moduleBundler");

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

	// If an application does not have a namespace, its resources are located at the root. Otherwise in /resources
	// For dependencies, we do not want to search in their test-resources
	const results = await Promise.all([
		workspace.byGlob("/**/*.{js,json,xml,html,properties,library}"),
		dependencies.byGlob("/resources/**/*.{js,json,xml,html,properties,library}")
	]);
	const resources = Array.prototype.concat.apply([], results);

	const isEvo = resources.find((resource) => {
		return resource.getPath() === "/resources/ui5loader.js";
	});
	let filters;
	if (isEvo) {
		filters = ["ui5loader-autoconfig.js"];
	} else {
		filters = ["jquery.sap.global.js"];
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
			resources,
			options: {
				bundleDefinition: getBundleDefinition({
					name: "sap-ui-custom-dbg.js",
					filters,
					namespace
				}),
				bundleOptions: {
					optimize: false
				}
			}
		})
	]).then((results) => {
		const bundles = Array.prototype.concat.apply([], results);
		return Promise.all(bundles.map((resource) => {
			if (taskUtil) {
				taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.IsBundle);
			}
			return workspace.write(resource);
		}));
	});
};

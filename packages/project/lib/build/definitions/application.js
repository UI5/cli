import {enhancePatternWithExcludes} from "./_utils.js";
import {enhanceBundlesWithDefaults} from "../../validation/validator.js";

/**
 * Get tasks and their configuration for a given application project
 *
 * @private
 * @param {object} parameters
 * @param {object} parameters.project
 * @param {object} parameters.taskUtil
 * @param {Function} parameters.getTask
 */
export default function({project, taskUtil, getTask}) {
	const tasks = new Map();
	tasks.set("escapeNonAsciiCharacters", {
		options: {
			encoding: project.getPropertiesFileSourceEncoding(),
			pattern: "/**/*.properties"
		}
	});

	tasks.set("replaceCopyright", {
		options: {
			copyright: project.getCopyright(),
			pattern: "/**/*.{js,json}"
		}
	});

	tasks.set("replaceVersion", {
		options: {
			version: project.getVersion(),
			pattern: "/**/*.{js,json}"
		}
	});

	// Support rules should not be minified to have readable code in the Support Assistant
	const minificationPattern = ["/**/*.js", "!**/*.support.js"];
	if (project.getSpecVersion().gte("2.6")) {
		const minificationExcludes = project.getMinificationExcludes();
		if (minificationExcludes.length) {
			enhancePatternWithExcludes(minificationPattern, minificationExcludes, "/resources/");
		}
	}
	tasks.set("minify", {
		options: {
			pattern: minificationPattern
		}
	});

	tasks.set("enhanceManifest", {});

	tasks.set("generateFlexChangesBundle", {});

	const bundles = project.getBundles();
	const existingBundleDefinitionNames =
		bundles.map(({bundleDefinition}) => bundleDefinition.name).filter(Boolean);

	const componentPreloadPaths = project.getComponentPreloadPaths();
	const componentPreloadNamespaces = project.getComponentPreloadNamespaces();
	const componentPreloadExcludes = project.getComponentPreloadExcludes();
	if (componentPreloadPaths.length || componentPreloadNamespaces.length) {
		tasks.set("generateComponentPreload", {
			options: {
				paths: componentPreloadPaths,
				namespaces: componentPreloadNamespaces,
				excludes: componentPreloadExcludes,
				skipBundles: existingBundleDefinitionNames
			}
		});
	} else {
		// Default component preload for application namespace
		tasks.set("generateComponentPreload", {
			options: {
				namespaces: [project.getNamespace()],
				excludes: componentPreloadExcludes,
				skipBundles: existingBundleDefinitionNames
			}
		});
	}

	tasks.set("generateStandaloneAppBundle", {requiresDependencies: true});

	tasks.set("transformBootstrapHtml", {});

	if (bundles.length) {
		tasks.set("generateBundle", {
			requiresDependencies: true,
			taskFunction: async ({workspace, dependencies, taskUtil, options}) => {
				const generateBundleTask = await getTask("generateBundle");
				// Async resolve default values for bundle definitions and options
				const bundlesDefaults = await enhanceBundlesWithDefaults(bundles, taskUtil.getProject());

				return bundlesDefaults.reduce(async function(sequence, bundle) {
					return sequence.then(function() {
						return generateBundleTask.task({
							workspace,
							dependencies,
							taskUtil,
							options: {
								projectName: options.projectName,
								bundleDefinition: bundle.bundleDefinition,
								bundleOptions: bundle.bundleOptions
							}
						});
					});
				}, Promise.resolve());
			}
		});
	} else {
		// No bundles defined. Just set task so that it can be referenced by custom tasks
		tasks.set("generateBundle", {
			taskFunction: null
		});
	}

	tasks.set("generateVersionInfo", {
		requiresDependencies: true,
		options: {
			rootProject: project,
			pattern: "/resources/**/.library"
		}
	});

	tasks.set("generateCachebusterInfo", {
		options: {
			signatureType: project.getCachebusterSignatureType(),
		}
	});

	tasks.set("generateApiIndex", {requiresDependencies: true});
	tasks.set("generateResourcesJson", {requiresDependencies: true});

	return tasks;
}

import {enhancePatternWithExcludes} from "./_utils.js";
import {enhanceBundlesWithDefaults} from "../../validation/validator.js";

/**
 * Get tasks and their configuration for a given library project
 *
 * @private
 * @param {object} parameters
 * @param {object} parameters.project
 * @param {object} parameters.taskUtil
 * @param {Function} parameters.getTask
 * @returns {Map<string, object>} Map of task names and their configuration
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
			pattern: "/**/*.{js,library,css,less,theme,html}"
		}
	});

	tasks.set("replaceVersion", {
		options: {
			version: project.getVersion(),
			pattern: "/**/*.{js,json,library,css,less,theme,html}"
		}
	});

	tasks.set("replaceBuildtime", {
		options: {
			pattern: "/resources/sap/ui/{Global,core/Core}.js"
		}
	});

	// The task's requiresDependencies flag and its determineBuildSignature callback live on the task
	// module's descriptor now; the definition only supplies the project-derived options the factory needs.
	tasks.set("generateJsdoc", {
		options: {
			namespace: project.getNamespace(),
			version: project.getVersion(),
			jsdocExcludes: project.getJsdocExcludes()
		}
	});

	tasks.set("executeJsdocSdkTransformation", {
		options: {
			dotLibraryPattern: "/resources/**/*.library",
		}
	});

	// Support rules should not be minified to have readable code in the Support Assistant
	const minificationPattern = ["/resources/**/*.js", "!**/*.support.js"];
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

	// For specVersion 5.0+, only execute for framework libraries
	if (project.getSpecVersion().lt("5.0") || project.isFrameworkProject()) {
		tasks.set("generateLibraryManifest", {});
	} else {
		tasks.set("generateLibraryManifest", {skip: true});
	}

	tasks.set("enhanceManifest", {});

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
		tasks.set("generateComponentPreload", {skip: true});
	}

	tasks.set("generateLibraryPreload", {
		options: {
			excludes: project.getLibraryPreloadExcludes(),
			skipBundles: existingBundleDefinitionNames
		}
	});

	if (bundles.length) {
		// The generateBundle task module resolves one bundle per call. Resolving the per-bundle defaults
		// needs enhanceBundlesWithDefaults, which lives in @ui5/project and cannot move into @ui5/builder, so
		// the multi-bundle wrapper stays here. It reads the task module's descriptor via getTask and drives
		// descriptor.task once per bundle.
		tasks.set("generateBundle", {
			requiresDependencies: true,
			taskFunction: async ({workspace, dependencies, taskUtil, options}) => {
				const {task} = await getTask("generateBundle");
				const {task: generateBundle} = task(options);
				// Async resolve default values for bundle definitions and options
				const bundlesDefaults = await enhanceBundlesWithDefaults(bundles, taskUtil.getProject());

				return bundlesDefaults.reduce(function(sequence, bundle) {
					return sequence.then(function() {
						return generateBundle({
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
		tasks.set("generateBundle", {skip: true});
	}

	tasks.set("buildThemes", {
		options: {
			projectName: project.getName(),
			librariesPattern: !taskUtil.isRootProject() ? "/resources/**/(*.library|library.js)" : undefined,
			themesPattern: !taskUtil.isRootProject() ? "/resources/sap/ui/core/themes/*" : undefined,
			inputPattern: `/resources/${project.getNamespace()}/themes/*/library.source.less`,
		}
	});

	if (project.isFrameworkProject()) {
		tasks.set("generateThemeDesignerResources", {
			options: {
				version: project.getVersion()
			}
		});
	} else {
		tasks.set("generateThemeDesignerResources", {skip: true});
	}

	tasks.set("generateResourcesJson", {});

	return tasks;
}

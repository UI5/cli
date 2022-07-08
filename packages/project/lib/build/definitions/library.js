const {enhancePatternWithExcludes} = require("./_utils");

/**
 * Get tasks and their configuration for a given application project
 *
 * @private
 * @param {object} parameters
 * @param {object} parameters.project
 * @param {object} parameters.taskUtil
 * @param {Function} parameters.getTask
 */
module.exports = function({project, taskUtil, getTask}) {
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
			pattern: "/resources/sap/ui/Global.js"
		}
	});

	tasks.set("generateJsdoc", {
		requiresDependencies: true,
		taskFunction: async ({workspace, dependencies, taskUtil, options}) => {
			const patterns = ["/resources/**/*.js"];
			// Add excludes
			const excludes = project.getJsdocExcludes();
			if (excludes.length) {
				patterns.push(...excludes.map((pattern) => {
					return `!/resources/${pattern}`;
				}));
			}

			return getTask("generateJsdoc").task({
				workspace,
				dependencies,
				taskUtil,
				options: {
					projectName: options.projectName,
					namespace: project.getNamespace(),
					version: project.getVersion(),
					pattern: patterns
				}
			});
		}
	});

	tasks.set("executeJsdocSdkTransformation", {
		requiresDependencies: true,
		options: {
			dotLibraryPattern: "/resources/**/*.library",
		}
	});

	// Support rules should not be minified to have readable code in the Support Assistant
	const minificationPattern = ["/resources/**/*.js", "!**/*.support.js"];
	if (["2.6"].includes(project.getSpecVersion())) {
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

	tasks.set("generateLibraryManifest", {});
	tasks.set("generateManifestBundle", {});

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
	}

	tasks.set("generateLibraryPreload", {
		options: {
			excludes: project.getLibraryPreloadExcludes(),
			skipBundles: existingBundleDefinitionNames
		}
	});

	if (bundles.length) {
		tasks.set("generateBundle", {
			requiresDependencies: true,
			taskFunction: async ({workspace, dependencies, taskUtil, options}) => {
				return bundles.reduce(function(sequence, bundle) {
					return sequence.then(function() {
						return getTask("generateBundle").task({
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
	}

	tasks.set("buildThemes", {
		requiresDependencies: true,
		options: {
			projectName: project.getName(),
			librariesPattern: !taskUtil.isRootProject() ? "/resources/**/(*.library|library.js)" : undefined,
			themesPattern: !taskUtil.isRootProject() ? "/resources/sap/ui/core/themes/*" : undefined,
			inputPattern: `/resources/${project.getNamespace()}/themes/*/library.source.less`,
			cssVariables: taskUtil.getBuildOption("cssVariables")
		}
	});

	tasks.set("generateThemeDesignerResources", {
		requiresDependencies: true,
		options: {
			version: project.getVersion()
		}
	});

	tasks.set("generateResourcesJson", {
		requiresDependencies: true
	});

	return tasks;
};

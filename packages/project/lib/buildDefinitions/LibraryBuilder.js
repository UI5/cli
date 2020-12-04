const AbstractBuilder = require("./AbstractBuilder");

class LibraryBuilder extends AbstractBuilder {
	addStandardTasks({project, taskUtil, getTask}) {
		this.addTask("escapeNonAsciiCharacters", {
			options: {
				encoding: project.getPropertiesFileSourceEncoding(),
				pattern: "/**/*.properties"
			}
		});

		this.addTask("replaceCopyright", {
			options: {
				copyright: project.getCopyright(),
				pattern: "/**/*.{js,library,css,less,theme,html}"
			}
		});

		this.addTask("replaceVersion", {
			options: {
				version: project.getVersion(),
				pattern: "/**/*.{js,json,library,css,less,theme,html}"
			}
		});

		this.addTask("replaceBuildtime", {
			options: {
				pattern: "/resources/sap/ui/Global.js"
			}
		});

		this.addTask("generateJsdoc", {requiresDependencies: true},
			async ({workspace, dependencies, taskUtil, options}) => {
				const patterns = ["/resources/**/*.js"];
				// Add excludes
				const excludes = project.getJsdocExcludes();
				if (excludes.length) {
					const excludes = excludes.map((pattern) => {
						return `!/resources/${pattern}`;
					});

					patterns.push(...excludes);
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
			});

		this.addTask("executeJsdocSdkTransformation", {
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
				this.enhancePatternWithExcludes(minificationPattern, minificationExcludes, "/resources/");
			}
		}

		this.addTask("minify", {
			options: {
				pattern: minificationPattern
			}
		});

		this.addTask("generateLibraryManifest");
		this.addTask("generateManifestBundle");


		const bundles = project.getBundles();
		const existingBundleDefinitionNames =
			bundles.map(({bundleDefinition}) => bundleDefinition.name).filter(Boolean) || [];
		const componentPreloadPaths = project.getComponentPreloadPaths();
		const componentPreloadNamespaces = project.getComponentPreloadNamespaces();
		const componentPreloadExcludes = project.getComponentPreloadNamespaces();
		if (componentPreloadPaths.length || componentPreloadNamespaces.length) {
			this.addTask("generateComponentPreload", {
				options: {
					paths: componentPreloadPaths,
					namespaces: componentPreloadNamespaces,
					excludes: componentPreloadExcludes,
					skipBundles: existingBundleDefinitionNames
				}
			});
		}

		this.addTask("generateLibraryPreload", {
			options: {
				excludes: project.getLibraryPreloadExcludes(),
				skipBundles: existingBundleDefinitionNames
			}
		});

		if (bundles.length) {
			this.addTask("generateBundle", {requiresDependencies: true},
				async ({workspace, dependencies, taskUtil, options}) => {
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
				});
		}

		this.addTask("buildThemes", {
			requiresDependencies: true,
			options: {
				projectName: project.getName(),
				librariesPattern: !taskUtil.isRootProject() ? "/resources/**/(*.library|library.js)" : undefined,
				themesPattern: !taskUtil.isRootProject() ? "/resources/sap/ui/core/themes/*" : undefined,
				inputPattern: `/resources/${project.getNamespace()}/themes/*/library.source.less`,
				cssVariables: taskUtil.getBuildOption("cssVariables")
			}
		});

		this.addTask("generateThemeDesignerResources", {
			requiresDependencies: true,
			options: {
				version: project.getVersion()
			}
		});

		this.addTask("generateResourcesJson", {
			requiresDependencies: true
		});
	}
}

module.exports = LibraryBuilder;

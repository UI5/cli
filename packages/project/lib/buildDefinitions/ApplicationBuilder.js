const AbstractBuilder = require("./AbstractBuilder");

class ApplicationBuilder extends AbstractBuilder {
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
				pattern: "/**/*.{js,json}"
			}
		});

		this.addTask("replaceVersion", {
			options: {
				version: project.getVersion(),
				pattern: "/**/*.{js,json}"
			}
		});

		// Support rules should not be minified to have readable code in the Support Assistant
		const minificationPattern = ["/**/*.js", "!**/*.support.js"];
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

		this.addTask("generateFlexChangesBundle");
		this.addTask("generateManifestBundle");

		const bundles = project.getBundles();
		const existingBundleDefinitionNames =
			bundles.map(({bundleDefinition}) => bundleDefinition.name).filter(Boolean) || [];

		const componentPreloadPaths = project.getComponentPreloadPaths();
		const componentPreloadNamespaces = project.getComponentPreloadNamespaces();
		const componentPreloadExcludes = project.getComponentPreloadExcludes();
		if (componentPreloadPaths.length || componentPreloadNamespaces.length) {
			this.addTask("generateComponentPreload", {
				options: {
					paths: componentPreloadPaths,
					namespaces: componentPreloadNamespaces,
					excludes: componentPreloadExcludes,
					skipBundles: existingBundleDefinitionNames
				}
			});
		} else {
			// Default component preload for application namespace
			this.addTask("generateComponentPreload", {
				options: {
					namespaces: [project.getNamespace()],
					excludes: componentPreloadExcludes,
					skipBundles: existingBundleDefinitionNames
				}
			});
		}

		this.addTask("generateStandaloneAppBundle", {requiresDependencies: true});

		this.addTask("transformBootstrapHtml");

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

		this.addTask("generateVersionInfo", {
			requiresDependencies: true,
			options: {
				rootProject: project,
				pattern: "/resources/**/.library"
			}
		});

		this.addTask("generateCachebusterInfo", {
			options: {
				signatureType: project.getCachebusterSignatureType(),
			}
		});

		this.addTask("generateApiIndex", {requiresDependencies: true});
		this.addTask("generateResourcesJson", {requiresDependencies: true});
	}
}

module.exports = ApplicationBuilder;

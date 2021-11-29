const AbstractBuilder = require("../AbstractBuilder");
const {getTask} = require("../../tasks/taskRepository");

class LibraryBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log, taskUtil}) {
		if (!project.metadata.namespace) {
			// TODO 3.0: Throw here
			log.info("Skipping some tasks due to missing library namespace information. Your project " +
				"might be missing a manifest.json or .library file. " +
				"Also see: https://sap.github.io/ui5-tooling/pages/Builder/#library");
		}

		this.addTask("escapeNonAsciiCharacters", async () => {
			const propertiesFileSourceEncoding = project.resources &&
				project.resources.configuration &&
				project.resources.configuration.propertiesFileSourceEncoding;
			return getTask("escapeNonAsciiCharacters").task({
				workspace: resourceCollections.workspace,
				options: {
					encoding: propertiesFileSourceEncoding,
					pattern: "/**/*.properties"
				}
			});
		});

		this.addTask("replaceCopyright", async () => {
			return getTask("replaceCopyright").task({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/resources/**/*.{js,library,less,theme}"
				}
			});
		});

		this.addTask("replaceVersion", async () => {
			return getTask("replaceVersion").task({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/resources/**/*.{js,json,library,less,theme}"
				}
			});
		});

		this.addTask("replaceBuildtime", async () => {
			return getTask("replaceBuildtime").task({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/resources/sap/ui/Global.js"
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateJsdoc", async () => {
				const patterns = ["/resources/**/*.js"];
				// Add excludes
				if (project.builder && project.builder.jsdoc && project.builder.jsdoc.excludes) {
					const excludes = project.builder.jsdoc.excludes.map((pattern) => {
						return `!/resources/${pattern}`;
					});

					patterns.push(...excludes);
				}

				return getTask("generateJsdoc").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					taskUtil,
					options: {
						projectName: project.metadata.name,
						namespace: project.metadata.namespace,
						version: project.version,
						pattern: patterns
					}
				});
			});

			this.addTask("executeJsdocSdkTransformation", async () => {
				return getTask("executeJsdocSdkTransformation").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					options: {
						projectName: project.metadata.name,
						dotLibraryPattern: "/resources/**/*.library",
					}
				});
			});
		}

		const componentPreload = project.builder && project.builder.componentPreload;
		if (componentPreload) {
			this.addTask("generateComponentPreload", async () => {
				return getTask("generateComponentPreload").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					taskUtil,
					options: {
						projectName: project.metadata.name,
						paths: componentPreload.paths,
						namespaces: componentPreload.namespaces,
						excludes: componentPreload.excludes
					}
				});
			});
		}

		this.addTask("generateLibraryManifest", async () => {
			return getTask("generateLibraryManifest").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				taskUtil,
				options: {
					projectName: project.metadata.name
				}
			});
		});


		if (project.metadata.namespace) {
			this.addTask("generateManifestBundle", async () => {
				return getTask("generateManifestBundle").task({
					workspace: resourceCollections.workspace,
					options: {
						projectName: project.metadata.name,
						namespace: project.metadata.namespace
					}
				});
			});
		}

		this.addTask("generateLibraryPreload", async () => {
			return getTask("generateLibraryPreload").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				taskUtil,
				options: {
					projectName: project.metadata.name,
					excludes:
						project.builder &&
						project.builder.libraryPreload &&
						project.builder.libraryPreload.excludes
				}
			});
		});

		const bundles = project.builder && project.builder.bundles;
		if (bundles) {
			this.addTask("generateBundle", async () => {
				return bundles.reduce(function(sequence, bundle) {
					return sequence.then(function() {
						return getTask("generateBundle").task({
							workspace: resourceCollections.workspace,
							dependencies: resourceCollections.dependencies,
							taskUtil,
							options: {
								projectName: project.metadata.name,
								bundleDefinition: bundle.bundleDefinition,
								bundleOptions: bundle.bundleOptions
							}
						});
					});
				}, Promise.resolve());
			});
		}

		this.addTask("buildThemes", async () => {
			// Only compile themes directly below the lib namespace to be in sync with the theme support at runtime
			// which only loads themes from that folder.
			// TODO 3.0: Remove fallback in case of missing namespace
			const inputPattern = `/resources/${project.metadata.namespace || "**"}/themes/*/library.source.less`;

			return getTask("buildThemes").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name,
					librariesPattern: !taskUtil.isRootProject() ? "/resources/**/(*.library|library.js)" : undefined,
					themesPattern: !taskUtil.isRootProject() ? "/resources/sap/ui/core/themes/*" : undefined,
					inputPattern
				}
			});
		});

		this.addTask("generateThemeDesignerResources", async () => {
			return getTask("generateThemeDesignerResources").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name,
					version: project.version,
					namespace: project.metadata.namespace
				}
			});
		});

		const minificationPattern = ["/resources/**/*.js"];
		if (["2.6"].includes(project.specVersion)) {
			const minificationExcludes = project.builder && project.builder.minification &&
				project.builder.minification.excludes;
			if (minificationExcludes) {
				this.enhancePatternWithExcludes(minificationPattern, minificationExcludes, "/resources/");
			}
		}
		this.addTask("createDebugFiles", async () => {
			return getTask("createDebugFiles").task({
				workspace: resourceCollections.workspace,
				options: {
					pattern: minificationPattern
				}
			});
		});

		this.addTask("uglify", async () => {
			return getTask("uglify").task({
				workspace: resourceCollections.workspace,
				taskUtil,
				options: {
					pattern: minificationPattern
				}
			});
		});

		this.addTask("generateResourcesJson", () => {
			return getTask("generateResourcesJson").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name
				}
			});
		});
	}
}

module.exports = LibraryBuilder;

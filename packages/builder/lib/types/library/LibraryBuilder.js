const AbstractBuilder = require("../AbstractBuilder");
const {getTask} = require("../../tasks/taskRepository");

class LibraryBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log, buildContext}) {
		if (!project.metadata.namespace) {
			log.info("Skipping some tasks due to missing library namespace information. Your project " +
				"might be missing a manifest.json or .library file. " +
				"Also see: https://sap.github.io/ui5-tooling/pages/Builder/#library");
		}

		this.addTask("escapeNonAsciiCharacters", async () => {
			const propertiesFileSourceEncoding = project.resources
				&& project.resources.configuration
				&& project.resources.configuration.propertiesFileSourceEncoding;
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
					buildContext,
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
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
					options: {
						projectName: project.metadata.name,
						paths: componentPreload.paths,
						namespaces: componentPreload.namespaces
					}
				});
			});
		}

		this.addTask("generateLibraryManifest", async () => {
			return getTask("generateLibraryManifest").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
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
				options: {
					projectName: project.metadata.name
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
			return getTask("buildThemes").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name,
					librariesPattern: !buildContext.isRootProject() ? "/resources/**/*.library" : undefined,
					themesPattern: !buildContext.isRootProject() ? "/resources/sap/ui/core/themes/*" : undefined,
					inputPattern: "/resources/**/themes/*/library.source.less"
				}
			});
		});

		this.addTask("createDebugFiles", async () => {
			return getTask("createDebugFiles").task({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/resources/**/*.js"
				}
			});
		});

		this.addTask("uglify", async () => {
			return getTask("uglify").task({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/resources/**/*.js"
				}
			});
		});
	}
}

module.exports = LibraryBuilder;

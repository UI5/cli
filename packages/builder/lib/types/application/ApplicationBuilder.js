const AbstractBuilder = require("../AbstractBuilder");
const taskRepository = require("../../tasks/taskRepository");

class ApplicationBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log}) {
		if (!project.metadata.namespace) {
			log.info("Skipping some tasks due to missing application namespace information. If your project contains " +
					"a Component.js, you might be missing a manifest.json file. " +
					"Also see: https://sap.github.io/ui5-tooling/pages/Builder/#application");
		}

		this.addTask("escapeNonAsciiCharacters", () => {
			const propertiesFileSourceEncoding = project.resources
				&& project.resources.configuration
				&& project.resources.configuration.propertiesFileSourceEncoding;
			return taskRepository.getTask("escapeNonAsciiCharacters").task({
				workspace: resourceCollections.workspace,
				options: {
					encoding: propertiesFileSourceEncoding,
					pattern: "/**/*.properties"
				}
			});
		});

		this.addTask("replaceCopyright", () => {
			return taskRepository.getTask("replaceCopyright").task({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/**/*.{js,json}"
				}
			});
		});

		this.addTask("replaceVersion", () => {
			return taskRepository.getTask("replaceVersion").task({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/**/*.{js,json}"
				}
			});
		});

		this.addTask("generateFlexChangesBundle", () => {
			const generateFlexChangesBundle = taskRepository.getTask("generateFlexChangesBundle").task;
			return generateFlexChangesBundle({
				workspace: resourceCollections.workspace,
				options: {
					namespace: project.metadata.namespace
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateManifestBundle", () => {
				const generateManifestBundle = taskRepository.getTask("generateManifestBundle").task;
				return generateManifestBundle({
					workspace: resourceCollections.workspace,
					options: {
						projectName: project.metadata.name,
						namespace: project.metadata.namespace
					}
				});
			});
		}

		const componentPreload = project.builder && project.builder.componentPreload;
		if (componentPreload) {
			this.addTask("generateComponentPreload", async () => {
				return taskRepository.getTask("generateComponentPreload").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					options: {
						projectName: project.metadata.name,
						paths: componentPreload.paths,
						namespaces: componentPreload.namespaces
					}
				});
			});
		} else if (project.metadata.namespace) {
			// Default component preload for application namespace
			this.addTask("generateComponentPreload", async () => {
				return taskRepository.getTask("generateComponentPreload").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					options: {
						projectName: project.metadata.name,
						namespaces: [project.metadata.namespace]
					}
				});
			});
		}

		this.addTask("generateStandaloneAppBundle", () => {
			return taskRepository.getTask("generateStandaloneAppBundle").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name,
					namespace: project.metadata.namespace
				}
			});
		});

		this.addTask("transformBootstrapHtml", () => {
			return taskRepository.getTask("transformBootstrapHtml").task({
				workspace: resourceCollections.workspace,
				options: {
					projectName: project.metadata.name,
					namespace: project.metadata.namespace
				}
			});
		});

		const bundles = project.builder && project.builder.bundles;
		if (bundles) {
			this.addTask("generateBundle", () => {
				return Promise.all(bundles.map((bundle) => {
					return taskRepository.getTask("generateBundle").task({
						workspace: resourceCollections.workspace,
						dependencies: resourceCollections.dependencies,
						options: {
							projectName: project.metadata.name,
							bundleDefinition: bundle.bundleDefinition,
							bundleOptions: bundle.bundleOptions
						}
					});
				}));
			});
		}

		this.addTask("createDebugFiles", () => {
			const createDebugFiles = taskRepository.getTask("createDebugFiles").task;
			return createDebugFiles({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("uglify", () => {
			const uglify = taskRepository.getTask("uglify").task;
			return uglify({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("generateVersionInfo", () => {
			return taskRepository.getTask("generateVersionInfo").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					rootProject: project,
					pattern: "/resources/**/.library"
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateCachebusterInfo", () => {
				return taskRepository.getTask("generateCachebusterInfo").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					options: {
						namespace: project.metadata.namespace,
						signatureType: project.builder
							&& project.builder.cachebuster
							&& project.builder.cachebuster.signatureType,
					}
				});
			});
		}

		this.addTask("generateApiIndex", () => {
			return taskRepository.getTask("generateApiIndex").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name
				}
			});
		});
	}
}

module.exports = ApplicationBuilder;

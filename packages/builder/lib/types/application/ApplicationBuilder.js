const AbstractBuilder = require("../AbstractBuilder");
const {getTask} = require("../../tasks/taskRepository");

class ApplicationBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log, taskUtil}) {
		if (!project.metadata.namespace) {
			// TODO 3.0: Throw here
			log.info("Skipping some tasks due to missing application namespace information. If your project contains " +
					"a Component.js, you might be missing a manifest.json file. " +
					"Also see: https://sap.github.io/ui5-tooling/pages/Builder/#application");
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
					pattern: "/**/*.{js,json}"
				}
			});
		});

		this.addTask("replaceVersion", async () => {
			return getTask("replaceVersion").task({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/**/*.{js,json}"
				}
			});
		});

		this.addTask("generateFlexChangesBundle", async () => {
			const generateFlexChangesBundle = getTask("generateFlexChangesBundle").task;
			return generateFlexChangesBundle({
				workspace: resourceCollections.workspace,
				taskUtil,
				options: {
					namespace: project.metadata.namespace
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateManifestBundle", async () => {
				const generateManifestBundle = getTask("generateManifestBundle").task;
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
		if (componentPreload && (componentPreload.namespaces || componentPreload.paths)) {
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
		} else if (project.metadata.namespace) {
			// Default component preload for application namespace
			this.addTask("generateComponentPreload", async () => {
				return getTask("generateComponentPreload").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					taskUtil,
					options: {
						projectName: project.metadata.name,
						namespaces: [project.metadata.namespace],
						excludes: componentPreload && componentPreload.excludes
					}
				});
			});
		}

		this.addTask("generateStandaloneAppBundle", async () => {
			return getTask("generateStandaloneAppBundle").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				taskUtil,
				options: {
					projectName: project.metadata.name,
					namespace: project.metadata.namespace
				}
			});
		});

		this.addTask("transformBootstrapHtml", async () => {
			return getTask("transformBootstrapHtml").task({
				workspace: resourceCollections.workspace,
				options: {
					projectName: project.metadata.name,
					namespace: project.metadata.namespace
				}
			});
		});

		const bundles = project.builder && project.builder.bundles;
		if (bundles) {
			this.addTask("generateBundle", async () => {
				return Promise.all(bundles.map((bundle) => {
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
				}));
			});
		}

		this.addTask("createDebugFiles", async () => {
			const createDebugFiles = getTask("createDebugFiles").task;
			return createDebugFiles({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("uglify", async () => {
			const uglify = getTask("uglify").task;
			return uglify({
				workspace: resourceCollections.workspace,
				taskUtil,
				options: {
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("generateVersionInfo", async () => {
			return getTask("generateVersionInfo").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					rootProject: project,
					pattern: "/resources/**/.library"
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateCachebusterInfo", async () => {
				return getTask("generateCachebusterInfo").task({
					workspace: resourceCollections.workspace,
					dependencies: resourceCollections.dependencies,
					options: {
						namespace: project.metadata.namespace,
						signatureType: project.builder &&
							project.builder.cachebuster &&
							project.builder.cachebuster.signatureType,
					}
				});
			});
		}

		this.addTask("generateApiIndex", async () => {
			return getTask("generateApiIndex").task({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name
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

module.exports = ApplicationBuilder;

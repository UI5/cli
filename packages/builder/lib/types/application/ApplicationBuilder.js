const AbstractBuilder = require("../AbstractBuilder");

const tasks = { // can't require index.js due to circular dependency
	generateComponentPreload: require("../../tasks/bundlers/generateComponentPreload"),
	generateFlexChangesBundle: require("../../tasks/bundlers/generateFlexChangesBundle"),
	generateLibraryPreload: require("../../tasks/bundlers/generateLibraryPreload"),
	generateManifestBundle: require("../../tasks/bundlers/generateManifestBundle"),
	generateStandaloneAppBundle: require("../../tasks/bundlers/generateStandaloneAppBundle"),
	generateBundle: require("../../tasks/bundlers/generateBundle"),
	generateCachebusterInfo: require("../../tasks/generateCachebusterInfo"),
	buildThemes: require("../../tasks/buildThemes"),
	createDebugFiles: require("../../tasks/createDebugFiles"),
	generateVersionInfo: require("../../tasks/generateVersionInfo"),
	replaceCopyright: require("../../tasks/replaceCopyright"),
	replaceVersion: require("../../tasks/replaceVersion"),
	transformBootstrapHtml: require("../../tasks/transformBootstrapHtml"),
	uglify: require("../../tasks/uglify"),
	generateApiIndex: require("../../tasks/jsdoc/generateApiIndex")
};

class ApplicationBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log}) {
		if (!project.metadata.namespace) {
			log.info("Skipping some tasks due to missing application namespace information. If your project contains " +
					"a Component.js, you might be missing a manifest.json file. " +
					"Also see: https://github.com/SAP/ui5-builder#application");
		}

		this.addTask("replaceCopyright", () => {
			return tasks.replaceCopyright({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/**/*.{js,json}"
				}
			});
		});

		this.addTask("replaceVersion", () => {
			return tasks.replaceVersion({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/**/*.{js,json}"
				}
			});
		});

		this.addTask("generateFlexChangesBundle", () => {
			const generateFlexChangesBundle = tasks.generateFlexChangesBundle;
			return generateFlexChangesBundle({
				workspace: resourceCollections.workspace,
				options: {
					namespace: project.metadata.namespace
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateManifestBundle", () => {
				const generateManifestBundle = tasks.generateManifestBundle;
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
				return tasks.generateComponentPreload({
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
				return tasks.generateComponentPreload({
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
			return tasks.generateStandaloneAppBundle({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name,
					namespace: project.metadata.namespace
				}
			});
		});

		this.addTask("transformBootstrapHtml", () => {
			return tasks.transformBootstrapHtml({
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
					return tasks.generateBundle({
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
			const createDebugFiles = tasks.createDebugFiles;
			return createDebugFiles({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("uglify", () => {
			const uglify = tasks.uglify;
			return uglify({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("generateVersionInfo", () => {
			return tasks.generateVersionInfo({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					rootProject: project,
					pattern: "/**/.library"
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateCachebusterInfo", () => {
				return tasks.generateCachebusterInfo({
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
			return tasks.generateApiIndex({
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

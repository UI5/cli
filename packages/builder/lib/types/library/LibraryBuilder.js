const AbstractBuilder = require("../AbstractBuilder");
const taskRepository = require("../../tasks/taskRepository");

class LibraryBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log, buildContext}) {
		if (!project.metadata.namespace) {
			log.info("Skipping some tasks due to missing library namespace information. Your project " +
				"might be missing a manifest.json or .library file. " +
				"Also see: https://sap.github.io/ui5-tooling/pages/Builder/#library");
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
			const replaceCopyright = taskRepository.getTask("replaceCopyright").task;
			return replaceCopyright({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/resources/**/*.{js,library,less,theme}"
				}
			});
		});

		this.addTask("replaceVersion", () => {
			const replaceVersion = taskRepository.getTask("replaceVersion").task;
			return replaceVersion({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/resources/**/*.{js,json,library,less,theme}"
				}
			});
		});

		if (project.metadata.namespace) {
			this.addTask("generateJsdoc", () => {
				const generateJsdoc = taskRepository.getTask("generateJsdoc").task;

				const patterns = ["/resources/**/*.js"];
				// Add excludes
				if (project.builder && project.builder.jsdoc && project.builder.jsdoc.excludes) {
					const excludes = project.builder.jsdoc.excludes.map((pattern) => {
						return `!/resources/${pattern}`;
					});

					patterns.push(...excludes);
				}

				return generateJsdoc({
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

			this.addTask("executeJsdocSdkTransformation", () => {
				const executeJsdocSdkTransformation = taskRepository.getTask("executeJsdocSdkTransformation").task;

				return executeJsdocSdkTransformation({
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
			const generateComponentPreload = taskRepository.getTask("generateComponentPreload").task;

			this.addTask("generateComponentPreload", () => {
				return generateComponentPreload({
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

		this.addTask("generateLibraryManifest", () => {
			const generateLibraryManifest = taskRepository.getTask("generateLibraryManifest").task;
			return generateLibraryManifest({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name
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

		this.addTask("generateLibraryPreload", () => {
			const generateLibraryPreload = taskRepository.getTask("generateLibraryPreload").task;
			return generateLibraryPreload({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					projectName: project.metadata.name
				}
			});
		});

		const bundles = project.builder && project.builder.bundles;
		if (bundles) {
			this.addTask("generateBundle", () => {
				return bundles.reduce(function(sequence, bundle) {
					return sequence.then(function() {
						return taskRepository.getTask("generateBundle").task({
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

		this.addTask("buildThemes", () => {
			const buildThemes = taskRepository.getTask("buildThemes").task;
			return buildThemes({
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

		this.addTask("createDebugFiles", () => {
			const createDebugFiles = taskRepository.getTask("createDebugFiles").task;
			return createDebugFiles({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/resources/**/*.js"
				}
			});
		});

		this.addTask("uglify", () => {
			const uglify = taskRepository.getTask("uglify").task;
			return uglify({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/resources/**/*.js"
				}
			});
		});
	}
}

module.exports = LibraryBuilder;

const AbstractBuilder = require("../AbstractBuilder");
const tasks = { // can't require index.js due to circular dependency
	generateComponentPreload: require("../../tasks/bundlers/generateComponentPreload"),
	generateFlexChangesBundle: require("../../tasks/bundlers/generateFlexChangesBundle"),
	generateBundle: require("../../tasks/bundlers/generateBundle"),
	generateLibraryPreload: require("../../tasks/bundlers/generateLibraryPreload"),
	generateManifestBundle: require("../../tasks/bundlers/generateManifestBundle"),
	generateStandaloneAppBundle: require("../../tasks/bundlers/generateStandaloneAppBundle"),
	escapeNonAsciiCharacters: require("../../tasks/escapeNonAsciiCharacters"),
	buildThemes: require("../../tasks/buildThemes"),
	createDebugFiles: require("../../tasks/createDebugFiles"),
	generateJsdoc: require("../../tasks/jsdoc/generateJsdoc"),
	executeJsdocSdkTransformation: require("../../tasks/jsdoc/executeJsdocSdkTransformation"),
	generateLibraryManifest: require("../../tasks/generateLibraryManifest"),
	generateVersionInfo: require("../../tasks/generateVersionInfo"),
	replaceCopyright: require("../../tasks/replaceCopyright"),
	replaceVersion: require("../../tasks/replaceVersion"),
	uglify: require("../../tasks/uglify")
};

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
			return tasks.escapeNonAsciiCharacters({
				workspace: resourceCollections.workspace,
				options: {
					encoding: propertiesFileSourceEncoding,
					pattern: "/**/*.properties"
				}
			});
		});

		this.addTask("replaceCopyright", () => {
			const replaceCopyright = tasks.replaceCopyright;
			return replaceCopyright({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/resources/**/*.{js,library,less,theme}"
				}
			});
		});

		this.addTask("replaceVersion", () => {
			const replaceVersion = tasks.replaceVersion;
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
				const generateJsdoc = tasks.generateJsdoc;

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
				const executeJsdocSdkTransformation = tasks.executeJsdocSdkTransformation;

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
			const generateComponentPreload = tasks.generateComponentPreload;

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
			const generateLibraryManifest = tasks.generateLibraryManifest;
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

		this.addTask("generateLibraryPreload", () => {
			const generateLibraryPreload = tasks.generateLibraryPreload;
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
						return tasks.generateBundle({
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
			const buildThemes = tasks.buildThemes;
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
			const createDebugFiles = tasks.createDebugFiles;
			return createDebugFiles({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/resources/**/*.js"
				}
			});
		});

		this.addTask("uglify", () => {
			const uglify = tasks.uglify;
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

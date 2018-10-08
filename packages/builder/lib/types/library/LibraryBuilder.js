const AbstractBuilder = require("../AbstractBuilder");
const tasks = { // can't require index.js due to circular dependency
	generateComponentPreload: require("../../tasks/bundlers/generateComponentPreload"),
	generateFlexChangesBundle: require("../../tasks/bundlers/generateFlexChangesBundle"),
	generateBundle: require("../../tasks/bundlers/generateBundle"),
	generateLibraryPreload: require("../../tasks/bundlers/generateLibraryPreload"),
	generateManifestBundle: require("../../tasks/bundlers/generateManifestBundle"),
	generateStandaloneAppBundle: require("../../tasks/bundlers/generateStandaloneAppBundle"),
	buildThemes: require("../../tasks/buildThemes"),
	createDebugFiles: require("../../tasks/createDebugFiles"),
	generateLibraryManifest: require("../../tasks/generateLibraryManifest"),
	generateVersionInfo: require("../../tasks/generateVersionInfo"),
	replaceCopyright: require("../../tasks/replaceCopyright"),
	replaceVersion: require("../../tasks/replaceVersion"),
	uglify: require("../../tasks/uglify")
};

class LibraryBuilder extends AbstractBuilder {
	constructor({resourceCollections, project, parentLogger}) {
		super({project, parentLogger});

		// All available library tasks in execution order
		this.availableTasks = [
			"replaceCopyright",
			"replaceVersion",
			"generateComponentPreload",
			"generateBundle",
			"generateLibraryManifest",
			"generateLibraryPreload",
			"buildThemes",
			"createDebugFiles",
			"uglify"
		];

		this.addTask("replaceCopyright", () => {
			const replaceCopyright = tasks.replaceCopyright;
			return replaceCopyright({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/resources/**/*.{js,json,library}"
				}
			});
		});

		this.addTask("replaceVersion", () => {
			const replaceVersion = tasks.replaceVersion;
			return replaceVersion({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/resources/**/*.{js,json,library}"
				}
			});
		});

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
					librariesPattern: "/resources/**/*.library",
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

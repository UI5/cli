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
	generateJsdoc: require("../../tasks/jsdoc/generateJsdoc"),
	executeJsdocSdkTransformation: require("../../tasks/jsdoc/executeJsdocSdkTransformation"),
	generateLibraryManifest: require("../../tasks/generateLibraryManifest"),
	generateVersionInfo: require("../../tasks/generateVersionInfo"),
	replaceCopyright: require("../../tasks/replaceCopyright"),
	replaceVersion: require("../../tasks/replaceVersion"),
	uglify: require("../../tasks/uglify")
};

class ThemeLibraryBuilder extends AbstractBuilder {
	addStandardTasks({resourceCollections, project, log, buildContext}) {
		this.addTask("replaceCopyright", () => {
			const replaceCopyright = tasks.replaceCopyright;
			return replaceCopyright({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/resources/**/*.{less,theme}"
				}
			});
		});

		this.addTask("replaceVersion", () => {
			const replaceVersion = tasks.replaceVersion;
			return replaceVersion({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/resources/**/*.{less,theme}"
				}
			});
		});

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
	}
}

module.exports = ThemeLibraryBuilder;

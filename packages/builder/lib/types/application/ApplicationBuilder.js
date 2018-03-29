const AbstractBuilder = require("../AbstractBuilder");
const tasks = { // can't require index.js due to circular dependency
	generateAppPreload: require("../../tasks/bundlers/generateAppPreload"),
	generateFlexChangesBundle: require("../../tasks/bundlers/generateFlexChangesBundle"),
	generateLibraryPreload: require("../../tasks/bundlers/generateLibraryPreload"),
	generateManifestBundle: require("../../tasks/bundlers/generateManifestBundle"),
	generateStandaloneAppBundle: require("../../tasks/bundlers/generateStandaloneAppBundle"),
	buildThemes: require("../../tasks/buildThemes"),
	createDebugFiles: require("../../tasks/createDebugFiles"),
	generateVersionInfo: require("../../tasks/generateVersionInfo"),
	replaceCopyright: require("../../tasks/replaceCopyright"),
	replaceVersion: require("../../tasks/replaceVersion"),
	uglify: require("../../tasks/uglify")
};

class ApplicationBuilder extends AbstractBuilder {
	constructor({resourceCollections, project, parentLogger}) {
		super({project, parentLogger});

		// All available library tasks in execution order
		this.availableTasks = [
			"replaceCopyright",
			"replaceVersion",
			"createDebugFiles",
			"generateFlexChangesBundle",
			"generateManifestBundle",
			"generateAppPreload",
			"generateStandaloneAppBundle",
			"uglify",
			"generateVersionInfo"
		];

		this.addTask("replaceCopyright", () => {
			const replaceCopyright = tasks.replaceCopyright;
			return replaceCopyright({
				workspace: resourceCollections.workspace,
				options: {
					copyright: project.metadata.copyright,
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("replaceVersion", () => {
			const replaceVersion = tasks.replaceVersion;
			return replaceVersion({
				workspace: resourceCollections.workspace,
				options: {
					version: project.version,
					pattern: "/**/*.js"
				}
			});
		});

		this.addTask("createDebugFiles", () => {
			const createDebugFiles = tasks.createDebugFiles;
			return createDebugFiles({
				workspace: resourceCollections.workspace,
				options: {
					pattern: "/**/*.js"
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

		this.addTask("generateManifestBundle", () => {
			const generateManifestBundle = tasks.generateManifestBundle;
			return generateManifestBundle({
				workspace: resourceCollections.workspace,
				options: {
					namespace: project.metadata.namespace
				}
			});
		});

		this.addTask("generateAppPreload", () => {
			const generateAppPreload = tasks.generateAppPreload;
			return generateAppPreload({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					namespace: project.metadata.namespace
				}
			});
		});

		this.addTask("generateStandaloneAppBundle", () => {
			const generateStandaloneAppBundle = tasks.generateStandaloneAppBundle;
			return generateStandaloneAppBundle({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					namespace: project.metadata.namespace
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
			const generateVersionInfo = tasks.generateVersionInfo;
			return generateVersionInfo({
				workspace: resourceCollections.workspace,
				dependencies: resourceCollections.dependencies,
				options: {
					rootProject: project,
					pattern: "/**/.library"
				}
			});
		});
	}
}

module.exports = ApplicationBuilder;

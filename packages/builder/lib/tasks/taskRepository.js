const taskInfos = {
	replaceCopyright: {path: "./replaceCopyright.js"},
	replaceVersion: {path: "./replaceVersion.js"},
	replaceBuildtime: {path: "./replaceBuildtime.js"},
	escapeNonAsciiCharacters: {path: "./escapeNonAsciiCharacters.js"},
	executeJsdocSdkTransformation: {path: "./jsdoc/executeJsdocSdkTransformation.js"},
	generateApiIndex: {path: "./jsdoc/generateApiIndex.js"},
	generateJsdoc: {path: "./jsdoc/generateJsdoc.js"},
	minify: {path: "./minify.js"},
	buildThemes: {path: "./buildThemes.js"},
	transformBootstrapHtml: {path: "./transformBootstrapHtml.js"},
	generateLibraryManifest: {path: "./generateLibraryManifest.js"},
	generateVersionInfo: {path: "./generateVersionInfo.js"},
	generateManifestBundle: {path: "./bundlers/generateManifestBundle.js"},
	generateFlexChangesBundle: {path: "./bundlers/generateFlexChangesBundle.js"},
	generateComponentPreload: {path: "./bundlers/generateComponentPreload.js"},
	generateResourcesJson: {path: "./generateResourcesJson.js"},
	generateThemeDesignerResources: {path: "./generateThemeDesignerResources.js"},
	generateStandaloneAppBundle: {path: "./bundlers/generateStandaloneAppBundle.js"},
	generateBundle: {path: "./bundlers/generateBundle.js"},
	generateLibraryPreload: {path: "./bundlers/generateLibraryPreload.js"},
	generateCachebusterInfo: {path: "./generateCachebusterInfo.js"}
};

export async function getTask(taskName) {
	const taskInfo = taskInfos[taskName];

	if (!taskInfo) {
		if (["createDebugFiles", "uglify"].includes(taskName)) {
			throw new Error(
				`Standard task ${taskName} has been removed in UI5 Tooling 3.0. ` +
				`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`);
		}
		throw new Error(`taskRepository: Unknown Task ${taskName}`);
	}
	try {
		const {default: task} = await import(taskInfo.path);
		return {
			task
		};
	} catch (err) {
		throw new Error(`taskRepository: Failed to require task module for ${taskName}: ${err.message}`);
	}
}

export function getAllTaskNames() {
	return Object.keys(taskInfos);
}

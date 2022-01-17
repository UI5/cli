const test = require("ava");
const index = require("../../index");

test("index.js exports all expected modules", (t) => {
	t.truthy(index.builder, "Module exported");

	t.truthy(index.processors.flexChangesBundler, "Module exported");
	t.truthy(index.processors.manifestBundler, "Module exported");
	t.truthy(index.processors.moduleBundler, "Module exported");
	t.truthy(index.processors.apiIndexGenerator, "Module exported");
	t.truthy(index.processors.jsdocGenerator, "Module exported");
	t.truthy(index.processors.sdkTransformer, "Module exported");
	t.truthy(index.processors.bootstrapHtmlTransformer, "Module exported");
	t.truthy(index.processors.minifier, "Module exported");
	t.truthy(index.processors.nonAsciiEscaper, "Module exported");
	t.truthy(index.processors.stringReplacer, "Module exported");
	t.truthy(index.processors.themeBuilder, "Module exported");
	t.truthy(index.processors.versionInfoGenerator, "Module exported");

	t.truthy(index.tasks.generateComponentPreload, "Module exported");
	t.truthy(index.tasks.generateFlexChangesBundle, "Module exported");
	t.truthy(index.tasks.generateLibraryPreload, "Module exported");
	t.truthy(index.tasks.generateManifestBundle, "Module exported");
	t.truthy(index.tasks.generateStandaloneAppBundle, "Module exported");
	t.truthy(index.tasks.generateThemeDesignerResources, "Module exported");
	t.truthy(index.tasks.generateBundle, "Module exported");
	t.truthy(index.tasks.generateCachebusterInfo, "Module exported");
	t.truthy(index.tasks.buildThemes, "Module exported");
	t.truthy(index.tasks.minify, "Module exported");
	t.truthy(index.tasks.executeJsdocSdkTransformation, "Module exported");
	t.truthy(index.tasks.generateApiIndex, "Module exported");
	t.truthy(index.tasks.generateJsdoc, "Module exported");
	t.truthy(index.tasks.generateVersionInfo, "Module exported");
	t.truthy(index.tasks.escapeNonAsciiCharacters, "Module exported");
	t.truthy(index.tasks.replaceCopyright, "Module exported");
	t.truthy(index.tasks.replaceVersion, "Module exported");
	t.truthy(index.tasks.replaceBuildtime, "Module exported");
	t.truthy(index.tasks.transformBootstrapHtml, "Module exported");
	t.truthy(index.tasks.taskRepository, "Module exported");

	t.truthy(index.types.AbstractBuilder, "Module exported");
	t.truthy(index.types.AbstractFormatter, "Module exported");
	t.truthy(index.types.application, "Module exported");
	t.truthy(index.types.library, "Module exported");
	t.truthy(index.types.themeLibrary, "Module exported");
	t.truthy(index.types.module, "Module exported");
	t.truthy(index.types.typeRepository, "Module exported");
});

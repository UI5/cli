const test = require("ava");
const chai = require("chai");
const path = require("path");
chai.use(require("chai-fs"));

const parentLogger = require("@ui5/logger").getGroupLogger("mygroup");

const ApplicationBuilder = require("../../../../lib/types/application/ApplicationBuilder");


function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

const applicationBPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.b");
const applicationBTree = {
	id: "application.b",
	version: "1.0.0",
	path: applicationBPath,
	dependencies: [],
	builder: {
		bundles: [{
			bundleDefinition: {
				name: "application/h/sectionsA/customBundle.js",
				defaultFileTypes: [".js"],
				sections: [{
					mode: "preload",
					filters: [
						"application/h/sectionsA/",
						"!application/h/sectionsA/section2**",
					]
				}],
				sort: true
			},
			bundleOptions: {
				optimize: true,
				usePredefinedCalls: true
			}
		}],
		componentPreload: {
			paths: [
				"application/g/**/Component.js"
			]
		}
	},
	specVersion: "0.1",
	type: "application",
	metadata: {
		name: "application.b",
		namespace: "id1"
	}
};


test("Instantiation", (t) => {
	const project = clone(applicationBTree);
	const appBuilder = new ApplicationBuilder({parentLogger, project});
	t.truthy(appBuilder);
	t.deepEqual(appBuilder.taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"generateFlexChangesBundle",
		"generateManifestBundle",
		"minify",
		"generateComponentPreload",
		"generateStandaloneAppBundle",
		"transformBootstrapHtml",
		"generateBundle",
		"generateVersionInfo",
		"generateCachebusterInfo",
		"generateApiIndex",
		"generateResourcesJson"
	], "ApplicationBuilder is instantiated with standard tasks");
});

test("Instantiation without component preload project configuration", (t) => {
	const project = clone(applicationBTree);
	project.builder.componentPreload = undefined;
	const appBuilder = new ApplicationBuilder({parentLogger, project});
	t.truthy(appBuilder);
	t.deepEqual(appBuilder.taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"generateFlexChangesBundle",
		"generateManifestBundle",
		"minify",
		"generateComponentPreload",
		"generateStandaloneAppBundle",
		"transformBootstrapHtml",
		"generateBundle",
		"generateVersionInfo",
		"generateCachebusterInfo",
		"generateApiIndex",
		"generateResourcesJson"
	], "ApplicationBuilder is still instantiated with standard tasks");
});

test("Instantiation without project namespace", (t) => {
	const project = clone(applicationBTree);
	project.builder.componentPreload = undefined;
	project.metadata.namespace = undefined;
	const appBuilder = new ApplicationBuilder({parentLogger, project});
	t.truthy(appBuilder);
	t.deepEqual(appBuilder.taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"generateFlexChangesBundle",
		"minify",
		"generateStandaloneAppBundle",
		"transformBootstrapHtml",
		"generateBundle",
		"generateVersionInfo",
		"generateApiIndex",
		"generateResourcesJson"
	], "All standard tasks but generateComponentPreload will be executed");
});

test("Instantiation with custom tasks", (t) => {
	const project = clone(applicationBTree);
	project.builder.customTasks = [
		{name: "replaceVersion", afterTask: "minify"},
		{name: "minify", beforeTask: "replaceVersion"}
	];
	const appBuilder = new ApplicationBuilder({parentLogger, project});
	t.truthy(appBuilder);
	t.deepEqual(appBuilder.taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"minify--1",
		"replaceVersion",
		"generateFlexChangesBundle",
		"generateManifestBundle",
		"minify",
		"replaceVersion--1",
		"generateComponentPreload",
		"generateStandaloneAppBundle",
		"transformBootstrapHtml",
		"generateBundle",
		"generateVersionInfo",
		"generateCachebusterInfo",
		"generateApiIndex",
		"generateResourcesJson"
	], "ApplicationBuilder is still instantiated with standard tasks");
});

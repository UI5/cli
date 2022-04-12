const test = require("ava");
const path = require("path");

const parentLogger = require("@ui5/logger").getGroupLogger("mygroup");

const LibraryBuilder = require("../../../../lib/types/library/LibraryBuilder");

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

test("Instantiation", (t) => {
	const project = clone(libraryETree);
	const libraryBuilder = new LibraryBuilder({parentLogger, project});
	t.truthy(libraryBuilder);
	t.deepEqual(libraryBuilder.taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"replaceBuildtime",
		"generateJsdoc",
		"executeJsdocSdkTransformation",
		"minify",
		"generateLibraryManifest",
		"generateManifestBundle",
		"generateLibraryPreload",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "LibraryBuilder is instantiated with standard tasks");
});

test("Instantiation of project with sub-components and custom bundle", (t) => {
	const project = clone(libraryHTree);
	const libraryBuilder = new LibraryBuilder({parentLogger, project});
	t.truthy(libraryBuilder);
	t.deepEqual(libraryBuilder.taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"replaceBuildtime",
		"generateJsdoc",
		"executeJsdocSdkTransformation",
		"minify",
		"generateLibraryManifest",
		"generateManifestBundle",
		"generateComponentPreload",
		"generateLibraryPreload",
		"generateBundle",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "LibraryBuilder is instantiated with standard tasks");
});

const libraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.e");
const libraryETree = {
	id: "library.e.id",
	version: "1.0.0",
	path: libraryEPath,
	dependencies: [],
	_level: 0,
	_isRoot: true,
	specVersion: "2.0",
	type: "library",
	metadata: {
		name: "library.e",
		copyright: "some fancy copyright.",
		namespace: "library.e"
	},
	resources: {
		configuration: {
			paths: {
				src: "src",
				test: "test"
			}
		}
	}
};

const libraryHPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.h");

const libraryHTree = {
	"id": "library.h",
	"version": "1.0.0",
	"path": libraryHPath,
	"dependencies": [],
	"_level": 0,
	"_isRoot": true,
	"specVersion": "0.1",
	"type": "library",
	"metadata": {
		"name": "library.h",
		"namespace": "library/h",
		"copyright": "Some fancy copyright"
	},
	"resources": {
		"configuration": {
			"paths": {
				"src": "main/src",
				"test": "main/test"
			},
			"propertiesFileSourceEncoding": "ISO-8859-1"
		},
		"pathMappings": {
			"/resources/": "main/src",
			"/test-resources/": "main/test"
		}
	},
	"builder": {
		"bundles": [{
			"bundleDefinition": {
				"name": "library/h/customBundle.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"library/h/some.js",
						"library/h/library.js",
						"library/h/fi*.js",
						"!library/h/components/"
					],
					"resolve": false,
					"renderer": false
				}, {
					"mode": "raw",
					"filters": [
						"library/h/not.js"
					],
					"resolve": true,
					"declareModules": false,
					"sort": true,
					"renderer": false
				}]
			},
			"bundleOptions": {
				"optimize": true,
				"usePredefinedCalls": true
			}
		}, {
			"bundleDefinition": {
				"name": "library/h/customBundle-dbg.js",
				"defaultFileTypes": [".js"],
				"sections": [{
					"mode": "preload",
					"filters": [
						"library/h/some.js",
						"library/h/library.js",
						"library/h/fi*.js",
						"!library/h/components/"
					],
					"resolve": false,
					"renderer": false
				}, {
					"mode": "raw",
					"filters": [
						"library/h/not.js"
					],
					"resolve": true,
					"declareModules": false,
					"sort": true,
					"renderer": false
				}]
			},
			"bundleOptions": {
				"optimize": false,
				"usePredefinedCalls": true
			}
		}],
		"componentPreload": {
			"namespaces": [
				"library/h/components",
				"library/h/components/subcomponent1",
				"library/h/components/subcomponent2",
				"library/h/components/subcomponent3"
			]
		}
	}
};

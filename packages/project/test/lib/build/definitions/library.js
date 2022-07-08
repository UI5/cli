const test = require("ava");
const sinon = require("sinon");

const library = require("../../../../lib/build/definitions/library");

function emptyarray() {
	return [];
}

function getMockProject() {
	return {
		getName: () => "project.b",
		getNamespace: () => "project/b",
		getType: () => "library",
		getPropertiesFileSourceEncoding: () => "UTF-412",
		getCopyright: () => "copyright",
		getVersion: () => "version",
		getSpecVersion: () => "2.6",
		getMinificationExcludes: emptyarray,
		getComponentPreloadPaths: emptyarray,
		getComponentPreloadNamespaces: emptyarray,
		getComponentPreloadExcludes: emptyarray,
		getLibraryPreloadExcludes: emptyarray,
		getBundles: emptyarray,
		getCachebusterSignatureType: () => "PONY",
		getJsdocExcludes: () => [],
		getCustomTasks: emptyarray,
	};
}

test.beforeEach((t) => {
	t.context.taskUtil = {
		isRootProject: sinon.stub().returns(true),
		getBuildOption: sinon.stub(),
		getInterface: sinon.stub()
	};

	t.context.project = getMockProject();
	t.context.getTask = sinon.stub();
});

test("Standard build", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getJsdocExcludes = () => ["**.html"];

	const generateJsdocTaskStub = sinon.stub();
	getTask.returns({
		task: generateJsdocTaskStub
	});

	const tasks = library({
		project, taskUtil, getTask
	});
	const generateJsdocTaskDefinition = tasks.get("generateJsdoc");
	t.deepEqual(Object.fromEntries(tasks), {
		escapeNonAsciiCharacters: {
			options: {
				encoding: "UTF-412", pattern: "/**/*.properties"
			}
		},
		replaceCopyright: {
			options: {
				copyright: "copyright",
				pattern: "/**/*.{js,library,css,less,theme,html}"
			}
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/**/*.{js,json,library,css,less,theme,html}"
			}
		},
		replaceBuildtime: {
			options: {
				pattern: "/resources/sap/ui/Global.js"
			}
		},
		generateJsdoc: {
			requiresDependencies: true,
			taskFunction: generateJsdocTaskDefinition.taskFunction
		},
		executeJsdocSdkTransformation: {
			requiresDependencies: true,
			options: {
				dotLibraryPattern: "/resources/**/*.library"
			}
		},
		minify: {
			options: {
				pattern: [
					"/resources/**/*.js",
					"!**/*.support.js",
				]
			}
		},
		generateLibraryManifest: {},
		generateManifestBundle: {},
		generateLibraryPreload: {
			options: {
				excludes: [], skipBundles: []
			}
		},
		buildThemes: {
			requiresDependencies: true,
			options: {
				projectName: "project.b",
				librariesPattern: undefined,
				themesPattern: undefined,
				inputPattern: "/resources/project/b/themes/*/library.source.less",
				cssVariables: undefined
			}
		},
		generateThemeDesignerResources: {
			requiresDependencies: true, options: {
				version: "version"
			}
		},
		generateResourcesJson: {
			requiresDependencies: true
		}
	}, "Correct task definitions");


	await generateJsdocTaskDefinition.taskFunction({
		workspace: "workspace",
		dependencies: "dependencies",
		taskUtil,
		options: {
			projectName: "projectName"
		}
	});

	t.is(generateJsdocTaskStub.callCount, 1, "generateJsdoc task got called once");
	t.deepEqual(generateJsdocTaskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		taskUtil,
		options: {
			projectName: "projectName",
			namespace: "project/b",
			version: "version",
			pattern: [
				"/resources/**/*.js",
				"!/resources/**.html"
			],
		}
	}, "generateBundle task got called with correct arguments");

	t.is(taskUtil.getBuildOption.callCount, 1, "taskUtil#getBuildOption got called once");
	t.is(taskUtil.getBuildOption.getCall(0).args[0], "cssVariables",
		"taskUtil#getBuildOption got called with correct argument");
});

test("Standard build with legacy spec version", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => "0.1";

	const tasks = library({
		project, taskUtil, getTask
	});
	const generateJsdocTaskDefinition = tasks.get("generateJsdoc");
	t.deepEqual(Object.fromEntries(tasks), {
		escapeNonAsciiCharacters: {
			options: {
				encoding: "UTF-412", pattern: "/**/*.properties"
			}
		},
		replaceCopyright: {
			options: {
				copyright: "copyright",
				pattern: "/**/*.{js,library,css,less,theme,html}"
			}
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/**/*.{js,json,library,css,less,theme,html}"
			}
		},
		replaceBuildtime: {
			options: {
				pattern: "/resources/sap/ui/Global.js"
			}
		},
		generateJsdoc: {
			requiresDependencies: true,
			taskFunction: generateJsdocTaskDefinition.taskFunction
		},
		executeJsdocSdkTransformation: {
			requiresDependencies: true,
			options: {
				dotLibraryPattern: "/resources/**/*.library"
			}
		},
		minify: {
			options: {
				pattern: [
					"/resources/**/*.js",
					"!**/*.support.js",
				]
			}
		},
		generateLibraryManifest: {},
		generateManifestBundle: {},
		generateLibraryPreload: {
			options: {
				excludes: [], skipBundles: []
			}
		},
		buildThemes: {
			requiresDependencies: true,
			options: {
				projectName: "project.b",
				librariesPattern: undefined,
				themesPattern: undefined,
				inputPattern: "/resources/project/b/themes/*/library.source.less",
				cssVariables: undefined
			}
		},
		generateThemeDesignerResources: {
			requiresDependencies: true, options: {
				version: "version"
			}
		},
		generateResourcesJson: {
			requiresDependencies: true
		}
	}, "Correct task definitions");
});

test("Custom bundles", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getBundles = () => [{
		bundleDefinition: {
			name: "project/b/sectionsA/customBundle.js",
			defaultFileTypes: [".js"],
			sections: [{
				mode: "preload",
				filters: [
					"project/b/sectionsA/",
					"!project/b/sectionsA/section2**",
				]
			}],
			sort: true
		},
		bundleOptions: {
			optimize: true,
			usePredefinedCalls: true
		}
	}, {
		bundleDefinition: {
			name: "project/b/sectionsB/customBundle.js",
			defaultFileTypes: [".js"],
			sections: [{
				mode: "preload",
				filters: [
					"project/b/sectionsB/",
					"!project/b/sectionsB/section2**",
				]
			}],
			sort: true
		},
		bundleOptions: {
			optimize: false,
			usePredefinedCalls: true
		}
	}];

	const generateBundleTaskStub = sinon.stub();
	getTask.returns({
		task: generateBundleTaskStub
	});

	const tasks = library({
		project, taskUtil, getTask
	});
	const generateJsdocTaskDefinition = tasks.get("generateJsdoc");
	const generateBundleTaskDefinition = tasks.get("generateBundle");

	t.deepEqual(Object.fromEntries(tasks), {
		escapeNonAsciiCharacters: {
			options: {
				encoding: "UTF-412", pattern: "/**/*.properties"
			}
		},
		replaceCopyright: {
			options: {
				copyright: "copyright",
				pattern: "/**/*.{js,library,css,less,theme,html}"
			}
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/**/*.{js,json,library,css,less,theme,html}"
			}
		},
		replaceBuildtime: {
			options: {
				pattern: "/resources/sap/ui/Global.js"
			}
		},
		generateJsdoc: {
			requiresDependencies: true,
			taskFunction: generateJsdocTaskDefinition.taskFunction
		},
		executeJsdocSdkTransformation: {
			requiresDependencies: true,
			options: {
				dotLibraryPattern: "/resources/**/*.library"
			}
		},
		minify: {
			options: {
				pattern: [
					"/resources/**/*.js",
					"!**/*.support.js",
				]
			}
		},
		generateLibraryManifest: {},
		generateManifestBundle: {},
		generateLibraryPreload: {
			options: {
				excludes: [],
				skipBundles: [
					"project/b/sectionsA/customBundle.js",
					"project/b/sectionsB/customBundle.js",
				]
			}
		},
		generateBundle: {
			requiresDependencies: true,
			taskFunction: generateBundleTaskDefinition.taskFunction
		},
		buildThemes: {
			requiresDependencies: true,
			options: {
				projectName: "project.b",
				librariesPattern: undefined,
				themesPattern: undefined,
				inputPattern: "/resources/project/b/themes/*/library.source.less",
				cssVariables: undefined
			}
		},
		generateThemeDesignerResources: {
			requiresDependencies: true, options: {
				version: "version"
			}
		},
		generateResourcesJson: {
			requiresDependencies: true
		}
	}, "Correct task definitions");


	await generateBundleTaskDefinition.taskFunction({
		workspace: "workspace",
		dependencies: "dependencies",
		taskUtil,
		options: {
			projectName: "projectName"
		}
	});

	t.is(generateBundleTaskStub.callCount, 2, "generateBundle task got called twice");
	t.deepEqual(generateBundleTaskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		taskUtil,
		options: {
			projectName: "projectName",
			bundleDefinition: {
				name: "project/b/sectionsA/customBundle.js",
				defaultFileTypes: [".js"],
				sections: [{
					mode: "preload",
					filters: [
						"project/b/sectionsA/",
						"!project/b/sectionsA/section2**",
					]
				}],
				sort: true
			},
			bundleOptions: {
				optimize: true,
				usePredefinedCalls: true
			}
		}
	}, "generateBundle task got called with correct arguments");
	t.deepEqual(generateBundleTaskStub.getCall(1).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		taskUtil,
		options: {
			projectName: "projectName",
			bundleDefinition: {
				name: "project/b/sectionsB/customBundle.js",
				defaultFileTypes: [".js"],
				sections: [{
					mode: "preload",
					filters: [
						"project/b/sectionsB/",
						"!project/b/sectionsB/section2**",
					]
				}],
				sort: true
			},
			bundleOptions: {
				optimize: false,
				usePredefinedCalls: true
			}
		}
	}, "generateBundle task got called with correct arguments");
});

test("Minification excludes", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getMinificationExcludes = () => ["**.html"];

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("minify");
	t.deepEqual(taskDefinition, {
		options: {
			pattern: [
				"/resources/**/*.js",
				"!**/*.support.js",
				"!/resources/**.html",
			]
		}
	}, "Correct minify task definition");
});

test("Minification excludes not applied for legacy specVersion", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => "2.5";
	project.getMinificationExcludes = () => ["**.html"];

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("minify");
	t.deepEqual(taskDefinition, {
		options: {
			pattern: [
				"/resources/**/*.js",
				"!**/*.support.js",
			]
		}
	}, "Correct minify task definition");
});

test("generateComponentPreload with custom paths, excludes and custom bundle", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getBundles = () => [{
		bundleDefinition: {
			name: "project/b/sectionsA/customBundle.js",
			defaultFileTypes: [".js"],
			sections: [{
				mode: "preload",
				filters: [
					"project/b/sectionsA/",
					"!project/b/sectionsA/section2**",
				]
			}],
			sort: true
		},
		bundleOptions: {
			optimize: true,
			usePredefinedCalls: true
		}
	}];

	project.getComponentPreloadPaths = () => [
		"project/b/**/Component.js",
		"project/b/**/SubComponent.js"
	];
	project.getComponentPreloadExcludes = () => ["project/b/dir/**"];

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("generateComponentPreload");
	t.deepEqual(taskDefinition, {
		options: {
			paths: [
				"project/b/**/Component.js",
				"project/b/**/SubComponent.js"
			],
			namespaces: [],
			excludes: ["project/b/dir/**"],
			skipBundles: [
				"project/b/sectionsA/customBundle.js"
			]
		}
	}, "Correct generateComponentPreload task definition");
});

test("generateComponentPreload with custom namespaces and excludes", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getComponentPreloadNamespaces = () => [
		"project/b/componentA",
		"project/b/componentB"
	];
	project.getComponentPreloadExcludes = () => ["project/b/componentA/dir/**"];

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("generateComponentPreload");
	t.deepEqual(taskDefinition, {
		options: {
			paths: [],
			namespaces: [
				"project/b/componentA",
				"project/b/componentB"
			],
			excludes: ["project/b/componentA/dir/**"],
			skipBundles: []
		}
	}, "Correct generateComponentPreload task definition");
});

test("generateLibraryPreload with excludes", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getLibraryPreloadExcludes = () => ["project/b/dir/**"];

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("generateLibraryPreload");
	t.deepEqual(taskDefinition, {
		options: {
			excludes: ["project/b/dir/**"],
			skipBundles: []
		}
	}, "Correct generateLibraryPreload task definition");
});

test("buildThemes: Project is not root", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	taskUtil.isRootProject.returns(false);

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("buildThemes");
	t.deepEqual(taskDefinition, {
		requiresDependencies: true,
		options: {
			projectName: "project.b",
			librariesPattern: "/resources/**/(*.library|library.js)",
			themesPattern: "/resources/sap/ui/core/themes/*",
			inputPattern: "/resources/project/b/themes/*/library.source.less",
			cssVariables: undefined
		}
	}, "Correct buildThemes task definition");
});
test("buildThemes: CSS Variables enabled", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	taskUtil.getBuildOption.returns(true);

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("buildThemes");
	t.deepEqual(taskDefinition, {
		requiresDependencies: true,
		options: {
			projectName: "project.b",
			librariesPattern: undefined,
			themesPattern: undefined,
			inputPattern: "/resources/project/b/themes/*/library.source.less",
			cssVariables: true
		}
	}, "Correct buildThemes task definition");

	t.is(taskUtil.getBuildOption.callCount, 1, "taskUtil#getBuildOption got called once");
	t.is(taskUtil.getBuildOption.getCall(0).args[0], "cssVariables",
		"taskUtil#getBuildOption got called with correct argument");
});

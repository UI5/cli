import test from "ava";
import sinon from "sinon";
import library from "../../../../lib/build/definitions/library.js";

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
		getSpecVersion: () => {
			return {
				toString: () => "2.6",
				gte: () => true
			};
		},
		getMinificationExcludes: emptyarray,
		getComponentPreloadPaths: emptyarray,
		getComponentPreloadNamespaces: emptyarray,
		getComponentPreloadExcludes: emptyarray,
		getLibraryPreloadExcludes: emptyarray,
		getBundles: emptyarray,
		getCachebusterSignatureType: () => "PONY",
		getJsdocExcludes: () => [],
		getCustomTasks: emptyarray,
		isFrameworkProject: () => false
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
		generateBundle: {
			taskFunction: null
		},
		generateComponentPreload: {
			taskFunction: null
		},
		generateThemeDesignerResources: {
			taskFunction: null
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

test("Standard build (framework project)", (t) => {
	const {project, taskUtil, getTask} = t.context;

	project.isFrameworkProject = () => true;

	const generateJsdocTaskStub = sinon.stub();
	getTask.returns({
		task: generateJsdocTaskStub
	});

	const tasks = library({
		project, taskUtil, getTask
	});

	t.deepEqual(tasks.get("generateThemeDesignerResources"), {
		requiresDependencies: true, options: {
			version: "version"
		}
	});
});

test("Standard build with legacy spec version", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => {
		return {
			toString: () => "0.1",
			gte: () => false
		};
	};

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
		generateBundle: {
			taskFunction: null
		},
		generateComponentPreload: {
			taskFunction: null
		},
		generateThemeDesignerResources: {
			taskFunction: null
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
		generateComponentPreload: {
			taskFunction: null
		},
		generateThemeDesignerResources: {
			taskFunction: null
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

test("Minification excludes", (t) => {
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

test("Minification excludes not applied for legacy specVersion", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => {
		return {
			toString: () => "2.5",
			gte: () => false
		};
	};
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

test("generateComponentPreload with custom paths, excludes and custom bundle", (t) => {
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

test("generateComponentPreload with custom namespaces and excludes", (t) => {
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

test("generateLibraryPreload with excludes", (t) => {
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

test("buildThemes: Project is not root", (t) => {
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
test("buildThemes: CSS Variables enabled", (t) => {
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

test("Standard build: nulled taskFunction to skip tasks", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getJsdocExcludes = () => ["**.html"];

	const tasks = library({
		project, taskUtil, getTask
	});
	const generateComponentPreloadTaskDefinition = tasks.get("generateComponentPreload");
	const generateBundleTaskDefinition = tasks.get("generateBundle");
	const generateThemeDesignerResourcesTaskDefinition = tasks.get("generateThemeDesignerResources");
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
			taskFunction: async () => {},
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
		generateBundle: {
			taskFunction: null
		},
		generateComponentPreload: {
			taskFunction: null
		},
		generateThemeDesignerResources: {
			taskFunction: null
		},
		generateResourcesJson: {
			requiresDependencies: true
		}
	}, "Correct task definitions");

	t.is(generateComponentPreloadTaskDefinition.taskFunction, null, "taskFunction is explicitly set to null");
	t.is(generateBundleTaskDefinition.taskFunction, null, "taskFunction is explicitly set to null");
	t.is(generateThemeDesignerResourcesTaskDefinition.taskFunction, null, "taskFunction is explicitly set to null");
});

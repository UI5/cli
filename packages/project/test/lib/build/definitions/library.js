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
				gte: () => true,
				lt: () => true
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
	t.context.project = getMockProject();
	t.context.taskUtil = {
		getProject: sinon.stub().returns(t.context.project),
		isRootProject: sinon.stub().returns(true),
		getBuildOption: sinon.stub(),
		getInterface: sinon.stub()
	};

	t.context.getTask = sinon.stub();
});

test("Standard build", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getJsdocExcludes = () => ["**.html"];

	const tasks = library({
		project, taskUtil, getTask
	});
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
			},
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/**/*.{js,json,library,css,less,theme,html}"
			},
		},
		replaceBuildtime: {
			options: {
				pattern: "/resources/sap/ui/{Global,core/Core}.js"
			},
		},
		generateJsdoc: {
			options: {
				namespace: "project/b",
				version: "version",
				jsdocExcludes: ["**.html"]
			}
		},
		executeJsdocSdkTransformation: {
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
			},
		},
		generateLibraryManifest: {},
		enhanceManifest: {},
		generateComponentPreload: {skip: true},
		generateLibraryPreload: {
			options: {
				excludes: [], skipBundles: []
			}
		},
		generateBundle: {skip: true},
		buildThemes: {
			options: {
				projectName: "project.b",
				librariesPattern: undefined,
				themesPattern: undefined,
				inputPattern: "/resources/project/b/themes/*/library.source.less",
			}
		},
		generateThemeDesignerResources: {skip: true},
		generateResourcesJson: {}
	}, "Correct task definitions");
});

test("Standard build (framework project)", (t) => {
	const {project, taskUtil, getTask} = t.context;

	project.isFrameworkProject = () => true;

	const tasks = library({
		project, taskUtil, getTask
	});

	t.deepEqual(tasks.get("generateThemeDesignerResources"), {
		options: {
			version: "version"
		}
	});
});

test("Standard build with legacy spec version", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => {
		return {
			toString: () => "0.1",
			gte: () => false,
			lt: () => true
		};
	};

	const tasks = library({
		project, taskUtil, getTask
	});
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
			},
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/**/*.{js,json,library,css,less,theme,html}"
			},
		},
		replaceBuildtime: {
			options: {
				pattern: "/resources/sap/ui/{Global,core/Core}.js"
			},
		},
		generateJsdoc: {
			options: {
				namespace: "project/b",
				version: "version",
				jsdocExcludes: []
			}
		},
		executeJsdocSdkTransformation: {
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
			},
		},
		generateLibraryManifest: {},
		enhanceManifest: {},
		generateComponentPreload: {skip: true},
		generateLibraryPreload: {
			options: {
				excludes: [], skipBundles: []
			}
		},
		generateBundle: {skip: true},
		buildThemes: {
			options: {
				projectName: "project.b",
				librariesPattern: undefined,
				themesPattern: undefined,
				inputPattern: "/resources/project/b/themes/*/library.source.less",
			}
		},
		generateThemeDesignerResources: {skip: true},
		generateResourcesJson: {}
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
			}]
		},
		bundleOptions: {
			optimize: true,
			usePredefineCalls: true,
			addTryCatchRestartWrapper: false,
			decorateBootstrapModule: true,
			numberOfParts: 1,
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
			}]
		},
		bundleOptions: {
			optimize: false,
			usePredefineCalls: true,
			addTryCatchRestartWrapper: false,
			decorateBootstrapModule: true,
			numberOfParts: 1,
		}
	}];

	const generateBundleTaskStub = sinon.stub();
	const generateBundleFactoryStub = sinon.stub().returns({task: generateBundleTaskStub});
	getTask.returns({
		task: generateBundleFactoryStub
	});

	const tasks = library({
		project, taskUtil, getTask
	});
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
			},
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/**/*.{js,json,library,css,less,theme,html}"
			},
		},
		replaceBuildtime: {
			options: {
				pattern: "/resources/sap/ui/{Global,core/Core}.js"
			},
		},
		generateJsdoc: {
			options: {
				namespace: "project/b",
				version: "version",
				jsdocExcludes: []
			}
		},
		executeJsdocSdkTransformation: {
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
			},
		},
		generateLibraryManifest: {},
		enhanceManifest: {},
		generateComponentPreload: {skip: true},
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
			options: {
				projectName: "project.b",
				librariesPattern: undefined,
				themesPattern: undefined,
				inputPattern: "/resources/project/b/themes/*/library.source.less",
			}
		},
		generateThemeDesignerResources: {skip: true},
		generateResourcesJson: {}
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
					],
					declareRawModules: false,
					renderer: false,
					resolve: false,
					resolveConditional: false,
					sort: true,
				}]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				addTryCatchRestartWrapper: false,
				decorateBootstrapModule: true,
				numberOfParts: 1,
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
					],
					declareRawModules: false,
					renderer: false,
					resolve: false,
					resolveConditional: false,
					sort: true,
				}]
			},
			bundleOptions: {
				optimize: false,
				usePredefineCalls: true,
				addTryCatchRestartWrapper: false,
				decorateBootstrapModule: true,
				numberOfParts: 1,
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
		},
	}, "Correct minify task definition");
});

test("Minification excludes not applied for legacy specVersion", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => {
		return {
			toString: () => "2.5",
			gte: () => false,
			lt: () => true
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
		},
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
			}]
		},
		bundleOptions: {
			optimize: true,
			usePredefineCalls: true,
			addTryCatchRestartWrapper: false,
			decorateBootstrapModule: true,
			numberOfParts: 1,
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
		options: {
			projectName: "project.b",
			librariesPattern: "/resources/**/(*.library|library.js)",
			themesPattern: "/resources/sap/ui/core/themes/*",
			inputPattern: "/resources/project/b/themes/*/library.source.less",
		}
	}, "Correct buildThemes task definition");
});

test("generateLibraryManifest: specVersion 5.0, non-framework project", (t) => {
	const {project, taskUtil, getTask} = t.context;

	project.getSpecVersion = () => {
		return {
			toString: () => "5.0",
			gte: () => true,
			lt: () => false
		};
	};
	project.isFrameworkProject = () => false;

	const tasks = library({project, taskUtil, getTask});

	t.deepEqual(tasks.get("generateLibraryManifest"), {skip: true},
		"generateLibraryManifest is skipped for non-framework libraries on specVersion 5.0");
});

test("generateLibraryManifest: specVersion 5.0, framework project", (t) => {
	const {project, taskUtil, getTask} = t.context;

	project.getSpecVersion = () => {
		return {
			toString: () => "5.0",
			gte: () => true,
			lt: () => false
		};
	};
	project.isFrameworkProject = () => true;

	const tasks = library({project, taskUtil, getTask});

	t.deepEqual(tasks.get("generateLibraryManifest"), {},
		"generateLibraryManifest runs for framework libraries on specVersion 5.0");
});

test("buildThemes: CSS Variables enabled", (t) => {
	const {project, taskUtil, getTask} = t.context;
	taskUtil.getBuildOption.returns(true);

	const tasks = library({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("buildThemes");
	t.deepEqual(taskDefinition, {
		options: {
			projectName: "project.b",
			librariesPattern: undefined,
			themesPattern: undefined,
			inputPattern: "/resources/project/b/themes/*/library.source.less",
		}
	}, "Correct buildThemes task definition");
});

test("Standard build: skipped tasks use skip flag", (t) => {
	const {project, taskUtil, getTask} = t.context;

	const tasks = library({
		project, taskUtil, getTask
	});

	t.deepEqual(tasks.get("generateComponentPreload"), {skip: true},
		"generateComponentPreload is skipped when no paths or namespaces");
	t.deepEqual(tasks.get("generateBundle"), {skip: true},
		"generateBundle is skipped when no bundles");
	t.deepEqual(tasks.get("generateThemeDesignerResources"), {skip: true},
		"generateThemeDesignerResources is skipped for non-framework projects");
});

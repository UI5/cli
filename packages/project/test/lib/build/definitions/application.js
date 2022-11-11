import test from "ava";
import sinon from "sinon";
import application from "../../../../lib/build/definitions/application.js";

function emptyarray() {
	return [];
}

function getMockProject() {
	return {
		getName: () => "project.b",
		getNamespace: () => "project/b",
		getType: () => "application",
		getPropertiesFileSourceEncoding: () => "UTF-412",
		getCopyright: () => "copyright",
		getVersion: () => "version",
		getSpecVersion: () => "2.6",
		getMinificationExcludes: emptyarray,
		getComponentPreloadPaths: emptyarray,
		getComponentPreloadNamespaces: emptyarray,
		getComponentPreloadExcludes: emptyarray,
		getBundles: emptyarray,
		getCachebusterSignatureType: () => "PONY",
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

test("Standard build", (t) => {
	const {project, taskUtil, getTask} = t.context;
	const tasks = application({
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
				copyright: "copyright", pattern: "/**/*.{js,json}"
			}
		},
		replaceVersion: {
			options: {
				version: "version", pattern: "/**/*.{js,json}"
			}
		},
		minify: {
			options: {
				pattern: [
					"/**/*.js",
					"!**/*.support.js",
				]
			}
		},
		generateFlexChangesBundle: {},
		generateComponentPreload: {
			options: {
				namespaces: ["project/b"],
				excludes: [],
				skipBundles: []
			}
		},
		generateStandaloneAppBundle: {
			requiresDependencies: true
		},
		transformBootstrapHtml: {},
		generateVersionInfo: {
			requiresDependencies: true,
			options: {
				rootProject: project,
				pattern: "/resources/**/.library"
			}
		},
		generateCachebusterInfo: {
			options: {
				signatureType: "PONY"
			}
		},
		generateApiIndex: {
			requiresDependencies: true
		},
		generateResourcesJson: {
			requiresDependencies: true
		}
	}, "Correct task definitions");

	t.is(taskUtil.getBuildOption.callCount, 0, "taskUtil#getBuildOption has not been called");
});

test("Standard build with legacy spec version", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => "0.1";
	const generateBundleTaskStub = sinon.stub();
	getTask.returns({
		task: generateBundleTaskStub
	});

	const tasks = application({
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
				copyright: "copyright", pattern: "/**/*.{js,json}"
			}
		},
		replaceVersion: {
			options: {
				version: "version", pattern: "/**/*.{js,json}"
			}
		},
		minify: {
			options: {
				pattern: [
					"/**/*.js",
					"!**/*.support.js",
				]
			}
		},
		generateFlexChangesBundle: {},
		generateComponentPreload: {
			options: {
				namespaces: ["project/b"],
				excludes: [],
				skipBundles: []
			}
		},
		generateStandaloneAppBundle: {
			requiresDependencies: true
		},
		transformBootstrapHtml: {},
		generateVersionInfo: {
			requiresDependencies: true,
			options: {
				rootProject: project,
				pattern: "/resources/**/.library"
			}
		},
		generateCachebusterInfo: {
			options: {
				signatureType: "PONY"
			}
		},
		generateApiIndex: {
			requiresDependencies: true
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

	const tasks = application({
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
				copyright: "copyright", pattern: "/**/*.{js,json}"
			}
		},
		replaceVersion: {
			options: {
				version: "version", pattern: "/**/*.{js,json}"
			}
		},
		minify: {
			options: {
				pattern: [
					"/**/*.js",
					"!**/*.support.js",
				]
			}
		},
		generateFlexChangesBundle: {},
		generateComponentPreload: {
			options: {
				namespaces: ["project/b"],
				excludes: [],
				skipBundles: [
					"project/b/sectionsA/customBundle.js",
					"project/b/sectionsB/customBundle.js"
				]
			}
		},
		generateStandaloneAppBundle: {
			requiresDependencies: true
		},
		transformBootstrapHtml: {},
		generateBundle: {
			requiresDependencies: true,
			taskFunction: generateBundleTaskDefinition.taskFunction
		},
		generateVersionInfo: {
			requiresDependencies: true,
			options: {
				rootProject: project,
				pattern: "/resources/**/.library"
			}
		},
		generateCachebusterInfo: {
			options: {
				signatureType: "PONY"
			}
		},
		generateApiIndex: {
			requiresDependencies: true
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

	const tasks = application({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("minify");
	t.deepEqual(taskDefinition, {
		options: {
			pattern: [
				"/**/*.js",
				"!**/*.support.js",
				"!/resources/**.html",
			]
		}
	}, "Correct minify task definition");
});

test("Minification excludes not applied for legacy specVersion", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getSpecVersion = () => "2.5";
	project.getMinificationExcludes = () => ["**.html"];

	const tasks = application({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("minify");
	t.deepEqual(taskDefinition, {
		options: {
			pattern: [
				"/**/*.js",
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

	const tasks = application({
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

	const tasks = application({
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

test("generateComponentPreload with excludes", (t) => {
	const {project, taskUtil, getTask} = t.context;
	project.getComponentPreloadExcludes = () => ["project/b/componentA/dir/**"];

	const tasks = application({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("generateComponentPreload");
	t.deepEqual(taskDefinition, {
		options: {
			namespaces: [
				"project/b",
			],
			excludes: ["project/b/componentA/dir/**"],
			skipBundles: []
		}
	}, "Correct generateComponentPreload task definition");
});

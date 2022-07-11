const test = require("ava");
const sinon = require("sinon");

const themeLibrary = require("../../../../lib/build/definitions/themeLibrary");

function emptyarray() {
	return [];
}

function getMockProject() {
	return {
		getName: () => "project.b",
		getNamespace: () => "project/b",
		getType: () => "theme-library",
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

	const tasks = themeLibrary({
		project, taskUtil, getTask
	});
	t.deepEqual(Object.fromEntries(tasks), {
		replaceCopyright: {
			options: {
				copyright: "copyright",
				pattern: "/resources/**/*.{less,theme}"
			}
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/resources/**/*.{less,theme}"
			}
		},
		buildThemes: {
			requiresDependencies: true,
			options: {
				projectName: "project.b",
				librariesPattern: undefined,
				themesPattern: undefined,
				inputPattern: "/resources/**/themes/*/library.source.less",
				cssVariables: undefined
			}
		},
		generateThemeDesignerResources: {
			requiresDependencies: true,
			options: {
				version: "version"
			}
		},
		generateResourcesJson: {
			requiresDependencies: true
		}
	}, "Correct task definitions");

	t.is(taskUtil.getBuildOption.callCount, 1, "taskUtil#getBuildOption got called once");
	t.is(taskUtil.getBuildOption.getCall(0).args[0], "cssVariables",
		"taskUtil#getBuildOption got called with correct argument");
});

test("Standard build for non root project", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	taskUtil.isRootProject.returns(false);

	const tasks = themeLibrary({
		project, taskUtil, getTask
	});
	t.deepEqual(Object.fromEntries(tasks), {
		replaceCopyright: {
			options: {
				copyright: "copyright",
				pattern: "/resources/**/*.{less,theme}"
			}
		},
		replaceVersion: {
			options: {
				version: "version",
				pattern: "/resources/**/*.{less,theme}"
			}
		},
		buildThemes: {
			requiresDependencies: true,
			options: {
				projectName: "project.b",
				librariesPattern: "/resources/**/(*.library|library.js)",
				themesPattern: "/resources/sap/ui/core/themes/*",
				inputPattern: "/resources/**/themes/*/library.source.less",
				cssVariables: undefined
			}
		},
		generateThemeDesignerResources: {
			requiresDependencies: true,
			options: {
				version: "version"
			}
		},
		generateResourcesJson: {
			requiresDependencies: true
		}
	}, "Correct task definitions");

	t.is(taskUtil.getBuildOption.callCount, 1, "taskUtil#getBuildOption got called once");
	t.is(taskUtil.getBuildOption.getCall(0).args[0], "cssVariables",
		"taskUtil#getBuildOption got called with correct argument");
});

test("CSS variables enabled", async (t) => {
	const {project, taskUtil, getTask} = t.context;
	taskUtil.getBuildOption.returns(true);

	const tasks = themeLibrary({
		project, taskUtil, getTask
	});

	const taskDefinition = tasks.get("buildThemes");
	t.deepEqual(taskDefinition, {
		requiresDependencies: true,
		options: {
			projectName: "project.b",
			librariesPattern: undefined,
			themesPattern: undefined,
			inputPattern: "/resources/**/themes/*/library.source.less",
			cssVariables: true
		}
	}, "Correct buildThemes task definition");

	t.is(taskUtil.getBuildOption.callCount, 1, "taskUtil#getBuildOption got called once");
	t.is(taskUtil.getBuildOption.getCall(0).args[0], "cssVariables",
		"taskUtil#getBuildOption got called with correct argument");
});

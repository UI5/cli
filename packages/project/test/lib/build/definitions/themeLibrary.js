import test from "ava";
import sinon from "sinon";
import themeLibrary from "../../../../lib/build/definitions/themeLibrary.js";

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
		getSpecVersion: () => {
			return {
				toString: () => "2.6"
			};
		},
		getMinificationExcludes: emptyarray,
		getComponentPreloadPaths: emptyarray,
		getComponentPreloadNamespaces: emptyarray,
		getComponentPreloadExcludes: emptyarray,
		getLibraryPreloadExcludes: emptyarray,
		getBundles: emptyarray,
		getCachebusterSignatureType: () => "PONY",
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

test("Standard build", (t) => {
	const {project, taskUtil, getTask} = t.context;

	const tasks = themeLibrary({
		project, taskUtil, getTask
	});
	const generateThemeDesignerResourcesTaskFunction = tasks.get("generateThemeDesignerResources");
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
		generateResourcesJson: {
			requiresDependencies: true
		},
		generateThemeDesignerResources: {
			taskFunction: null
		}
	}, "Correct task definitions");

	t.is(taskUtil.getBuildOption.callCount, 1, "taskUtil#getBuildOption got called once");
	t.is(taskUtil.getBuildOption.getCall(0).args[0], "cssVariables",
		"taskUtil#getBuildOption got called with correct argument");

	t.is(generateThemeDesignerResourcesTaskFunction.taskFunction, null, "taskFunction is explicitly set to null");
});

test("Standard build (framework project)", (t) => {
	const {project, taskUtil, getTask} = t.context;

	project.isFrameworkProject = () => true;

	const tasks = themeLibrary({
		project, taskUtil, getTask
	});

	t.deepEqual(tasks.get("generateThemeDesignerResources"), {
		requiresDependencies: true, options: {
			version: "version"
		}
	});
});

test("Standard build for non root project", (t) => {
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
		generateResourcesJson: {
			requiresDependencies: true
		},
		generateThemeDesignerResources: {
			taskFunction: null
		}
	}, "Correct task definitions");

	t.is(taskUtil.getBuildOption.callCount, 1, "taskUtil#getBuildOption got called once");
	t.is(taskUtil.getBuildOption.getCall(0).args[0], "cssVariables",
		"taskUtil#getBuildOption got called with correct argument");
});

test("CSS variables enabled", (t) => {
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

const test = require("ava");
const fs = require("fs");
const path = require("path");
const esprima = require("esprima");
const ModuleInfo = require("../../../../lib/lbt/resources/ModuleInfo");
const JSModuleAnalyzer = require("../../../../lib/lbt/analyzer/JSModuleAnalyzer");

const EXPECTED_MODULE_NAME = "sap/ui/testmodule.js";

const EXPECTED_DECLARE_DEPENDENCIES = [
	"jquery.sap.global.js",
	"top/require/void.js", "top/require/var.js", "top/require/assign.js", "top/requireSync/var.js", "top/requireSync/assign.js",
	"block/require/void.js", "block/require/var.js", "block/require/assign.js", "block/requireSync/var.js", "block/requireSync/assign.js",
	"nested/scope/require/void.js", "nested/scope/require/var.js", "nested/scope/require/assign.js", "nested/scope/requireSync/var.js", "nested/scope/requireSync/assign.js",
	"nested/scope2/require/void.js", "nested/scope2/require/var.js", "nested/scope2/require/assign.js", "nested/scope2/requireSync/var.js", "nested/scope2/requireSync/assign.js"
];

const EXPECTED_DEFINE_DEPENDENCIES_NO_LEGACY = [
	"ui5loader-autoconfig.js",
	"define/arg1.js", "define/arg2.js"
];

const EXPECTED_DEFINE_DEPENDENCIES_WITH_LEGACY = [
	"jquery.sap.global.js",
	"define/arg1.js", "define/arg2.js",
	"require/arg1.js"
];

const NO_DEPENDENCIES = [];

function analyze(file, name) {
	if ( arguments.length === 1 ) {
		name = file;
	}
	return new Promise( (resolve, reject) => {
		file = path.join(__dirname, "..", "..", "..", "fixtures", "lbt", file);
		fs.readFile(file, (err, buffer) => {
			if ( err ) {
				reject(err);
			}
			try {
				const ast = esprima.parseScript(buffer.toString(), {comment: true});
				const info = new ModuleInfo(name);
				new JSModuleAnalyzer().analyze(ast, name, info);
				resolve(info);
			} catch (execErr) {
				reject(execErr);
			}
		});
	});
}

function assertModuleNamesEqual(t, actual, expected, msg) {
	actual.sort();
	expected.sort();
	t.deepEqual(actual, expected, msg);
}

function getConditionalDependencies(info) {
	return info.dependencies.filter((dep) => info.isConditionalDependency(dep));
}

function analyzeModule(
	t,
	file,
	name,
	expectedDependencies,
	expectedConditionalDependencies,
	expectedSubmodules,
	ignoreImplicitDependencies
) {
	//
	analyze(file, name).then( (info) => {
		t.is(info.name, name, "module name should match");
		let deps = info.dependencies;
		if ( ignoreImplicitDependencies ) {
			deps = deps.filter((dep) => !info.isImplicitDependency(dep));
		}
		if ( expectedDependencies != null ) {
			assertModuleNamesEqual(t,
				deps,
				expectedDependencies,
				"module dependencies should match");
		}
		if ( expectedConditionalDependencies != null ) {
			assertModuleNamesEqual(t,
				getConditionalDependencies(info),
				expectedConditionalDependencies,
				"conditional module dependencies should match");
		}
		if ( expectedSubmodules != null ) {
			assertModuleNamesEqual(t,
				info.subModules,
				expectedSubmodules,
				"submodules should match");
		}
	}).then(() => t.end(), (e) => t.fail(`failed to analyze module with error: ${e.message}`));
}

test.cb("DeclareToplevel", analyzeModule, "modules/declare_toplevel.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test.cb("DeclareFunctionExprScope", analyzeModule, "modules/declare_function_expr_scope.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test.cb("DeclareFunctionInvocationScope", analyzeModule, "modules/declare_function_invocation_scope.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test.cb("DefineToplevelNamed", analyzeModule, "modules/define_toplevel_named.js", EXPECTED_MODULE_NAME, EXPECTED_DEFINE_DEPENDENCIES_NO_LEGACY);

test.cb("DefineToplevelUnnamed", analyzeModule, "modules/define_toplevel_unnamed.js", "modules/define_toplevel_unnamed.js", EXPECTED_DEFINE_DEPENDENCIES_NO_LEGACY);

test.cb("DefineWithLegacyCalls", analyzeModule, "modules/define_with_legacy_calls.js", "modules/define_with_legacy_calls.js", EXPECTED_DEFINE_DEPENDENCIES_WITH_LEGACY);

test.cb("OldStyleModuleWithoutDeclare", function(t) {
	analyze("modules/no_declare_but_requires.js", null).then((info) => {
		t.is(info.name, null, "module name should be null");
		assertModuleNamesEqual(t,
			info.dependencies,
			["dependency1.js", "dependency2.js", "jquery.sap.global.js"],
			"dependencies should be correct");
		t.end();
	});
});

test.cb("NotAnUI5Module", analyzeModule, "modules/not_a_module.js", "modules/not_a_module.js", NO_DEPENDENCIES);

test.cb("AMDSpecialDependenciesShouldBeIgnored", (t) => {
	analyzeModule(t,
		"modules/amd_special_dependencies.js",
		"modules/amd_special_dependencies.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js", "ui5loader-autoconfig.js"],
		[],
		["utils/helper1.js", "utils/helper2.js", "utils/helper3.js"]
	);
});

test.cb("AMDMultipleModulesFirstUnnamed", (t) => {
	analyzeModule(t,
		"modules/amd_multiple_modules_first_unnamed.js",
		"modules/amd_multiple_modules_first_unnamed.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js", "ui5loader-autoconfig.js"],
		[],
		["utils/helper1.js", "utils/helper2.js"]
	);
});

test.cb("AMDMultipleModulesOtherThanFirstOneUnnamed", (t) => {
	analyzeModule(t,
		"modules/amd_multiple_modules_other_than_first_one_unnamed.js",
		"modules/amd_multiple_modules_other_than_first_one_unnamed.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js", "ui5loader-autoconfig.js"],
		[],
		["utils/helper1.js", "utils/helper2.js"]
	);
});

test.cb("AMDMultipleNamedModulesNoneMatchingFileName", (t) => {
	analyzeModule(t,
		"modules/amd_multiple_named_modules_none_matching_filename.js",
		"modules/amd_multiple_named_modules_none_matching_filename.js",
		["dep2.js", "utils/dep1.js", "ui5loader-autoconfig.js"],
		[],
		["utils/helper1.js", "utils/helper2.js", "utils/helper3.js"]
	);
});

test.cb("AMDMultipleNamedModulesOneMatchingFileName", (t) => {
	analyzeModule(t,
		"modules/amd_multiple_named_modules_one_matching_filename.js",
		"modules/amd_multiple_named_modules_one_matching_filename.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js", "ui5loader-autoconfig.js"],
		[],
		["utils/helper1.js", "utils/helper2.js"]
	);
});

test("AMDMultipleUnnamedModules", (t) =>
	analyze("modules/amd_multiple_unnamed_modules.js")
		.then(() => {
			t.fail("parsing a file with multiple unnamed modules shouldn't succeed");
		}, (err) => {
			t.true(/only one of them/.test(err.message),
				"Exception message should contain a hint on multiple unnamed modules");
		})
);

test.cb("AMDSingleNamedModule", (t) => {
	analyzeModule(t,
		"modules/amd_single_named_module.js",
		"alternative/name.js",
		["alternative/dep1.js", "dep2.js", "ui5loader-autoconfig.js"],
		[],
		[]
	);
});

test.cb("AMDSingleUnnamedModule", (t) => {
	analyzeModule(t,
		"modules/amd_single_unnamed_module.js",
		"modules/amd_single_unnamed_module.js",
		["modules/dep1.js", "dep2.js", "ui5loader-autoconfig.js"],
		[],
		[]
	);
});


test("AMDMultipleModulesWithConflictBetweenNamedAndUnnamed", (t) =>
	analyze("modules/amd_multiple_modules_with_conflict_between_named_and_unnamed.js")
		.then(() => {
			t.fail("parsing a file with conflicting modules shouldn't succeed");
		}, (err) => {
			t.is(err.message, "conflicting main modules found (unnamed + named)",
				"Exception message should contain a hint on conflicting modules");
		})
);

test("AMDMultipleModulesWithConflictBetweenUnnamedAndNamed", (t) =>
	analyze("modules/amd_multiple_modules_with_conflict_between_unnamed_and_named.js")
		.then(() => {
			t.fail("parsing a file with conflicting modules shouldn't succeed");
		}, (err) => {
			t.is(err.message, "conflicting main modules found (unnamed + named)",
				"Exception message should contain a hint on conflicting modules");
		})
);

test("AMDMultipleModulesWithConflictBetweenTwoNamed", (t) =>
	analyze("modules/amd_multiple_modules_with_conflict_between_two_named.js")
		.then(() => {
			t.fail("parsing a file with conflicting modules shouldn't succeed");
		}, (err) => {
			t.is(err.message, "conflicting main modules found (unnamed + named)",
				"Exception message should contain a hint on conflicting modules");
		})
);

test.cb("OldStyleBundle", (t) => {
	analyzeModule(t,
		"modules/bundle-oldstyle.js",
		"sap-ui-core.js",
		[],
		[],
		[
			"sap/ui/Device.js",
			"sap/ui/thirdparty/URI.js",
			"sap/ui/thirdparty/es6-promise.js",
			"sap/ui/thirdparty/jquery.js",
			"sap/ui/thirdparty/jqueryui/jquery-ui-position.js",
			"jquery.sap.global.js",
			"jquery.sap.act.js",
			"jquery.sap.encoder.js",
			"jquery.sap.events.js",
			"jquery.sap.keycodes.js",
			"sap/ui/base/DataType.js",
			"sap/ui/base/Event.js",
			"sap/ui/base/ManagedObject.js",
			"sap/ui/core/Core.js",
			"sap/ui/thirdparty/jquery-mobile-custom.js"
		],
		/* ignoreImplicitDependencies: */ true
	);
});

test.cb("OldStyleBundleV2", (t) => {
	analyzeModule(t,
		"modules/bundle-oldstyle-v2.js",
		"sap-ui-core.js",
		[],
		[],
		[
			"sap/ui/Device.js",
			"sap/ui/thirdparty/URI.js",
			"sap/ui/thirdparty/es6-promise.js",
			"sap/ui/thirdparty/jquery.js",
			"sap/ui/thirdparty/jqueryui/jquery-ui-position.js",
			"jquery.sap.global.js",
			"jquery.sap.act.js",
			"jquery.sap.encoder.js",
			"jquery.sap.events.js",
			"jquery.sap.keycodes.js",
			"sap/ui/base/DataType.js",
			"sap/ui/base/Event.js",
			"sap/ui/base/ManagedObject.js",
			"sap/ui/core/Core.js",
			"sap/ui/thirdparty/jquery-mobile-custom.js"
		],
		/* ignoreImplicitDependencies: */ true
	);
});

test.cb("EvoBundle", (t) => {
	analyzeModule(t,
		"modules/bundle-evo.js",
		"sap-ui-core.js",
		[],
		[],
		[
			"sap/ui/thirdparty/baseuri.js",
			"sap/ui/thirdparty/es6-promise.js",
			"sap/ui/thirdparty/es6-shim-nopromise.js",
			"ui5loader.js",
			"ui5loader-autoconfig.js",
			"jquery.sap.global.js",
			"jquery.sap.stubs.js",
			"sap/base/Log.js",
			"sap/base/assert.js",
			"sap/ui/base/DataType.js",
			"sap/ui/base/Event.js",
			"sap/ui/base/ManagedObject.js",
			"sap/ui/core/Core.js",
			"sap/ui/thirdparty/URI.js",
			"sap/ui/thirdparty/jqueryui/jquery-ui-position.js",
			"sap/ui/Device.js",
			"sap/ui/thirdparty/jquery.js",
			"sap/ui/thirdparty/jquery-mobile-custom.js"
		],
		/* ignoreImplicitDependencies: */ true
	);
});

test("Bundle", (t) => {
	return analyze("modules/bundle.js").then( (info) => {
		const expected = [
			"sap/m/CheckBox.js",
			"sap/ui/core/Core.js",
			"todo/Component.js",
			"todo/controller/App.controller.js",
			"sap/m/messagebundle.properties",
			"todo/manifest.json",
			"todo/model/todoitems.json",
			"todo/view/App.view.xml"
		];
		t.deepEqual(info.subModules, expected, "module dependencies should match");
		t.truthy(info.dependencies.every((dep) => !info.isConditionalDependency(dep)), "none of the dependencies must be 'conditional'");
	});
});

test("ES6 Syntax", (t) => {
	return analyze("modules/es6-syntax.js", "modules/es6-syntax.js").then( (info) => {
		const expected = [
			"conditional/module1.js",
			"conditional/module2.js",
			"conditional/module3.js",
			"static/module1.js",
			"static/module2.js",
			"static/module3.js",
			"static/module4.js",
			"static/module5.js",
			"static/module6.js",
			"static/module7.js",
			"ui5loader-autoconfig.js"
		];
		const actual = info.dependencies.sort();
		t.deepEqual(actual, expected, "module dependencies should match");
		expected.forEach((dep) => {
			t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
				"only dependencies to 'conditional/*' modules should be conditional");
			t.is(info.isImplicitDependency(dep), !/^(?:conditional|static)\//.test(dep),
				"all dependencies other than 'conditional/*' and 'static/*' should be implicit");
		});
	});
});


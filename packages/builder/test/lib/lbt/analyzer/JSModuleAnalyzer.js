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
				const info = analyzeString(buffer.toString(), name);
				resolve(info);
			} catch (execErr) {
				reject(execErr);
			}
		});
	});
}

function analyzeString(content, name) {
	const ast = esprima.parseScript(content, {comment: true});
	const info = new ModuleInfo(name);
	new JSModuleAnalyzer().analyze(ast, name, info);
	return info;
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
	ignoreImplicitDependencies,
	rawModule
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
		t.false(info.dynamicDependencies,
			"no use of dynamic dependencies should have been detected");
		if (rawModule) {
			t.true(info.rawModule,
				"raw module");
		} else {
			t.false(info.rawModule,
				"ui5 module");
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
		t.true(info.rawModule, "raw module");
		assertModuleNamesEqual(t,
			info.dependencies,
			["dependency1.js", "dependency2.js", "jquery.sap.global.js"],
			"dependencies should be correct");
		t.end();
	});
});

test.cb("NotAnUI5Module", analyzeModule, "modules/not_a_module.js", "modules/not_a_module.js", NO_DEPENDENCIES, NO_DEPENDENCIES, NO_DEPENDENCIES, NO_DEPENDENCIES, true);

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
		[
			"jquery.sap.dom.js",
			"jquery.sap.script.js",
			"sap/ui/base/Object.js",
			"sap/ui/base/BindingParser.js",
			"sap/ui/base/EventProvider.js",
			"sap/ui/base/ManagedObjectMetadata.js",
			"sap/ui/model/BindingMode.js",
			"sap/ui/model/CompositeBinding.js",
			"sap/ui/model/Context.js",
			"sap/ui/model/FormatException.js",
			"sap/ui/model/ListBinding.js",
			"sap/ui/model/Model.js",
			"sap/ui/model/ParseException.js",
			"sap/ui/model/TreeBinding.js",
			"sap/ui/model/Type.js",
			"sap/ui/model/ValidateException.js",
			"jquery.sap.strings.js",
			"sap/ui/Global.js",
			"sap/ui/base/Interface.js",
			"sap/ui/core/Component.js",
			"sap/ui/core/Configuration.js",
			"sap/ui/core/Control.js",
			"sap/ui/core/Element.js",
			"sap/ui/core/ElementMetadata.js",
			"sap/ui/core/FocusHandler.js",
			"sap/ui/core/RenderManager.js",
			"sap/ui/core/ResizeHandler.js",
			"sap/ui/core/ThemeCheck.js",
			"sap/ui/core/UIArea.js",
			"sap/ui/core/message/MessageManager.js",
			"jquery.sap.mobile.js",
			"jquery.sap.properties.js",
			"jquery.sap.resources.js",
			"jquery.sap.sjax.js"
		],
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
		[
			"jquery.sap.dom.js",
			"jquery.sap.script.js",
			"sap/ui/base/Object.js",
			"sap/ui/base/BindingParser.js",
			"sap/ui/base/EventProvider.js",
			"sap/ui/base/ManagedObjectMetadata.js",
			"sap/ui/model/BindingMode.js",
			"sap/ui/model/CompositeBinding.js",
			"sap/ui/model/Context.js",
			"sap/ui/model/FormatException.js",
			"sap/ui/model/ListBinding.js",
			"sap/ui/model/Model.js",
			"sap/ui/model/ParseException.js",
			"sap/ui/model/TreeBinding.js",
			"sap/ui/model/Type.js",
			"sap/ui/model/ValidateException.js",
			"jquery.sap.strings.js",
			"sap/ui/Global.js",
			"sap/ui/base/Interface.js",
			"sap/ui/core/Component.js",
			"sap/ui/core/Configuration.js",
			"sap/ui/core/Control.js",
			"sap/ui/core/Element.js",
			"sap/ui/core/ElementMetadata.js",
			"sap/ui/core/FocusHandler.js",
			"sap/ui/core/RenderManager.js",
			"sap/ui/core/ResizeHandler.js",
			"sap/ui/core/ThemeCheck.js",
			"sap/ui/core/UIArea.js",
			"sap/ui/core/message/MessageManager.js",
			"jquery.sap.mobile.js",
			"jquery.sap.properties.js",
			"jquery.sap.resources.js",
			"jquery.sap.sjax.js"
		],
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
		[
			"sap/base/util/now.js",
			"sap/base/util/Version.js",
			"sap/ui/dom/getComputedStyleFix.js",
			"sap/ui/dom/activeElementFix.js",
			"sap/ui/dom/includeScript.js",
			"sap/ui/dom/includeStylesheet.js",
			"sap/ui/core/support/Hotkeys.js",
			"sap/ui/security/FrameOptions.js",
			"sap/ui/performance/Measurement.js",
			"sap/ui/performance/trace/Interaction.js",
			"sap/ui/base/syncXHRFix.js",
			"sap/base/util/LoaderExtensions.js",
			"sap/base/util/defineLazyProperty.js",
			"sap/base/util/ObjectPath.js",
			"sap/base/util/isPlainObject.js",
			"sap/ui/base/Object.js",
			"sap/ui/base/BindingParser.js",
			"sap/ui/base/EventProvider.js",
			"sap/ui/base/ManagedObjectMetadata.js",
			"sap/ui/model/BindingMode.js",
			"sap/ui/model/StaticBinding.js",
			"sap/ui/model/CompositeBinding.js",
			"sap/ui/model/Context.js",
			"sap/ui/model/FormatException.js",
			"sap/ui/model/ParseException.js",
			"sap/ui/model/Type.js",
			"sap/ui/model/ValidateException.js",
			"sap/ui/base/SyncPromise.js",
			"sap/ui/util/ActivityDetection.js",
			"sap/base/util/deepClone.js",
			"sap/base/util/deepEqual.js",
			"sap/base/util/uid.js",
			"sap/ui/Global.js",
			"sap/ui/base/Interface.js",
			"sap/ui/core/Component.js",
			"sap/ui/core/Configuration.js",
			"sap/ui/core/Control.js",
			"sap/ui/core/Element.js",
			"sap/ui/core/ElementMetadata.js",
			"sap/ui/core/FocusHandler.js",
			"sap/ui/core/RenderManager.js",
			"sap/ui/core/ResizeHandler.js",
			"sap/ui/core/ThemeCheck.js",
			"sap/ui/core/UIArea.js",
			"sap/ui/core/message/MessageManager.js",
			"sap/ui/dom/getScrollbarSize.js",
			"sap/base/i18n/ResourceBundle.js",
			"sap/base/util/array/uniqueSort.js",
			"sap/ui/performance/trace/initTraces.js",
			"sap/base/util/isEmptyObject.js",
			"sap/base/util/each.js",
			"sap/ui/events/jquery/EventSimulation.js"
		],
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
		t.false(info.rawModule,
			"ui5 module");
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
			t.false(info.dynamicDependencies,
				"no use of dynamic dependencies should have been detected");
			t.false(info.rawModule,
				"ui5 module");
		});
	});
});

test("Dynamic import (declare/require)", (t) => {
	return analyze("modules/declare_dynamic_require.js").then((info) => {
		t.true(info.dynamicDependencies,
			"the use of dynamic dependencies should have been detected");
		t.false(info.rawModule,
			"ui5 module");
	});
});

test("Dynamic import (define/require)", (t) => {
	return analyze("modules/amd_dynamic_require.js").then((info) => {
		t.true(info.dynamicDependencies,
			"the use of dynamic dependencies should have been detected");
		t.false(info.rawModule,
			"ui5 module");
	});
});

test("Dynamic import (define/requireSync)", (t) => {
	return analyze("modules/amd_dynamic_require_sync.js").then((info) => {
		t.true(info.dynamicDependencies,
			"the use of dynamic dependencies should have been detected");
		t.false(info.rawModule,
			"ui5 module");
	});
});

test("Nested require", (t) => {
	const content = `
(function(deps, callback) {
	function doIt(array, callback) {
		callback();
	}

	var aArray = [];
	doIt(aArray, function() {
		doIt(["foo"], function() {
			doIt(["bar"], function() {
				// nested sap.ui.require
				sap.ui.require(deps, callback);
			});
		});
	});
}([
	"my/dependency"
], function(myDep) {
	console.log("done")
}));`;
	const info = analyzeString(content, "modules/nestedRequire.js");
	t.true(info.rawModule, "raw module");
});

test("Toplevel define", (t) => {
	const content = `
(function() {
	function defineMyFile() {
		sap.ui.define('def/MyFile', ['dep/myDep'],
			function(myDep) {
				return 47;
			});
	}

	// conditional
	if (!(window.sap && window.sap.ui && window.sap.ui.define)) {
		var fnHandler = function() {
			defineMyFile();
		};
		my.addEventListener("myevent", fnHandler);
	} else {
		defineMyFile();
	}
}()); `;
	const info = analyzeString(content, "modules/functionDefine.js");
	t.true(info.rawModule, "raw module");
});

test("Invalid ui5 bundle comment", (t) => {
	const content = `/@ui5-bundles sap/ui/thirdparty/xxx.js
if(!('xxx'in Node.prototype)){}
//@ui5-bundle-raw-includes sap/ui/thirdparty/aaa.js
(function(g,f){g.AAA=f();}(this,(function(){})));
sap.ui.define("my/module", ["sap/ui/core/UIComponent"],function(n){"use strict";return 47+n});`;
	const info = analyzeString(content, "modules/bundle-evo_invalid_comment.js");
	t.is(info.name, "my/module.js",
		"module name matches");
	t.deepEqual(info.subModules, [],
		"no submodules");
});

test("Declare two times", (t) => {
	const content = `jQuery.sap.declare("sap.ui.testmodule");
sap.ui.testmodule.load = function(modName) {
	jQuery.sap.require(modName);
};
jQuery.sap.declare("sap.ui.testmodule");`;
	const info = analyzeString(content, "modules/declare_times_two.js");
	t.is(info.name, "sap/ui/testmodule.js",
		"module name matches");
	t.deepEqual(info.subModules, [],
		"no submodules");
});

test("Declare dynamic name", (t) => {
	const content = `var sCommonName = "sap.ui"
jQuery.sap.declare(sCommonName + ".testmodule");

sap.ui.testmodule.load = function(modName) {
	jQuery.sap.require(modName);
};`;
	const info = analyzeString(content, "modules/dynamic_name.js");
	t.is(info.name, "modules/dynamic_name.js",
		"module name matches");
	t.deepEqual(info.subModules, [],
		"no submodules");
});

test("jQuery.sap.registerPreloadedModules (with Identifier)", (t) => {
	const content = `
var data = {};
jQuery.sap.registerPreloadedModules(data);
`;
	const info = analyzeString(content, "modules/registerPreloadedModules-Identifier.js");
	t.deepEqual(info.subModules, [],
		"no submodules");
});

test("jQuery.sap.registerPreloadedModules (with ObjectExpression)", (t) => {
	const content = `
jQuery.sap.registerPreloadedModules({
	"modules": {
		"foo.bar": ""
	}
});
`;
	const info = analyzeString(content, "modules/registerPreloadedModules-ObjectExpression.js");
	t.deepEqual(info.subModules, ["foo/bar.js"],
		"submodule from jQuery.sap.registerPreloadedModules");
});

test("jQuery.sap.registerPreloadedModules (with ObjectExpression, version 1.0)", (t) => {
	const content = `
jQuery.sap.registerPreloadedModules({
	"modules": {
		"foo.bar": ""
	},
	"version": "1.0"
});
`;
	const info = analyzeString(content, "modules/registerPreloadedModules-ObjectExpression.js");
	t.deepEqual(info.subModules, ["foo/bar.js"],
		"submodule from jQuery.sap.registerPreloadedModules");
});

test("jQuery.sap.registerPreloadedModules (with ObjectExpression, version 2.0)", (t) => {
	const content = `
jQuery.sap.registerPreloadedModules({
	"modules": {
		"foo/bar.js": ""
	},
	"version": "2.0"
});
`;
	const info = analyzeString(content, "modules/registerPreloadedModules-ObjectExpression.js");
	t.deepEqual(info.subModules, ["foo/bar.js"],
		"submodule from jQuery.sap.registerPreloadedModules");
});

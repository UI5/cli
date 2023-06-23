import test from "ava";

import fs from "node:fs";
import path from "node:path";
import {ecmaVersion, parseJS, VisitorKeys} from "../../../../lib/lbt/utils/parseUtils.js";
import ModuleInfo from "../../../../lib/lbt/resources/ModuleInfo.js";
import JSModuleAnalyzer, {EnrichedVisitorKeys} from "../../../../lib/lbt/analyzer/JSModuleAnalyzer.js";

import {fileURLToPath} from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_MODULE_NAME = "sap/ui/testmodule.js";

const EXPECTED_DECLARE_DEPENDENCIES = [
	"top/require/void.js", "top/require/var.js", "top/require/assign.js", "top/requireSync/var.js",
	"top/requireSync/assign.js", "block/require/void.js", "block/require/var.js", "block/require/assign.js",
	"block/requireSync/var.js", "block/requireSync/assign.js", "nested/scope/require/void.js",
	"nested/scope/require/var.js", "nested/scope/require/assign.js", "nested/scope/requireSync/var.js",
	"nested/scope/requireSync/assign.js", "nested/scope2/require/void.js", "nested/scope2/require/var.js",
	"nested/scope2/require/assign.js", "nested/scope2/requireSync/var.js", "nested/scope2/requireSync/assign.js"
];

const EXPECTED_DEFINE_DEPENDENCIES_NO_LEGACY = [
	"define/arg1.js", "define/arg2.js"
];

const EXPECTED_DEFINE_DEPENDENCIES_WITH_LEGACY = [
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
	const ast = parseJS(content, {comment: true});
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

async function analyzeModule(
	t,
	file,
	name,
	expectedDependencies,
	expectedConditionalDependencies,
	expectedSubmodules,
	rawModule
) {
	//
	return analyze(file, name).then( (info) => {
		t.is(info.name, name, "module name should match");
		const deps = info.dependencies;

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
	}); // .then(() => t.end(), (e) => t.fail(`failed to analyze module with error: ${e.message}`));
}

test("Check for consistency between VisitorKeys and EnrichedVisitorKeys", (t) => {
	// This test is supposed to run and might fail when a new ecmaVersion is configured to be used
	// and not all new VisitorKeys are handled by the EnrichedVisitorKeys.

	// After updating the ecmaVersion in parseUtils, this test runs and should be fixed by adding
	// the relevant keys within JSModuleAnalyzer or ignoring them (e.g. like JSX*).

	// Only then, the if-clause below should be changed to the new ecmaVersion to prevent the test
	// from failing when new VisitorKeys are available via espree.

	if (ecmaVersion > 2022) {
		Object.keys(VisitorKeys).forEach( (type) => {
			// Ignore deprecated keys:
			// - ExperimentalSpreadProperty => SpreadElement
			// - ExperimentalRestProperty => RestElement
			// They are about to be removed, see: https://github.com/eslint/eslint-visitor-keys/pull/36
			if (type === "ExperimentalSpreadProperty" || type === "ExperimentalRestProperty") {
				return;
			}

			// Ignore JSX visitor-keys because they aren't used.
			if (type.startsWith("JSX")) {
				return;
			}

			t.not(EnrichedVisitorKeys[type], undefined, `unknown estree node type '${type}', new syntax?`);
		});
	} else {
		t.pass("ecmaVersion is not updated. Skipping test");
	}
});

test("DeclareToplevel", analyzeModule,
	"modules/declare_toplevel.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test("DeclareFunctionExprScope", analyzeModule,
	"modules/declare_function_expr_scope.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test("DeclareFunctionInvocationScope", analyzeModule,
	"modules/declare_function_invocation_scope.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test("DefineToplevelNamed", analyzeModule,
	"modules/define_toplevel_named.js", EXPECTED_MODULE_NAME, EXPECTED_DEFINE_DEPENDENCIES_NO_LEGACY);

test("DefineToplevelUnnamed", analyzeModule,
	"modules/define_toplevel_unnamed.js", "modules/define_toplevel_unnamed.js", EXPECTED_DEFINE_DEPENDENCIES_NO_LEGACY);

test("DefineWithLegacyCalls", analyzeModule,
	"modules/define_with_legacy_calls.js", "modules/define_with_legacy_calls.js",
	EXPECTED_DEFINE_DEPENDENCIES_WITH_LEGACY);

test("OldStyleModuleWithoutDeclare", async function(t) {
	await analyze("modules/no_declare_but_requires.js", null).then((info) => {
		t.is(info.name, null, "module name should be null");
		t.true(info.rawModule, "raw module");
		assertModuleNamesEqual(t,
			info.dependencies,
			["dependency1.js", "dependency2.js"],
			"dependencies should be correct");
	});
});

test("NotAnUI5Module", analyzeModule,
	"modules/not_a_module.js", "modules/not_a_module.js",
	NO_DEPENDENCIES, NO_DEPENDENCIES, NO_DEPENDENCIES, NO_DEPENDENCIES, true);

test("AMDSpecialDependenciesShouldBeIgnored", async (t) => {
	await analyzeModule(t,
		"modules/amd_special_dependencies.js",
		"modules/amd_special_dependencies.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js"],
		[],
		["utils/helper1.js", "utils/helper2.js", "utils/helper3.js"]
	);
});

test("AMDMultipleModulesFirstUnnamed", async (t) => {
	await analyzeModule(t,
		"modules/amd_multiple_modules_first_unnamed.js",
		"modules/amd_multiple_modules_first_unnamed.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js"],
		[],
		["utils/helper1.js", "utils/helper2.js"]
	);
});

test("AMDMultipleModulesOtherThanFirstOneUnnamed", async (t) => {
	await analyzeModule(t,
		"modules/amd_multiple_modules_other_than_first_one_unnamed.js",
		"modules/amd_multiple_modules_other_than_first_one_unnamed.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js"],
		[],
		["utils/helper1.js", "utils/helper2.js"]
	);
});

test("AMDMultipleNamedModulesNoneMatchingFileName", async (t) => {
	await analyzeModule(t,
		"modules/amd_multiple_named_modules_none_matching_filename.js",
		"modules/amd_multiple_named_modules_none_matching_filename.js",
		["dep2.js", "utils/dep1.js"],
		[],
		["utils/helper1.js", "utils/helper2.js", "utils/helper3.js"]
	);
});

test("AMDMultipleNamedModulesOneMatchingFileName", async (t) => {
	await analyzeModule(t,
		"modules/amd_multiple_named_modules_one_matching_filename.js",
		"modules/amd_multiple_named_modules_one_matching_filename.js",
		["modules/dep1.js", "dep2.js", "utils/dep1.js"],
		[],
		["utils/helper1.js", "utils/helper2.js"]
	);
});

test("AMDMultipleUnnamedModules", async (t) => {
	try {
		await analyze("modules/amd_multiple_unnamed_modules.js");
		t.fail("parsing a file with multiple unnamed modules shouldn't succeed");
	} catch (error) {
		t.regex(error.message, /only one of them/,
			"Exception message should contain a hint on multiple unnamed modules");
	}
});

test("AMDSingleNamedModule", async (t) => {
	await analyzeModule(t,
		"modules/amd_single_named_module.js",
		"alternative/name.js",
		["alternative/dep1.js", "dep2.js"],
		[],
		[]
	);
});

test("AMDSingleUnnamedModule", async (t) => {
	await analyzeModule(t,
		"modules/amd_single_unnamed_module.js",
		"modules/amd_single_unnamed_module.js",
		["modules/dep1.js", "dep2.js"],
		[],
		[]
	);
});


test("AMDMultipleModulesWithConflictBetweenNamedAndUnnamed", async (t) => {
	try {
		await analyze("modules/amd_multiple_modules_with_conflict_between_named_and_unnamed.js");
		t.fail("parsing a file with conflicting modules shouldn't succeed");
	} catch (error) {
		t.is(error.message, "Conflicting main modules found (unnamed + named)",
			"Exception message should contain a hint on conflicting modules");
	}
});

test("AMDMultipleModulesWithConflictBetweenUnnamedAndNamed", async (t) => {
	try {
		await analyze("modules/amd_multiple_modules_with_conflict_between_unnamed_and_named.js");
		t.fail("parsing a file with conflicting modules shouldn't succeed");
	} catch (error) {
		t.is(error.message, "Conflicting main modules found (unnamed + named)",
			"Exception message should contain a hint on conflicting modules");
	}
});

test("AMDMultipleModulesWithConflictBetweenTwoNamed", async (t) => {
	try {
		await analyze("modules/amd_multiple_modules_with_conflict_between_two_named.js");
		t.fail("parsing a file with conflicting modules shouldn't succeed");
	} catch (error) {
		t.is(error.message, "Conflicting main modules found (unnamed + named)",
			"Exception message should contain a hint on conflicting modules");
	}
});

test("OldStyleBundle", async (t) => {
	await analyzeModule(t,
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
		]
	);
});

test("OldStyleBundleV2", async (t) => {
	await analyzeModule(t,
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
		]
	);
});

test("EvoBundle", async (t) => {
	await analyzeModule(t,
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
		]
	);
});

test("Bundle", async (t) => {
	const info = await analyze("modules/bundle.js");
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
	t.truthy(info.dependencies.every((dep) => !info.isConditionalDependency(dep)),
		"none of the dependencies must be 'conditional'");
	t.false(info.rawModule,
		"ui5 module");
});

test("ES6 Syntax", async (t) => {
	const info = await analyze("modules/es6-syntax.js", "modules/es6-syntax.js");

	const expected = [
		"conditional/module1.js",
		"conditional/module10.js",
		"conditional/module11.js",
		"conditional/module2.js",
		"conditional/module3.js",
		"conditional/module4.js",
		"conditional/module6.js",
		"conditional/module7.js",
		"conditional/module8.js",
		"conditional/module9.js",
		"static/module1.js",
		"static/module11.js",
		"static/module12.js",
		"static/module13.js",
		"static/module14.js",
		"static/module2.js",
		"static/module3.js",
		"static/module4.js",
		"static/module5.js",
		"static/module6.js",
		"static/module7.js",
		"static/module8.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.false(info.dynamicDependencies,
			`no use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("ES6 Syntax (with dynamic dependencies)", async (t) => {
	const info = await analyze(
		"modules/es6-syntax-dynamic-dependencies.js",
		"modules/es6-syntax-dynamic-dependencies.js");
	const expected = [
		"static/module1.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.true(info.dynamicDependencies,
			`use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("ES6 Async Module", async (t) => {
	const info = await analyze("modules/es6-async-module.js", "modules/es6-async-module.js");
	const expected = [
		"static/module1.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.false(info.dynamicDependencies,
			`no use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("ES6 Template Literal", async (t) => {
	const info = await analyze("modules/es6-template-literal.js", "modules/es6-template-literal.js");
	const expected = [
		"static/module1.js",
		"static/module2.js",
		"static/module3.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.false(info.dynamicDependencies,
			`no use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("ES6 Template Literal with Expression", async (t) => {
	const info = await analyze("modules/es6-template-literal-with-expression.js",
		"modules/es6-template-literal-with-expression.js");
	const expected = [
		"static/module1.js",
		"static/module2.js",
		"static/module3.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.true(info.dynamicDependencies,
			`use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("ES6 Template Literal in sap.ui.predefine", async (t) => {
	const info = await analyze("modules/es6-template-literal-predefine.js",
		"modules/es6-template-literal-predefine.js");
	const expected = [
		"static/module1.js",
		"static/module2.js",
		"static/module3.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.false(info.dynamicDependencies,
			`no use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("ChainExpression", (t) => {
	const content = `
	sap.ui.define(['require', 'static/module1'], (require) => {
		sap?.ui?.require?.(['conditional/module2']);
		sap?.ui?.requireSync?.('conditional/module3');
		jQuery?.sap?.require?.('conditional.module4');
		require?.(['conditional/module5']);
	});`;
	const info = analyzeString(content, "modules/ChainExpression.js");

	const expected = [
		"conditional/module2.js",
		"conditional/module3.js",
		"conditional/module4.js",
		"conditional/module5.js",
		"static/module1.js",
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
	});
	t.false(info.dynamicDependencies,
		`no use of dynamic dependencies should have been detected`);
	t.false(info.rawModule,
		`ui5 module`);
});

test("LogicalExpression", (t) => {
	const content = `
	sap.ui.define(['require', 'static/module1'], (require, module1) => {
		module1 && sap.ui.require(['conditional/module2']);
		module1 || sap.ui.requireSync('conditional/module3');
		module1 ?? jQuery.sap.require('conditional.module4');
		!module1 && require(['conditional/module5']);

		sap.ui.require(['static/module2']) && module1;
		sap.ui.requireSync('static/module3') || module1;
		jQuery.sap.require('static.module4') ?? module1;
		require(['static/module5']) && module1;
	});`;
	const info = analyzeString(content, "modules/LogicalExpression.js");

	const expected = [
		"conditional/module2.js",
		"conditional/module3.js",
		"conditional/module4.js",
		"conditional/module5.js",
		"static/module1.js",
		"static/module2.js",
		"static/module3.js",
		"static/module4.js",
		"static/module5.js",
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
	});
	t.false(info.dynamicDependencies,
		`no use of dynamic dependencies should have been detected`);
	t.false(info.rawModule,
		`ui5 module`);
});

test("ES2022: PrivateIdentifier, PropertyDefinition, StaticBlock", (t) => {
	const content = `
	sap.ui.define(['require', 'static/module1'], (require) => {

		class TestES2022 {

			// Eager dependencies

			static {
				const staticModule2 = sap.ui.requireSync('static/module2');
			}

			static publicStaticField = sap.ui.requireSync('static/module3');
			static #privateStaticField = sap.ui.requireSync('static/module4');
			static [sap.ui.requireSync('static/module5')] = "module5";

			// Even though the field is on instance level, the computed key is evaluated when the class is declared
			[sap.ui.requireSync('static/module6')] = "module6";

			// Conditional dependencies

			publicField = sap.ui.requireSync('conditional/module1');
			#privateField = sap.ui.requireSync('conditional/module2');

			#privateMethod() {
				sap.ui.requireSync('conditional/module3')
			}

			static #privateStaticMethod() {
				sap.ui.requireSync('conditional/module4')
			}

		}

	});`;
	const info = analyzeString(content, "modules/ES2022.js");

	const expected = [
		"conditional/module1.js",
		"conditional/module2.js",
		"conditional/module3.js",
		"conditional/module4.js",
		"static/module1.js",
		"static/module2.js",
		"static/module3.js",
		"static/module4.js",
		"static/module5.js",
		"static/module6.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
	});
	t.false(info.dynamicDependencies,
		`no use of dynamic dependencies should have been detected`);
	t.false(info.rawModule,
		`ui5 module`);
});

test("Dynamic import (declare/require)", async (t) => {
	const info = await analyze("modules/declare_dynamic_require.js");
	t.true(info.dynamicDependencies,
		"the use of dynamic dependencies should have been detected");
	t.false(info.rawModule,
		"ui5 module");
});

test("Conditional import (declare/require)", async (t) => {
	const info = await analyze("modules/declare_require_conditional.js",
		"modules/declare_require_conditional.js");
	const expected = [
		"conditional/module1.js",
		"conditional/module2.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.false(info.dynamicDependencies,
			`no use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("Dynamic import (declare/require/conditional)", async (t) => {
	const info = await analyze("modules/declare_dynamic_require_conditional.js",
		"modules/declare_dynamic_require_conditional.js");
	const expected = [
		"conditional/module1.js"
	];
	const actual = info.dependencies.sort();
	t.deepEqual(actual, expected, "module dependencies should match");
	expected.forEach((dep) => {
		t.is(info.isConditionalDependency(dep), /^conditional\//.test(dep),
			`only dependencies to 'conditional/*' modules should be conditional (${dep})`);
		t.true(info.dynamicDependencies,
			`use of dynamic dependencies should have been detected (${dep})`);
		t.false(info.rawModule,
			`ui5 module (${dep})`);
	});
});

test("Dynamic import (define/require)", async (t) => {
	const info = await analyze("modules/amd_dynamic_require.js");
	t.true(info.dynamicDependencies,
		"the use of dynamic dependencies should have been detected");
	t.false(info.rawModule,
		"ui5 module");
});

test("Dynamic import (define/requireSync)", async (t) => {
	const info = await analyze("modules/amd_dynamic_require_sync.js");
	t.true(info.dynamicDependencies,
		"the use of dynamic dependencies should have been detected");
	t.false(info.rawModule,
		"ui5 module");
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
	const content = `//@ui5-bundles sap/ui/thirdparty/xxx.js
if(!('xxx'in Node.prototype)){}
//@ui5-bundle-raw-includes sap/ui/thirdparty/aaa.js
(function(g,f){g.AAA=f();}(this,(function(){})));
sap.ui.define("my/module", ["sap/ui/core/UIComponent"],function(n){return 47+n});`;
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

test("jQuery.sap.registerPreloadedModules (with ObjectExpression, version 1.0 and SpreadExpression)", (t) => {
	const content = `
jQuery.sap.registerPreloadedModules({
	"modules": {
		...foo
	},
	"version": "1.0"
});
`;
	const info = analyzeString(content, "modules/registerPreloadedModules-ObjectExpression.js");
	t.deepEqual(info.subModules, [],
		"submodule from jQuery.sap.registerPreloadedModules are empty");
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

test("jQuery.sap.registerPreloadedModules (with ObjectExpression, version 2.0 and SpreadExpression)", (t) => {
	const content = `
jQuery.sap.registerPreloadedModules({
	"modules": {
		...foo
	},
	"version": "2.0"
});
`;
	const info = analyzeString(content, "modules/registerPreloadedModules-ObjectExpression.js");
	t.deepEqual(info.subModules, [],
		"submodule from jQuery.sap.registerPreloadedModules are empty");
});

test("Module that contains jQuery.sap.declare should be derived as subModule", (t) => {
	const content = `
sap.ui.define([], function() {
	jQuery.sap.declare("foo.bar");
});
`;
	const info = analyzeString(content, "modules/module-with-jquery-sap-declare.js");
	t.is(info.name, "modules/module-with-jquery-sap-declare.js");
	t.is(info.rawModule, false);
	t.is(info.format, "ui5-declare"); // FIXME: Format should actually be ui5-define
	t.is(info.requiresTopLevelScope, false);
	t.deepEqual(info.subModules, ["foo/bar.js"],
		"jQuery.sap.declare subModule should be detected");
});

test("Bundle that contains jQuery.sap.declare (sap.ui.predefine) should not be derived as module name", (t) => {
	const content = `//@ui5-bundle test1/library-preload.js
sap.ui.predefine("test1/module1", [], function() {
	jQuery.sap.declare("foo.bar");
});
`;
	const info = analyzeString(content, "modules/bundle-with-jquery-sap-declare.js");
	t.is(info.name, "test1/library-preload.js", "Module name should be taken from @ui5-bundle comment");
	t.is(info.rawModule, false);
	t.is(info.format, "ui5-declare"); // FIXME: Format should actually be ui5-define
	t.is(info.requiresTopLevelScope, false);
	// Note: foo/bar.js is not listed as the predefine body is not analyzed
	t.deepEqual(info.subModules, ["test1/module1.js"],
		"subModule via sap.ui.predefine should be detected");
});

test("Bundle that contains jQuery.sap.declare (sap.ui.require.preload) should not be derived as module name", (t) => {
	const content = `//@ui5-bundle test1/library-preload.js
sap.ui.require.preload({
	"test1/module1.js": function() {
		sap.ui.define([], function() {
			jQuery.sap.declare("foo.bar");
		});
	}
});

`;
	const info = analyzeString(content, "modules/bundle-with-jquery-sap-declare.js");
	t.is(info.name, "test1/library-preload.js", "Module name should be taken from @ui5-bundle comment");
	t.is(info.rawModule, false);
	t.is(info.format, "ui5-define");
	t.is(info.requiresTopLevelScope, false);
	// Note: foo/bar.js is not listed as the sap.ui.define body is not analyzed
	t.deepEqual(info.subModules, ["test1/module1.js"],
		"subModule via sap.ui.predefine should be detected");
});

test("@ui5-bundle comment: Multiple comments", (t) => {
	const content = `//@ui5-bundle test/bundle1.js
//@ui5-bundle test/bundle2.js
`;
	const info = analyzeString(content, "modules/ui5-bundle-comments.js");
	t.is(info.name, "test/bundle1.js", "Comment from first line should be used");
	t.deepEqual(info.subModules, []);
	t.deepEqual(info.dependencies, []);
});

test("@ui5-bundle comment: Multiple comments (Not in first line)", (t) => {
	const content = `console.log('Foo');
//@ui5-bundle test/bundle1.js
//@ui5-bundle test/bundle2.js
`;
	t.throws(() => analyzeString(content, "modules/ui5-bundle-comments.js"), {
		message: "Conflicting main modules found (unnamed + named)"
	});
});

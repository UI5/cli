const {test} = require("ava");
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

const EXPECTED_DEFINE_DEPENDENCIES = [
	"ui5loader-autoconfig.js",
	"define/arg1.js", "define/arg2.js"
];

const NO_DEPENDENCIES = [];

function analyze(file, name) {
	return new Promise( (resolve, reject) => {
		file = path.join(__dirname, "..", "..", "..", "fixtures", "lbt", file);
		fs.readFile(file, (err, buffer) => {
			if ( err ) {
				reject(err);
			}
			const ast = esprima.parseScript(buffer.toString());
			const info = new ModuleInfo(name);
			new JSModuleAnalyzer().analyze(ast, name, info);
			resolve( info );
		});
	});
}

function analyzeModule(t, file, name, expectedDependencies, expectDocumentation) {
	analyze(file, name).then( (info) => {
		t.is(info.name, name, "module name should match");
		// if ( expectDocumentation !== false ) {
		// 	t.assertNotNull(info.description, "module should have documentation");
		// 	t.assertTrue(info.description.indexOf("declares") >= 0, "module documentation should match", );
		// }
		const expected = expectedDependencies.sort();
		const actual = info.dependencies.sort();
		t.deepEqual(actual, expected, "module dependencies should match");
		t.truthy(info.dependencies.every((dep) => !info.isConditionalDependency(dep)), "none of the dependencies must be 'conditional'");
		t.end();
	});
}


test.cb("DeclareToplevel", analyzeModule, "modules/declare_toplevel.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test.cb("DeclareFunctionExprScope", analyzeModule, "modules/declare_function_expr_scope.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test.cb("DeclareFunctionInvocationScope", analyzeModule, "modules/declare_function_invocation_scope.js", EXPECTED_MODULE_NAME, EXPECTED_DECLARE_DEPENDENCIES);

test.cb("DefineToplevelNamed", analyzeModule, "modules/define_toplevel_named.js", EXPECTED_MODULE_NAME, EXPECTED_DEFINE_DEPENDENCIES);

test.cb("DefineToplevelUnnamed", analyzeModule, "modules/define_toplevel_unnamed.js", "modules/define_toplevel_unnamed.js", EXPECTED_DEFINE_DEPENDENCIES);

test.cb("NotAnUI5Module", analyzeModule, "modules/not_a_module.js", "modules/not_a_module.js", NO_DEPENDENCIES, false);


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

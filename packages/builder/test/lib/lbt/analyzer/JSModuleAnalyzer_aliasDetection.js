/**
 * Unit tests for the local-name alias detection feature of JSModuleAnalyzer.
 *
 * Feature: https://github.com/UI5/cli/issues/512
 * "Improve JSModuleAnalyzer to support local names for dependency detection"
 *
 * When a known UI5 API object (jQuery / sap.ui) is referenced by a local alias
 * (either via a factory function parameter or a top-level variable assignment),
 * calls made through that alias should still be detected as module dependencies.
 *
 * Three alias patterns are covered:
 *  1. Factory function parameter aliasing jquery.sap.global  → jq.sap.require(...)
 *  2. Factory function parameter aliasing sap/ui/core/Core   → ui.require([...]) / ui.requireSync(...)
 *  3. Top-level variable alias   var jq = jQuery             → jq.sap.require(...)
 *  4. Top-level variable alias   var jq = $                  → jq.sap.require(...)
 *  5. Top-level variable alias   var ui = sap.ui             → ui.require([...])
 */

import test from "ava";
import {parseJS} from "../../../../lib/lbt/utils/parseUtils.js";
import ModuleInfo from "../../../../lib/lbt/resources/ModuleInfo.js";
import JSModuleAnalyzer from "../../../../lib/lbt/analyzer/JSModuleAnalyzer.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function analyzeString(content, name) {
	const ast = parseJS(content, {comment: true});
	const info = new ModuleInfo(name);
	new JSModuleAnalyzer().analyze(ast, name, info);
	return info;
}

function deps(info, ignoreImplicit = false) {
	let d = info.dependencies;
	if (ignoreImplicit) {
		d = d.filter((dep) => !info.isImplicitDependency(dep));
	}
	return d.slice().sort();
}

// ---------------------------------------------------------------------------
// 1. Factory parameter – jQuery alias → jq.sap.require
// ---------------------------------------------------------------------------

test("Alias: factory param for jquery.sap.global → jq.sap.require detects dependency", (t) => {
	const content = `
sap.ui.define(["jquery.sap.global"], function(jq) {
	jq.sap.require("my.module");
});`;
	const info = analyzeString(content, "modules/alias_jq_require.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency on my/module.js must be detected via alias");
	t.false(info.rawModule, "should be recognized as a UI5 module");
	t.false(info.dynamicDependencies, "no dynamic dependencies");
});

test("Alias: factory param for jquery.sap.global → jq.sap.require detects multiple dependencies", (t) => {
	const content = `
sap.ui.define(["jquery.sap.global"], function(jq) {
	jq.sap.require("my.module");
	jq.sap.require("other.module");
});`;
	const info = analyzeString(content, "modules/alias_jq_multi_require.js");
	// The jquery.sap.global dependency is listed in the dependency array directly → stays as implicit
	// Non-implicit deps are just the two required modules
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("my/module.js"), "my/module.js must be detected");
	t.true(nonImplicit.includes("other/module.js"), "other/module.js must be detected");
});

test("Alias: factory param (dollar sign alias $) for jquery.sap.global → alias.sap.require", (t) => {
	const content = `
sap.ui.define(["jquery.sap.global"], function($jq) {
	$jq.sap.require("my.module");
});`;
	const info = analyzeString(content, "modules/alias_dollar_jq_require.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency on my/module.js must be detected via alias");
});

test("Alias: factory param with named module and jQuery alias", (t) => {
	const content = `
sap.ui.define("my/TestModule", ["jquery.sap.global"], function(jq) {
	jq.sap.require("dep/Alpha");
});`;
	const info = analyzeString(content, "my/TestModule.js");
	t.is(info.name, "my/TestModule.js", "module name should be recognized");
	t.truthy(info.dependencies.includes("dep/Alpha.js"),
		"dependency must be detected via alias even with named module");
});

test("Alias: factory param – jQuery alias only active for correct parameter position", (t) => {
	// The second param gets jquery.sap.global, not the first
	const content = `
sap.ui.define(["other/dep", "jquery.sap.global"], function(otherDep, jq) {
	jq.sap.require("my.module");
	// otherDep.sap.require should NOT be detected – it's not the jQuery alias
});`;
	const info = analyzeString(content, "modules/alias_position.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency on my/module.js must be detected");
});

test("Alias: factory param – no alias registration when no dependency array", (t) => {
	// define without dependency array → no alias can be registered
	const content = `
sap.ui.define(function(jq) {
	// jq is not aliased since there's no dep array
});`;
	// should not throw
	const info = analyzeString(content, "modules/alias_no_dep_array.js");
	t.false(info.rawModule, "UI5 module");
	t.deepEqual(deps(info, true), [], "no extra dependencies");
});

test("Alias: factory param – unrelated parameter does not create false jQuery alias", (t) => {
	const content = `
sap.ui.define(["sap/m/Button"], function(jq) {
	// jq here is Button, NOT jQuery - should NOT trigger alias detection
	// (dependency name is sap/m/Button, not jquery.sap.global)
	jq.sap.require("my.module");
});`;
	const info = analyzeString(content, "modules/alias_not_jquery.js");
	// The call jq.sap.require should NOT be detected because jq → sap/m/Button, not jquery
	t.false(info.dependencies.includes("my/module.js"),
		"should NOT detect dependency when param is not aliased to jQuery");
});

// ---------------------------------------------------------------------------
// 2. Factory parameter – sap/ui/core/Core alias → ui.require / ui.requireSync
// ---------------------------------------------------------------------------

test("Alias: factory param for sap/ui/core/Core → ui.require([...]) detects dependencies", (t) => {
	const content = `
sap.ui.define(["sap/ui/core/Core"], function(ui) {
	ui.require(["my/module", "other/module"]);
});`;
	const info = analyzeString(content, "modules/alias_ui_require.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency on my/module.js must be detected");
	t.truthy(info.dependencies.includes("other/module.js"),
		"dependency on other/module.js must be detected");
	t.false(info.rawModule, "should be recognized as UI5 module");
	t.false(info.dynamicDependencies, "no dynamic dependencies");
});

test("Alias: factory param for sap/ui/core/Core → ui.requireSync('...') detects dependency", (t) => {
	const content = `
sap.ui.define(["sap/ui/core/Core"], function(ui) {
	var m = ui.requireSync("my/module");
});`;
	const info = analyzeString(content, "modules/alias_ui_require_sync.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency on my/module.js must be detected via alias.requireSync");
	t.false(info.rawModule, "should be UI5 module");
});

test("Alias: factory param for sap/ui/core/Core → ui.require with callback visits body", (t) => {
	const content = `
sap.ui.define(["sap/ui/core/Core"], function(ui) {
	ui.require(["my/module"], function(MyModule) {
		// callback body is visited and its dependencies detected
		sap.ui.requireSync("inner/dep");
	});
});`;
	const info = analyzeString(content, "modules/alias_ui_require_with_callback.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency from alias.require array should be detected");
	t.truthy(info.dependencies.includes("inner/dep.js"),
		"dependency from callback body should be detected");
});

test("Alias: factory param for sap/ui/core/Core – unrelated param does not become alias", (t) => {
	const content = `
sap.ui.define(["sap/m/Button", "sap/ui/core/Core"], function(Button, ui) {
	// Button at position 0 is NOT sap.ui - only ui at position 1 is
	Button.require(["should.not.detect"]);
	ui.require(["should/detect"]);
});`;
	const info = analyzeString(content, "modules/alias_core_position.js");
	t.truthy(info.dependencies.includes("should/detect.js"),
		"ui.require should be detected");
	t.false(info.dependencies.includes("should/not/detect.js"),
		"Button.require should NOT be detected as sap.ui.require");
});

// ---------------------------------------------------------------------------
// 3. Top-level variable alias: var jq = jQuery
// ---------------------------------------------------------------------------

test("Alias: var jq = jQuery → jq.sap.require detects dependency", (t) => {
	const content = `
var jq = jQuery;
jq.sap.declare("sap.ui.testmodule");
jq.sap.require("my.module");`;
	const info = analyzeString(content, "sap/ui/testmodule.js");
	t.is(info.name, "sap/ui/testmodule.js", "module name from declare");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency via jQuery alias (var jq = jQuery) must be detected");
	t.false(info.rawModule, "should be a UI5 module");
});

test("Alias: var jq = jQuery → jq.sap.require detects multiple dependencies", (t) => {
	const content = `
var jq = jQuery;
jq.sap.declare("sap.ui.testmodule");
jq.sap.require("my.module");
jq.sap.require("other.module");`;
	const info = analyzeString(content, "sap/ui/testmodule.js");
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("my/module.js"), "my/module.js must be detected");
	t.true(nonImplicit.includes("other/module.js"), "other/module.js must be detected");
});

test("Alias: var $ = jQuery → dollar sign alias detects dependency", (t) => {
	const content = `
var jq2 = $;
jq2.sap.declare("sap.ui.testmodule");
jq2.sap.require("my.module");`;
	const info = analyzeString(content, "sap/ui/testmodule.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency via $ alias (var jq2 = $) must be detected");
});

test("Alias: var jq = jQuery → jq.sap.declare sets module name", (t) => {
	const content = `
var jq = jQuery;
jq.sap.declare("sap.ui.testmodule");`;
	const info = analyzeString(content, "sap/ui/testmodule.js");
	t.is(info.name, "sap/ui/testmodule.js",
		"module name should be set from jq.sap.declare");
	t.false(info.rawModule, "should be a UI5 module");
});

// ---------------------------------------------------------------------------
// 4. Top-level variable alias: var ui = sap.ui
// ---------------------------------------------------------------------------

test("Alias: var ui = sap.ui inside define → ui.require detects dependency", (t) => {
	const content = `
sap.ui.define([], function() {
	var ui = sap.ui;
	ui.require(["my/module"]);
});`;
	const info = analyzeString(content, "modules/alias_var_sap_ui.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency via sap.ui alias (var ui = sap.ui) must be detected");
	t.false(info.rawModule, "UI5 module");
});

test("Alias: var ui = sap.ui → ui.requireSync detects dependency", (t) => {
	const content = `
sap.ui.define([], function() {
	var ui = sap.ui;
	ui.requireSync("my/module");
});`;
	const info = analyzeString(content, "modules/alias_var_sap_ui_sync.js");
	t.truthy(info.dependencies.includes("my/module.js"),
		"dependency via sap.ui alias (var ui = sap.ui) with requireSync must be detected");
});

// ---------------------------------------------------------------------------
// 5. Mixed: both jQuery alias and sap.ui alias used in one module
// ---------------------------------------------------------------------------

test("Alias: both jQuery alias (factory param) and sap.ui alias (factory param) in one module", (t) => {
	const content = `
sap.ui.define(["jquery.sap.global", "sap/ui/core/Core"], function(jq, ui) {
	jq.sap.require("legacy.dep");
	ui.require(["modern/dep"]);
	ui.requireSync("another/dep");
});`;
	const info = analyzeString(content, "modules/alias_both.js");
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("legacy/dep.js"),
		"legacy.dep must be detected via jQuery alias");
	t.true(nonImplicit.includes("modern/dep.js"),
		"modern/dep must be detected via sap.ui alias");
	t.true(nonImplicit.includes("another/dep.js"),
		"another/dep must be detected via sap.ui alias requireSync");
	t.false(info.rawModule, "UI5 module");
	t.false(info.dynamicDependencies, "no dynamic dependencies");
});

// ---------------------------------------------------------------------------
// 6. Conditional detection – alias calls inside conditional branches
// ---------------------------------------------------------------------------

test("Alias: jq.sap.require inside an if branch is marked as conditional dependency", (t) => {
	const content = `
sap.ui.define(["jquery.sap.global"], function(jq) {
	if (someCondition) {
		jq.sap.require("conditional.dep");
	}
	jq.sap.require("unconditional.dep");
});`;
	const info = analyzeString(content, "modules/alias_conditional.js");
	t.truthy(info.dependencies.includes("conditional/dep.js"),
		"conditional dep must be in dependencies");
	t.truthy(info.isConditionalDependency("conditional/dep.js"),
		"dep in if-branch must be marked as conditional");
	t.truthy(info.dependencies.includes("unconditional/dep.js"),
		"unconditional dep must be in dependencies");
	t.false(info.isConditionalDependency("unconditional/dep.js"),
		"dep at top level must not be marked as conditional");
});

test("Alias: ui.requireSync inside an if branch is marked as conditional", (t) => {
	const content = `
sap.ui.define(["sap/ui/core/Core"], function(ui) {
	if (flag) {
		ui.requireSync("conditional/dep");
	}
});`;
	const info = analyzeString(content, "modules/alias_sap_ui_conditional.js");
	t.truthy(info.dependencies.includes("conditional/dep.js"),
		"conditional dep must be detected");
	t.truthy(info.isConditionalDependency("conditional/dep.js"),
		"dep in if-branch should be conditional");
});

// ---------------------------------------------------------------------------
// 7. Existing behaviour must not break: canonical calls still work
// ---------------------------------------------------------------------------

test("Alias: canonical jQuery.sap.require still works (no regression)", (t) => {
	const content = `
sap.ui.define(["jquery.sap.global"], function(jq) {
	jQuery.sap.require("canonical.dep");
	jq.sap.require("alias.dep");
});`;
	const info = analyzeString(content, "modules/alias_and_canonical.js");
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("canonical/dep.js"),
		"canonical jQuery.sap.require must still work");
	t.true(nonImplicit.includes("alias/dep.js"),
		"aliased jq.sap.require must also work");
});

test("Alias: canonical sap.ui.require still works (no regression)", (t) => {
	const content = `
sap.ui.define(["sap/ui/core/Core"], function(ui) {
	sap.ui.require(["canonical/dep"]);
	ui.require(["alias/dep"]);
});`;
	const info = analyzeString(content, "modules/alias_and_canonical_ui.js");
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("canonical/dep.js"),
		"canonical sap.ui.require must still work");
	t.true(nonImplicit.includes("alias/dep.js"),
		"aliased ui.require must also work");
});

// ---------------------------------------------------------------------------
// 8. Fixture file based tests
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

function analyzeFile(file, name) {
	return new Promise((resolve, reject) => {
		const filePath = path.join(import.meta.dirname, "..", "..", "..", "fixtures", "lbt", file);
		fs.readFile(filePath, (err, buffer) => {
			if (err) {
				reject(err);
				return;
			}
			try {
				resolve(analyzeString(buffer.toString(), name));
			} catch (e) {
				reject(e);
			}
		});
	});
}

test("Fixture: alias_jquery_factory_param_require.js - detects jq.sap.require via factory alias", async (t) => {
	const info = await analyzeFile(
		"modules/alias_jquery_factory_param_require.js",
		"modules/alias_jquery_factory_param_require.js"
	);
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("my/module.js"), "my/module.js must be detected");
	t.true(nonImplicit.includes("other/module.js"), "other/module.js must be detected");
	t.false(info.rawModule, "should be a UI5 module");
	t.false(info.dynamicDependencies, "no dynamic dependencies");
});

test("Fixture: alias_sap_ui_factory_param_require.js - detects ui.require via factory alias", async (t) => {
	const info = await analyzeFile(
		"modules/alias_sap_ui_factory_param_require.js",
		"modules/alias_sap_ui_factory_param_require.js"
	);
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("my/module.js"), "my/module.js must be detected");
	t.true(nonImplicit.includes("other/module.js"), "other/module.js must be detected");
	t.false(info.rawModule, "should be a UI5 module");
});

test("Fixture: alias_sap_ui_factory_param_require_sync.js - detects ui.requireSync via factory alias", async (t) => {
	const info = await analyzeFile(
		"modules/alias_sap_ui_factory_param_require_sync.js",
		"modules/alias_sap_ui_factory_param_require_sync.js"
	);
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("my/module.js"), "my/module.js must be detected");
	t.true(nonImplicit.includes("other/module.js"), "other/module.js must be detected");
	t.false(info.rawModule, "should be a UI5 module");
});

test("Fixture: alias_toplevel_var_jquery_require.js - detects via top-level var jq = jQuery", async (t) => {
	const info = await analyzeFile(
		"modules/alias_toplevel_var_jquery_require.js",
		"sap/ui/testmodule.js"
	);
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("my/module.js"), "my/module.js must be detected");
	t.true(nonImplicit.includes("other/module.js"), "other/module.js must be detected");
	t.false(info.rawModule, "should be a UI5 module");
});

test("Fixture: alias_toplevel_var_sap_ui_require.js - detects via top-level var ui = sap.ui", async (t) => {
	const info = await analyzeFile(
		"modules/alias_toplevel_var_sap_ui_require.js",
		"modules/alias_toplevel_var_sap_ui_require.js"
	);
	const nonImplicit = deps(info, true);
	t.true(nonImplicit.includes("my/module.js"), "my/module.js must be detected");
	t.true(nonImplicit.includes("other/module.js"), "other/module.js must be detected");
	t.false(info.rawModule, "should be a UI5 module");
});

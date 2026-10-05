import test from "ava";
import {registerHooks} from "node:module";

// Discovering a step-based task's steps imports only the factory module, never the processor module graph
// its step bodies use. The TaskRunner calls each factory once per build at plan time, before the cache
// decides whether any step runs; a build whose steps are all cache hits never runs a step body, so the
// heavy processors (minify's worker pool, buildThemes' less-openui5 workers, the manifest and less
// generators) must stay unloaded. These assertions check that contract at the import boundary: load the
// factory module, call its factory, and confirm the processor module was not loaded.

const loadedUrls = [];

test.before(() => {
	// Synchronous in-thread load hook: record the URL of every module loaded, then delegate.
	registerHooks({
		load(url, context, nextLoad) {
			loadedUrls.push(url);
			return nextLoad(url, context);
		},
	});
});

// Imports a task factory module, calls its factory, and returns the URLs of the modules loaded while doing
// so. Each test targets a distinct task module, so the import is a fresh load and its hook fires.
async function discoverSteps(taskPath, options) {
	loadedUrls.length = 0;
	const {default: build} = await import(new URL(taskPath, import.meta.url).href);
	const steps = await build(options);
	return {steps, loads: loadedUrls.join("\n")};
}

test.serial("minify: discovering steps imports the factory, not the minifier", async (t) => {
	const {steps, loads} = await discoverSteps("../../../lib/tasks/minify.js", {pattern: "/**"});

	t.true(steps.length > 0, "The factory returned at least one step");
	t.regex(loads, /tasks\/minify\.js/, "The factory module was imported");
	t.notRegex(loads, /processors\/minifier\.js/,
		"The minifier processor was not imported while discovering steps");
});

test.serial("buildThemes: discovering steps imports the factory, not the less-openui5 theme builder", async (t) => {
	const {steps, loads} = await discoverSteps("../../../lib/tasks/buildThemes.js", {
		projectName: "test.lib", inputPattern: "/**/themes/*/library.source.less",
	});

	t.true(steps.length > 0, "The factory returned at least one step");
	t.regex(loads, /tasks\/buildThemes\.js/, "The factory module was imported");
	// The theme builder pulls in the heavy less-openui5 graph; it is loaded lazily inside the worker, so
	// discovering steps must not load it. The light worker module and workerpool do load (the worker module
	// is a static import for the main-thread fs bridge and the worker registration).
	t.notRegex(loads, /processors\/themeBuilder\.js/,
		"The less-openui5 theme builder was not imported while discovering steps");
});

test.serial("enhanceManifest: discovering steps imports the factory, not the manifest enhancer", async (t) => {
	const {steps, loads} = await discoverSteps("../../../lib/tasks/enhanceManifest.js", {
		projectNamespace: "test/lib",
	});

	t.true(steps.length > 0, "The factory returned at least one step");
	t.regex(loads, /tasks\/enhanceManifest\.js/, "The factory module was imported");
	t.notRegex(loads, /processors\/manifestEnhancer\.js/,
		"The manifest enhancer was not imported while discovering steps");
});

test.serial(
	"generateThemeDesignerResources: discovering steps imports the factory, not the less generator",
	async (t) => {
		const {steps, loads} = await discoverSteps(
			"../../../lib/tasks/generateThemeDesignerResources.js", {
				projectName: "test.lib", projectNamespace: "test/lib",
			});

		t.true(steps.length > 0, "The factory returned at least one step");
		t.regex(loads, /tasks\/generateThemeDesignerResources\.js/, "The factory module was imported");
		t.notRegex(loads, /processors\/libraryLessGenerator\.js/,
			"The less generator was not imported while discovering steps");
	});

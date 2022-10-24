import test from "ava";
import FsAdapter from "../../lib/adapters/FileSystem.js";

// Create readerWriter before running tests
test.beforeEach((t) => {
	t.context.readerWriter = {
		filesystem: new FsAdapter({
			fsBasePath: "./test/fixtures/glob",
			virBasePath: "/test-resources/"
		})
	};
});

function matchGlobResult(t, resources, expectedResources) {
	t.deepEqual(resources.length, expectedResources.length, "Amount of files matches expected result.");

	const matchedResources = resources.map((resource) => {
		return resource.getPath();
	});

	for (let i = 0; i < expectedResources.length; i++) {
		const expectedResource = expectedResources[i];
		t.true(
			matchedResources.indexOf(expectedResource) !== -1,
			"File '" + expectedResource + "' was found."
		);
	}
}

// From FileSystem
test("glob all", async (t) => {
	const resources = await t.context.readerWriter.filesystem.byGlob("/**/*.*");

	t.is(resources.length, 16, "Found all resources");
});

test("glob all from root only", async (t) => {
	t.plan(2);

	const resources = await t.context.readerWriter.filesystem.byGlob("/*/*.*");

	matchGlobResult(t, resources, ["/test-resources/package.json"]);
});

test("glob all with virtual base path fully matching", async (t) => {
	t.plan(1);

	const resources = await t.context.readerWriter.filesystem.byGlob("/test-resources/**/*.*");

	t.is(resources.length, 16, "Found all resources");
});

test("glob with virtual base path partially matching", async (t) => {
	t.plan(1);

	const adapter = new FsAdapter({
		fsBasePath: "./test/fixtures/glob/application.a",
		virBasePath: "/test-resources/application/a/"
	});

	const resources = await adapter.byGlob("/test-resources/**/*.*");

	t.is(resources.length, 4, "Found all resources");
});

test("Check for unstable order of glob result", async (t) => {
	t.plan(1);

	const resources = await t.context.readerWriter.filesystem.byGlob("/**/*.*");

	const firstMatch = resources.map((resource) => {
		return resource.getPath();
	});

	async function readNext(tries) {
		const resources = await t.context.readerWriter.filesystem.byGlob("/**/*.*");
		const nextMatch = resources.map((resource) => {
			return resource.getPath();
		});
		let foundDifference = false;
		for (let i = 0; i < firstMatch.length; i++) {
			if (firstMatch[i] !== nextMatch[i]) {
				foundDifference = true;
			}
		}

		if (!foundDifference && tries > 0) {
			return readNext(--tries);
		} else {
			return nextMatch;
		}
	}

	const nextMatch = await readNext(100);

	t.notDeepEqual(nextMatch, firstMatch, "Result sets are of unstable order");
});

test("glob with multiple patterns", async (t) => {
	t.plan(5);

	const resources =
		await t.context.readerWriter.filesystem.byGlob(["/**/*.yaml", "/test-resources/**/i18n_de.properties"]);

	const expectedResources = [
		"/test-resources/application.b/webapp/i18n/i18n_de.properties",
		"/test-resources/application.b/webapp/embedded/i18n/i18n_de.properties",
		"/test-resources/application.b/ui5.yaml",
		"/test-resources/application.a/ui5.yaml"
	];

	matchGlobResult(t, resources, expectedResources);
});

test("glob only a specific filetype (yaml)", async (t) => {
	t.plan(2);

	const resources = await t.context.readerWriter.filesystem.byGlob("/**/*.yaml");

	resources.forEach((res) => {
		t.is(res._name, "ui5.yaml");
	});
});

test("glob two specific filetype (yaml and js)", async (t) => {
	t.plan(4);

	const resources = await t.context.readerWriter.filesystem.byGlob("/**/*.{yaml,js}");

	const expectedResources = [
		"/test-resources/application.a/webapp/test.js",
		"/test-resources/application.b/ui5.yaml",
		"/test-resources/application.a/ui5.yaml"
	];

	matchGlobResult(t, resources, expectedResources);
});

test("glob only a specific filetype (json) with exclude pattern", async (t) => {
	t.plan(2);

	const resources = await t.context.readerWriter.filesystem.byGlob([
		"/**/*.json",
		"!/**/*package.json"
	]);

	resources.forEach((res) => {
		t.is(res._name, "manifest.json");
	});
});

test("glob only a specific filetype (json) with multiple exclude pattern", async (t) => {
	t.plan(2);

	const resources = await t.context.readerWriter.filesystem.byGlob([
		"/**/*.json",
		"!/**/*package.json",
		"!/**/embedded/manifest.json"
	]);

	matchGlobResult(t, resources, ["/test-resources/application.b/webapp/manifest.json"]);
});

test("glob (normalized) root directory (=> fs root)", async (t) => {
	t.plan(2);

	const resources = await t.context.readerWriter.filesystem.byGlob([
		"/*/",
	], {nodir: false});

	resources.forEach((res) => {
		t.is(res._name, "test-resources");
		t.is(res.getStatInfo().isDirectory(), true);
	});
});

test("glob root directory", async (t) => {
	t.plan(2);

	const resources = await t.context.readerWriter.filesystem.byGlob("/test-resources/", {nodir: false});

	matchGlobResult(t, resources, ["/test-resources"]);
});

test("glob subdirectory", async (t) => {
	t.plan(2);

	const resources = await t.context.readerWriter.filesystem.byGlob([
		"/test-resources/app*a",
	], {nodir: false});

	resources.forEach((res) => {
		t.is(res._name, "application.a");
		t.is(res.getStatInfo().isDirectory(), true);
	});
});

test("glob with multiple patterns with static exclude", async (t) => {
	t.plan(4);

	const resources = await new FsAdapter({
		fsBasePath: "./test/fixtures/glob",
		virBasePath: "/test-resources/",
		excludes: [
			"/test-resources/application.b/**",
			"!/test-resources/application.b/**/manifest.json"
		]
	}).byGlob(["/**/*.yaml", "/test-resources/**/i18n_de.properties"]);

	const expectedResources = [
		"/test-resources/application.a/ui5.yaml",
		"/test-resources/application.b/webapp/manifest.json",
		"/test-resources/application.b/webapp/embedded/manifest.json"
	];
	matchGlobResult(t, resources, expectedResources);
});

/*
	Generic Micromatch tests for understanding glob exclude behavior.
	Not active since they only test external code and our adapter-tests should
	already test for any incompatible changes.
*/
// test("micromatch exclude test", async (t) => {
// 	const micromatch = require("micromatch");

// 	const excludePatterns = [
// 		"!/resources/app/fileA",
// 		"/resources/app/**",
// 	];

// 	const fileAPath = "/resources/app/fileA";
// 	const fileBPath = "/resources/app/fileB";

// 	let matches = micromatch(fileAPath, excludePatterns);
// 	t.deepEqual(matches.length, 1, "File A is excluded");

// 	matches = micromatch(fileBPath, excludePatterns);
// 	t.deepEqual(matches.length, 1, "File B is included");
// });

// test("micromatch exclude test 2", async (t) => {
// 	const micromatch = require("micromatch");

// 	const excludePatterns = [
// 		"/resources/app/**",
// 		"!/resources/app/fileA",
// 	];

// 	const fileAPath = "/resources/app/fileA";
// 	const fileBPath = "/resources/app/fileB";

// 	let matches = micromatch(fileAPath, excludePatterns);
// 	t.deepEqual(matches.length, 0, "File A is excluded");

// 	matches = micromatch(fileBPath, excludePatterns);
// 	t.deepEqual(matches.length, 1, "File B is included");
// });

// test("micromatch exclude test 3", async (t) => {
// 	const micromatch = require("micromatch");

// 	const excludePatterns = [
// 		"!/resources/app/i18n/**",
// 		"/resources/app/**",
// 		"!/resources/app/manifest.json"
// 	];

// 	const paths = [
// 		"/resources/app/manifest.json",
// 		"/resources/app/i18n.properties",
// 		"/resources/app/i18n/i18n.properties"
// 	];

// 	const matches = micromatch(paths, excludePatterns);
// 	t.deepEqual(matches, [
// 		"/resources/app/i18n.properties",
// 		"/resources/app/i18n/i18n.properties"
// 	], "Top level i18n.properties file is excluded");
// });

// test("micromatch exclude test 4", async (t) => {
// 	const micromatch = require("micromatch");

// 	const excludePatterns = [
// 		"/!(pony)/**",
// 	];

// 	const paths = [
// 		"/resources/app/manifest.json",
// 		"/resources/app/i18n.properties",
// 		"/resources/app/i18n/i18n.properties"
// 	];

// 	const matches = micromatch(paths, excludePatterns);
// 	t.deepEqual(matches, paths, "All resources should match");
// });

// test("micromatch exclude test 5", async (t) => {
// 	const micromatch = require("micromatch");

// 	const excludePatterns = [
// 		"/!(resources)/**",
// 	];

// 	const paths = [
// 		"/resources/app/manifest.json",
// 		"/resources/app/i18n.properties",
// 		"/resources/app/i18n/i18n.properties"
// 	];

// 	const matches = micromatch(paths, excludePatterns);
// 	t.deepEqual(matches, [], "No resources should match");
// });

// test("micromatch glob test 1", async (t) => {
// 	const micromatch = require("micromatch");

// 	const patterns = [
// 		"**/*",
// 		"!**",
// 		"library/l/Test2.html",
// 	];

// 	const paths = [
// 		"library/l/Test.html",
// 		"library/l/Test2.html"
// 	];

// 	const matches = micromatch(paths, patterns);
// 	t.deepEqual(matches, [
// 		"library/l/Test2.html"
// 	], "Resources should match");
// });

// test("micromatch glob test 2", async (t) => {
// 	const micromatch = require("micromatch");

// 	const patterns = [
// 		"!**/*",
// 		"!!**",
// 		"!library/l/Test2.html",
// 	];

// 	const paths = [
// 		"library/l/Test.html",
// 		"library/l/Test2.html"
// 	];

// 	const matches = micromatch(paths, patterns);
// 	t.deepEqual(matches, [
// 		"library/l/Test.html"
// 	], "Resources should match");
// });

// test("micromatch glob test 3", async (t) => {
// 	const micromatch = require("micromatch");

// 	const patterns = [
// 		"**/*",
// 		"!library/l/Test2.html",
// 		"library/l/Test2.html",
// 	];

// 	const paths = [
// 		"library/l/Test.html",
// 		"library/l/Test2.html"
// 	];

// 	const matches = micromatch(paths, patterns);
// 	t.deepEqual(matches, [
// 		"library/l/Test.html",
// 		"library/l/Test2.html"
// 	], "Resources should match");
// });

// test("micromatch glob test 4", async (t) => {
// 	const micromatch = require("micromatch");

// 	const patterns = [
// 		""
// 	];

// 	const paths = [
// 		"library/l/Test.html",
// 		"library/l/Test2.html"
// 	];

// 	const err = t.throws(() => {
// 		micromatch(paths, patterns);
// 	});
// 	t.deepEqual(err.message, "Expected pattern to be a non-empty string", "Micromatch throws with correct exception");
// });

// test("globby test 1", async (t) => {
// 	const glob = require("globby");

// 	const opt = {
// 		cwd: "./test/fixtures/glob",
// 		dot: true,
// 		onlyFiles: false
// 	};
// 	// Globby in version 9 somehow transforms "" to "**" while micromatch throws an exception on empty strings
// 	const matches = await glob([""], opt);
// 	t.deepEqual(matches.length, 23, "Resources should match");
// });


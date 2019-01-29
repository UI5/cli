const {test} = require("ava");
const ui5Fs = require("../../");
const FsAdapter = ui5Fs.adapters.FileSystem;

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
test("GLOB all", (t) => {
	return t.context.readerWriter.filesystem.byGlob("/**/*.*")
		.then((resources) => {
			t.deepEqual(resources.length, 16, "Found all resources");
		});
});

test("GLOB all from root only", (t) => {
	t.plan(2);
	return t.context.readerWriter.filesystem.byGlob("/*/*.*")
		.then((resources) => {
			matchGlobResult(t, resources, ["/test-resources/package.json"]);
		});
});

test("GLOB all with virtual base path fully matching", (t) => {
	t.plan(1);
	return t.context.readerWriter.filesystem.byGlob("/test-resources/**/*.*")
		.then((resources) => {
			t.deepEqual(resources.length, 16, "Found all resources");
		});
});

test("GLOB with virtual base path partially matching", (t) => {
	t.plan(1);
	const adapter = new FsAdapter({
		fsBasePath: "./test/fixtures/glob/application.a",
		virBasePath: "/test-resources/application/a/"
	});
	return adapter.byGlob("/test-resources/**/*.*")
		.then((resources) => {
			t.deepEqual(resources.length, 4, "Found all resources");
		});
});

test("Check for unstable order of GLOB result", (t) => {
	t.plan(1);
	return t.context.readerWriter.filesystem.byGlob("/**/*.*")
		.then((resources) => {
			const firstMatch = resources.map((resource) => {
				return resource.getPath();
			});

			function readNext(tries) {
				return t.context.readerWriter.filesystem.byGlob("/**/*.*").then((resources) => {
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
				});
			}
			return readNext(100).then((nextMatch) => {
				t.notDeepEqual(nextMatch, firstMatch, "Result sets are of unstable order");
			});
		});
});

test("GLOB with multiple patterns", (t) => {
	t.plan(5);
	return t.context.readerWriter.filesystem.byGlob(["/**/*.yaml", "/test-resources/**/i18n_de.properties"])
		.then((resources) => {
			const expectedResources = [
				"/test-resources/application.b/webapp/i18n/i18n_de.properties",
				"/test-resources/application.b/webapp/embedded/i18n/i18n_de.properties",
				"/test-resources/application.b/ui5.yaml",
				"/test-resources/application.a/ui5.yaml"
			];
			matchGlobResult(t, resources, expectedResources);
		});
});


test("GLOB only a specific filetype (yaml)", (t) => {
	t.plan(2);
	return t.context.readerWriter.filesystem.byGlob("/**/*.yaml")
		.then((resources) => {
			resources.forEach((res) => {
				t.deepEqual(res._name, "ui5.yaml");
			});
		});
});

test("GLOB two specific filetype (yaml and js)", (t) => {
	t.plan(4);
	return t.context.readerWriter.filesystem.byGlob("/**/*.{yaml,js}")
		.then((resources) => {
			const expectedResources = [
				"/test-resources/application.a/webapp/test.js",
				"/test-resources/application.b/ui5.yaml",
				"/test-resources/application.a/ui5.yaml"
			];
			matchGlobResult(t, resources, expectedResources);
		});
});

test("GLOB only a specific filetype (json) with exclude pattern", (t) => {
	t.plan(2);
	return t.context.readerWriter.filesystem.byGlob([
		"/**/*.json",
		"!/**/*package.json"
	]).then((resources) => {
		resources.forEach((res) => {
			t.deepEqual(res._name, "manifest.json");
		});
	});
});

test("GLOB only a specific filetype (json) with multiple exclude pattern", (t) => {
	t.plan(2);
	return t.context.readerWriter.filesystem.byGlob([
		"/**/*.json",
		"!/**/*package.json",
		"!/**/embedded/manifest.json"
	]).then((resources) => {
		matchGlobResult(t, resources, ["/test-resources/application.b/webapp/manifest.json"]);
	});
});

test("GLOB (normalized) root directory (=> fs root)", (t) => {
	t.plan(2);
	return t.context.readerWriter.filesystem.byGlob([
		"/*/",
	], {nodir: false}).then((resources) => {
		resources.forEach((res) => {
			t.deepEqual(res._name, "test-resources");
			t.deepEqual(res.getStatInfo().isDirectory(), true);
		});
	});
});

test("GLOB root directory", (t) => {
	t.plan(2);
	return t.context.readerWriter.filesystem.byGlob("/test-resources/", {nodir: false})
		.then((resources) => {
			matchGlobResult(t, resources, ["/test-resources"]);
		});
});

test("GLOB subdirectory", (t) => {
	t.plan(2);
	return t.context.readerWriter.filesystem.byGlob([
		"/test-resources/app*a",
	], {nodir: false}).then((resources) => {
		resources.forEach((res) => {
			t.deepEqual(res._name, "application.a");
			t.deepEqual(res.getStatInfo().isDirectory(), true);
		});
	});
});

const test = require("ava");
const path = require("path");
const createBuildManifest = require("../../../../lib/build/helpers/createBuildManifest");
const Specification = require("../../../../lib/specifications/Specification");

const applicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.a");
const applicationProjectInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: applicationAPath,
	configuration: {
		specVersion: "2.3",
		kind: "project",
		type: "application",
		metadata: {name: "application.a"}
	}
};

const libraryDPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.d");
const libraryProjectInput = {
	id: "library.d.id",
	version: "1.0.0",
	modulePath: libraryDPath,
	configuration: {
		specVersion: "2.3",
		kind: "project",
		type: "library",
		metadata: {
			name: "library.d",
		},
		resources: {
			configuration: {
				paths: {
					src: "main/src",
					test: "main/test"
				}
			}
		},
	}
};

test("Create application from project with build manifest", async (t) => {
	const project = await Specification.create(applicationProjectInput);
	project.getResourceTagCollection().setTag("/resources/id1/foo.js", "ui5:HasDebugVariant");

	const metadata = await createBuildManifest(project, "buildConfig");
	t.truthy(new Date(metadata.buildManifest.timestamp), "Timestamp is valid");
	metadata.buildManifest.timestamp = "<timestamp>";

	t.deepEqual(metadata, {
		project: {
			specVersion: "2.3",
			type: "application",
			metadata: {
				name: "application.a",
			},
			resources: {
				configuration: {
					paths: {
						webapp: "resources/id1",
					},
				},
			}
		},
		buildManifest: {
			manifestVersion: "0.1",
			buildConfig: "buildConfig",
			namespace: "id1",
			timestamp: "<timestamp>",
			version: "1.0.0",
			versions: {
				builderVersion: require("@ui5/builder/package.json").version,
				fsVersion: require("@ui5/fs/package.json").version,
				projectVersion: require("../../../../package.json").version,
			},
			tags: {
				"/resources/id1/foo.js": {
					"ui5:HasDebugVariant": true,
				},
			}
		}
	}, "Returned correct metadata");
});

test("Create library from project with build manifest", async (t) => {
	const project = await Specification.create(libraryProjectInput);
	project.getResourceTagCollection().setTag("/resources/library/d/foo.js", "ui5:HasDebugVariant");

	const metadata = await createBuildManifest(project, "buildConfig");
	t.truthy(new Date(metadata.buildManifest.timestamp), "Timestamp is valid");
	metadata.buildManifest.timestamp = "<timestamp>";

	t.deepEqual(metadata, {
		project: {
			specVersion: "2.3",
			type: "library",
			metadata: {
				name: "library.d",
			},
			resources: {
				configuration: {
					paths: {
						src: "resources",
						test: "test-resources",
					},
				},
			}
		},
		buildManifest: {
			manifestVersion: "0.1",
			buildConfig: "buildConfig",
			namespace: "library/d",
			timestamp: "<timestamp>",
			version: "1.0.0",
			versions: {
				builderVersion: require("@ui5/builder/package.json").version,
				fsVersion: require("@ui5/fs/package.json").version,
				projectVersion: require("../../../../package.json").version,
			},
			tags: {
				"/resources/library/d/foo.js": {
					"ui5:HasDebugVariant": true,
				},
			}
		}
	}, "Returned correct metadata");
});

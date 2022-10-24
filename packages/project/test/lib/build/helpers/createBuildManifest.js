import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import semver from "semver";
import createBuildManifest from "../../../../lib/build/helpers/createBuildManifest.js";
import Specification from "../../../../lib/specifications/Specification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

	t.not(semver.valid(metadata.buildManifest.versions.builderVersion), null, "builder version should be filled");
	metadata.buildManifest.versions.builderVersion = "<version>";

	t.not(semver.valid(metadata.buildManifest.versions.fsVersion), null, "fs version should be filled");
	metadata.buildManifest.versions.fsVersion = "<version>";

	t.not(semver.valid(metadata.buildManifest.versions.projectVersion), null, "project version should be filled");
	metadata.buildManifest.versions.projectVersion = "<version>";

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
				builderVersion: "<version>",
				fsVersion: "<version>",
				projectVersion: "<version>",
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

	t.not(semver.valid(metadata.buildManifest.versions.builderVersion), null, "builder version should be filled");
	metadata.buildManifest.versions.builderVersion = "<version>";

	t.not(semver.valid(metadata.buildManifest.versions.fsVersion), null, "fs version should be filled");
	metadata.buildManifest.versions.fsVersion = "<version>";

	t.not(semver.valid(metadata.buildManifest.versions.projectVersion), null, "project version should be filled");
	metadata.buildManifest.versions.projectVersion = "<version>";

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
				builderVersion: "<version>",
				fsVersion: "<version>",
				projectVersion: "<version>",
			},
			tags: {
				"/resources/library/d/foo.js": {
					"ui5:HasDebugVariant": true,
				},
			}
		}
	}, "Returned correct metadata");
});

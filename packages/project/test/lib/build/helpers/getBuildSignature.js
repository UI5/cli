import test from "ava";
import crypto from "node:crypto";
import esmock from "esmock";

const BUILD_SIG_VERSION = "0";

function hash(key) {
	return crypto.createHash("sha256").update(key).digest("hex");
}

// Mock getPackageVersion (imported from createBuildManifest.js) so tests control the
// reported @ui5/project version instead of resolving the real package.json.
async function importWithProjectVersion(projectVersion) {
	return esmock("../../../../lib/build/helpers/getBuildSignature.js", {
		"../../../../lib/build/helpers/createBuildManifest.js": {
			getPackageVersion: async () => projectVersion
		}
	});
}

function createProject({id = "project.id", config = {some: "config"}} = {}) {
	return {
		getId: () => id,
		getConfig: () => config
	};
}

function createTaskRepository(versions = {builderVersion: "1.0.0", fsVersion: "1.0.0"}) {
	return {
		getVersions: async () => versions
	};
}

test("getBaseSignature: Hashes build sig version and build config", async (t) => {
	const {getBaseSignature} = await importWithProjectVersion("1.0.0");
	const buildConfig = {selfContained: true};

	t.is(getBaseSignature(buildConfig), hash(BUILD_SIG_VERSION + JSON.stringify(buildConfig)),
		"Base signature matches the expected hash");
});

test("getProjectSignature: Hashes all inputs including the awaited versions", async (t) => {
	const {getProjectSignature} = await importWithProjectVersion("2.3.4");
	const project = createProject();
	const taskVersions = {builderVersion: "1.2.3", fsVersion: "4.5.6"};
	const taskRepository = createTaskRepository(taskVersions);

	const expectedKey = "baseSig" + "taskSigs" + project.getId() + JSON.stringify(project.getConfig()) +
		JSON.stringify(taskVersions) + "2.3.4";

	const signature = await getProjectSignature("baseSig", "taskSigs", project, {}, taskRepository);

	t.is(signature, hash(expectedKey), "Project signature matches the expected hash");
});

test("getProjectSignature: @ui5/project version is part of the signature", async (t) => {
	const project = createProject();
	const taskRepository = createTaskRepository();

	const {getProjectSignature: sigWithV1} = await importWithProjectVersion("1.0.0");
	const {getProjectSignature: sigWithV2} = await importWithProjectVersion("2.0.0");

	const signatureV1 = await sigWithV1("baseSig", "taskSigs", project, {}, taskRepository);
	const signatureV2 = await sigWithV2("baseSig", "taskSigs", project, {}, taskRepository);

	t.not(signatureV1, signatureV2,
		"Different @ui5/project versions produce different signatures");
});

test("getProjectSignature: taskRepository versions are part of the signature", async (t) => {
	const {getProjectSignature} = await importWithProjectVersion("1.0.0");
	const project = createProject();

	const signatureA = await getProjectSignature("baseSig", "taskSigs", project, {},
		createTaskRepository({builderVersion: "1.0.0", fsVersion: "1.0.0"}));
	const signatureB = await getProjectSignature("baseSig", "taskSigs", project, {},
		createTaskRepository({builderVersion: "2.0.0", fsVersion: "1.0.0"}));

	t.not(signatureA, signatureB,
		"Different taskRepository versions produce different signatures");
});

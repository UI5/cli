const test = require("ava");
const path = require("path");
const fs = require("graceful-fs");
const sinon = require("sinon");
const mock = require("mock-require");

test.afterEach.always((t) => {
	sinon.restore();
});

const AbstractUi5Formatter = require("../../../lib/types/AbstractUi5Formatter");
// It's not possible to create instances from AbstractUi5Formatter itself (because it's abstract)
// Therefore we create a local extension Class
class CustomUi5Formatter extends AbstractUi5Formatter {
	getSourceBasePath() {
		return "webapp";
	}
}

const applicationBPath = path.join(__dirname, "..", "..", "fixtures", "application.b");
const myTree = {
	id: "random.project.id",
	version: "1.0.0",
	path: applicationBPath,
	dependencies: [],
	metadata: {
		name: "random.project",
	}
};

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

test("hasMavenPlaceholder: has maven placeholder", async (t) => {
	const myProject = clone(myTree);
	const libraryFormatter = new CustomUi5Formatter({project: myProject});

	const res = libraryFormatter.hasMavenPlaceholder("${mvn-pony}");
	t.true(res, "String has maven placeholder");
});

test("hasMavenPlaceholder: has no maven placeholder", async (t) => {
	const myProject = clone(myTree);
	const libraryFormatter = new CustomUi5Formatter({project: myProject});

	const res = libraryFormatter.hasMavenPlaceholder("$mvn-pony}");
	t.false(res, "String has no maven placeholder");
});

test("resolveMavenPlaceholder: resolves maven placeholder from first POM level", async (t) => {
	const myProject = clone(myTree);
	const libraryFormatter = new CustomUi5Formatter({project: myProject});
	sinon.stub(libraryFormatter, "getPom").resolves({
		project: {
			properties: {
				"mvn-pony": "unicorn"
			}
		}
	});

	const res = await libraryFormatter.resolveMavenPlaceholder("${mvn-pony}");
	t.deepEqual(res, "unicorn", "Resolved placeholder correctly");
});

test("resolveMavenPlaceholder: resolves maven placeholder from deeper POM level", async (t) => {
	const myProject = clone(myTree);
	const libraryFormatter = new CustomUi5Formatter({project: myProject});
	sinon.stub(libraryFormatter, "getPom").resolves({
		"mvn-pony": {
			some: {
				id: "unicorn"
			}
		}
	});

	const res = await libraryFormatter.resolveMavenPlaceholder("${mvn-pony.some.id}");
	t.deepEqual(res, "unicorn", "Resolved placeholder correctly");
});

test("resolveMavenPlaceholder: can't resolve from POM", async (t) => {
	const myProject = clone(myTree);
	const libraryFormatter = new CustomUi5Formatter({project: myProject});
	sinon.stub(libraryFormatter, "getPom").resolves({});

	const err = await t.throwsAsync(libraryFormatter.resolveMavenPlaceholder("${mvn-pony}"));
	t.deepEqual(err.message,
		`"\${mvn-pony}" couldn't be resolved from maven property "mvn-pony" ` +
		`of pom.xml of project random.project`,
		"Rejected with correct error message");
});

test("resolveMavenPlaceholder: provided value is no placeholder", async (t) => {
	const myProject = clone(myTree);
	const libraryFormatter = new CustomUi5Formatter({project: myProject});

	const err = await t.throwsAsync(libraryFormatter.resolveMavenPlaceholder("My ${mvn-pony}"));
	t.deepEqual(err.message,
		`"My \${mvn-pony}" is not a maven placeholder`,
		"Rejected with correct error message");
});

test("getPom: reads correctly", async (t) => {
	const myProject = clone(myTree);
	// Application H contains a pom.xml
	const applicationHPath = path.join(__dirname, "..", "..", "fixtures", "application.h");
	myProject.path = applicationHPath;

	const libraryFormatter = new CustomUi5Formatter({project: myProject});

	const res = await libraryFormatter.getPom();
	t.deepEqual(res.project.modelVersion, "4.0.0", "pom.xml content has been read");
});

test.serial("getPom: fs read error", async (t) => {
	const myProject = clone(myTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, new Error("EPON: Pony Error"));

	const AbstractUi5Formatter = mock.reRequire("../../../lib/types/AbstractUi5Formatter");
	class LocalUi5Formatter extends AbstractUi5Formatter {}
	const libraryFormatter = new LocalUi5Formatter({project: myProject});

	const error = await t.throwsAsync(libraryFormatter.getPom());
	t.deepEqual(error.message,
		"Failed to read pom.xml for project random.project: " +
		"EPON: Pony Error",
		"Rejected with correct error message");
	t.deepEqual(readFileStub.callCount, 1, "fs.read got called once");
	const expectedPath = path.join(applicationBPath, "pom.xml");
	t.deepEqual(readFileStub.getCall(0).args[0], expectedPath, "fs.read got called with the correct argument");
});

test.serial("getPom: result is cached", async (t) => {
	const myProject = clone(myTree);

	const readFileStub = sinon.stub(fs, "readFile").callsArgWithAsync(1, undefined,
		`<pony>no unicorn</pony>`);

	const AbstractUi5Formatter = mock.reRequire("../../../lib/types/AbstractUi5Formatter");
	class LocalUi5Formatter extends AbstractUi5Formatter {}
	const libraryFormatter = new LocalUi5Formatter({project: myProject});

	let res = await libraryFormatter.getPom();
	t.deepEqual(res, {pony: "no unicorn"}, "Correct result on first call");
	res = await libraryFormatter.getPom();
	t.deepEqual(res, {pony: "no unicorn"}, "Correct result on second call");

	t.deepEqual(readFileStub.callCount, 1, "fs.read got called exactly once (and then cached)");
});

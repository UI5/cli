import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {promisify} from "node:util";

test.beforeEach(async (t) => {
	t.context.pipelineStub = sinon.stub().resolves();
	t.context.streamPipelineStub = sinon.stub().resolves();

	t.context.promisifyStub = sinon.stub();

	t.context.fetchStub = sinon.stub().resolves({
		ok: true,
		buffer: sinon.stub().resolves("<metadata>Some metadata</metadata>")
	});

	t.context.fsCreateWriteStreamStub = sinon.stub().resolves();

	t.context.Registry = await esmock.p("../../../../lib/ui5Framework/maven/Registry.js", {
		"make-fetch-happen": t.context.fetchStub,
		"node:stream/promises": {
			"pipeline": t.context.streamPipelineStub
		},
		"node:util": {
			"promisify": t.context.promisifyStub
		},
		"graceful-fs": {
			"createWriteStream": t.context.fsCreateWriteStreamStub
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.Registry);
});

test.serial("Registry: constructor", (t) => {
	const {Registry} = t.context;

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});
	t.true(reg instanceof Registry, "Constructor returns instance of class");
	t.is(reg._endpointUrl, "some-url/");
});

test.serial("Registry: constructor requires 'endpointUrl'", (t) => {
	const {Registry} = t.context;

	t.throws(() => {
		new Registry({cwd: "/"});
	}, {message: `Registry: Missing parameter "endpointUrl"`});
});

test.serial("Registry: requestMavenMetadata", async (t) => {
	const {Registry, promisifyStub} = t.context;

	promisifyStub.callsFake((fn) => promisify(fn)); // Use the native promisify

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});

	const resolvedMetadata = await reg.requestMavenMetadata({
		groupId: "ui5.corp",
		artifactId: "great-thing",
		version: "1.75.0-SNAPSHOT",
	});

	t.is(resolvedMetadata, "Some metadata");
});

test.serial("Registry: requestMavenMetadata bad request", async (t) => {
	const {Registry, fetchStub} = t.context;

	fetchStub.resolves({status: "500", statusText: "Bad request"});

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});

	await t.throwsAsync(
		reg.requestMavenMetadata({
			groupId: "ui5.corp",
			artifactId: "great-thing",
			version: "1.75.0-SNAPSHOT",
		}),
		{
			message:
				"Failed to retrieve maven-metadata.xml for ui5.corp:great-thing:1.75.0-SNAPSHOT:" +
				" [HTTP Error] 500 Bad request",
		}
	);
});

test.serial("Registry: requestMavenMetadata not found", async (t) => {
	const {Registry, fetchStub} = t.context;

	fetchStub.throws({code: "ENOTFOUND"});

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});

	await t.throwsAsync(
		reg.requestMavenMetadata({
			groupId: "ui5.corp",
			artifactId: "great-thing"
		}),
		{
			message:
				"Failed to connect to Maven registry at some-url/. Please check the correct endpoint URL" +
				" is maintained and can be reached. ",
		}
	);
});

test.serial("Registry: requestMavenMetadata No metadata/bad xml", async (t) => {
	const {Registry, fetchStub, promisifyStub} = t.context;

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});

	promisifyStub.callsFake((fn) => promisify(fn)); // Use the native promisify

	fetchStub.resolves({
		ok: true,
		buffer: sinon.stub().resolves("<metadata></metadata>")
	});

	await t.throwsAsync(
		reg.requestMavenMetadata({
			groupId: "ui5.corp",
			artifactId: "great-thing",
			version: "1.75.0-SNAPSHOT",
		}),
		{
			message:
				"Failed to retrieve maven-metadata.xml for ui5.corp:great-thing:1.75.0-SNAPSHOT: " +
				"Empty or unexpected response body:\n" +
				"<metadata></metadata>\n" +
				"Parsed as:\n" +
				"{\"metadata\":\"\"}"
		}
	);
});

test.serial("Registry: requestArtifact", async (t) => {
	const {Registry, fetchStub, streamPipelineStub, fsCreateWriteStreamStub} = t.context;

	fetchStub.resolves({
		ok: true,
		body: "content body"
	});

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});

	await reg.requestArtifact({
		groupId: "ui5.corp",
		artifactId: "great-thing",
		revision: "2",
		extension: "jar"
	}, "/target/path/");

	t.is(streamPipelineStub.callCount, 1, "Pipeline is called");
	t.is(streamPipelineStub.args[0][0], "content body", "Pipeline called with response body as argument");
	t.is(fsCreateWriteStreamStub.callCount, 1, "writeStream called");
	t.deepEqual(fsCreateWriteStreamStub.args[0], ["/target/path/"], "writeStream called with the target path");
});

test.serial("Registry: requestArtifact bad request", async (t) => {
	const {Registry, fetchStub} = t.context;

	fetchStub.resolves({status: "500", statusText: "Bad request"});

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});

	await t.throwsAsync(
		reg.requestArtifact({
			groupId: "ui5.corp",
			artifactId: "great-thing",
			revision: "2",
			version: "2",
			classifier: "classifier",
			extension: "jar"
		}, "/target/path/"),
		{
			message:
				"Failed to retrieve artifact ui5.corp:great-thing:2:classifier:jar" +
				" [HTTP Error] 500 Bad request",
		}
	);
});

test.serial("Registry: requestArtifact not found", async (t) => {
	const {Registry, fetchStub} = t.context;

	fetchStub.throws({code: "ENOTFOUND"});

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "some-url"
	});

	await t.throwsAsync(
		reg.requestArtifact(
			{
				groupId: "ui5.corp",
				artifactId: "great-thing",
				revision: "2",
				version: "2",
				classifier: "",
				extension: "jar",
			},
			"/target/path/"
		),
		{
			message:
				"Failed to connect to Maven registry at some-url/. " +
				"Please check the correct endpoint URL is maintained and can be reached. "
		}
	);
});

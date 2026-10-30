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
		endpointUrl: "https://registry.example/repository"
	});
	t.true(reg instanceof Registry, "Constructor returns instance of class");
	t.is(reg._endpointUrl, "https://registry.example/repository/");
});

test.serial("Registry: constructor requires 'endpointUrl'", (t) => {
	const {Registry} = t.context;

	t.throws(() => {
		new Registry({cwd: "/"});
	}, {message: `Registry: Missing parameter "endpointUrl"`});
});

for (const endpointUrl of [
	"http://user:secret@registry.example/repository", "ftp://registry.example",
	"file:///repository", "//registry.example/repository", "invalid-url", "https://["
]) {
	test.serial(`Registry rejects endpoint ${endpointUrl}`, (t) => {
		const {Registry, fetchStub} = t.context;
		const err = t.throws(() => new Registry({endpointUrl}), {
			message: /require a valid HTTPS URL.*mavenSnapshotEndpointUrl/
		});
		t.false(err.message.includes("secret"));
		t.false(err.message.includes(endpointUrl));
		t.false(fetchStub.called);
	});
}

for (const status of [301, 302, 303, 307, 308]) {
	test.serial(`Registry follows relative HTTPS redirects (${status}) with certificate verification`, async (t) => {
		const {Registry, fetchStub, promisifyStub} = t.context;
		promisifyStub.callsFake((fn) => promisify(fn));
		const body = {destroy: sinon.stub()};
		fetchStub.onFirstCall().resolves({status, headers: new Map([["location", "/redirected"]]), body});
		const reg = new Registry({endpointUrl: "HTTPS://registry.example/repository"});
		t.is(await reg.requestMavenMetadata({groupId: "test", artifactId: "test"}), "Some metadata");
		t.is(fetchStub.secondCall.firstArg, "https://registry.example/redirected");
		t.true(body.destroy.calledOnce);
		for (const call of fetchStub.getCalls()) {
			t.is(call.args[1].redirect, "manual");
			t.not(call.args[1].strictSSL, false);
		}
	});
}

for (const location of ["http://user:secret@registry.example/target", "https://[", undefined]) {
	test.serial(`Registry closes a rejected redirect response: ${location}`, async (t) => {
		const {Registry, fetchStub, fsCreateWriteStreamStub} = t.context;
		const body = {destroy: sinon.stub()};
		fetchStub.resolves({status: 302, headers: new Map([["location", location]]), body});
		const reg = new Registry({endpointUrl: "https://registry.example/repository"});
		const err = await t.throwsAsync(reg.requestArtifact({groupId: "test", artifactId: "test"}, "unused"));
		t.regex(err.message, location ? /require a valid HTTPS URL/ : /missing a location/);
		t.false(err.message.includes("secret"));
		t.true(body.destroy.calledOnce);
		t.true(fetchStub.calledOnce);
		t.false(fsCreateWriteStreamStub.called);
	});
}

for (const method of ["requestMavenMetadata", "requestArtifact"]) {
	test.serial(`Registry: ${method} rejects HTTP after an HTTPS redirect`, async (t) => {
		const {Registry, fetchStub, fsCreateWriteStreamStub} = t.context;
		const body = {destroy: sinon.stub()};
		fetchStub.onFirstCall().resolves({status: 302, headers: new Map([["location", "/next"]]), body});
		fetchStub.onSecondCall().resolves({
			status: 302, headers: new Map([["location", "http://registry.example/target"]]), body
		});
		const reg = new Registry({endpointUrl: "https://registry.example"});
		await t.throwsAsync(reg[method]({groupId: "test", artifactId: "test"}, "unused"), {
			message: /require a valid HTTPS URL/
		});
		t.is(fetchStub.callCount, 2, "No request to the HTTP target");
		t.is(body.destroy.callCount, 2);
		t.false(fsCreateWriteStreamStub.called);
		for (const call of fetchStub.getCalls()) {
			t.is(call.args[1].redirect, "manual");
			t.not(call.args[1].strictSSL, false);
		}
	});
}

test.serial("Registry limits HTTPS redirect loops", async (t) => {
	const {Registry, fetchStub} = t.context;
	const body = {destroy: sinon.stub()};
	fetchStub.resolves({status: 302, headers: new Map([["location", "/loop"]]), body});
	const reg = new Registry({endpointUrl: "https://registry.example"});
	await t.throwsAsync(reg.requestMavenMetadata({groupId: "test", artifactId: "test"}), {
		message: /Too many Maven registry redirects/
	});
	t.is(fetchStub.callCount, 6);
	t.is(body.destroy.callCount, 6);
});

test.serial("Registry omits URL credentials from network errors", async (t) => {
	const {Registry, fetchStub} = t.context;
	fetchStub.rejects(new Error("request to https://user:secret@registry.example failed"));
	const reg = new Registry({endpointUrl: "https://user:secret@registry.example"});
	const err = await t.throwsAsync(reg.requestMavenMetadata({groupId: "test", artifactId: "test"}), {
		message: /Maven registry HTTPS request to .* failed/
	});
	t.false(err.message.includes("secret"));
});

test.serial("Registry: requestMavenMetadata", async (t) => {
	const {Registry, promisifyStub} = t.context;

	promisifyStub.callsFake((fn) => promisify(fn)); // Use the native promisify

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "https://registry.example/repository"
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
		endpointUrl: "https://registry.example/repository"
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
		endpointUrl: "https://registry.example/repository"
	});

	await t.throwsAsync(
		reg.requestMavenMetadata({
			groupId: "ui5.corp",
			artifactId: "great-thing"
		}),
		{
			message:
				"Failed to connect to Maven registry at https://registry.example/repository/. " +
				"Please check the correct endpoint URL is maintained and can be reached. "+
				"You can change the configured URL " +
				"using the following command: 'ui5 config set mavenSnapshotEndpointUrl <url>'"
		}
	);
});

test.serial("Registry: requestMavenMetadata No metadata/bad xml", async (t) => {
	const {Registry, fetchStub, promisifyStub} = t.context;

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "https://registry.example/repository"
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
				"Empty or unexpected Maven metadata response"
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
		endpointUrl: "https://registry.example/repository"
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
	t.is(fetchStub.firstCall.args[1].redirect, "manual");
	t.not(fetchStub.firstCall.args[1].strictSSL, false);
});

test.serial("Registry: requestArtifact bad request", async (t) => {
	const {Registry, fetchStub} = t.context;

	fetchStub.resolves({status: "500", statusText: "Bad request"});

	const reg = new Registry({
		cwd: "/cwd/",
		endpointUrl: "https://registry.example/repository"
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
		endpointUrl: "https://registry.example/repository"
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
				"Failed to connect to Maven registry at https://registry.example/repository/. " +
				"Please check the correct endpoint URL is maintained and can be reached. "+
				"You can change the configured URL " +
				"using the following command: 'ui5 config set mavenSnapshotEndpointUrl <url>'"
		}
	);
});

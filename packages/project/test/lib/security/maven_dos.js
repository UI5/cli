import test from "ava";
import {mkdtemp, rm, access, readFile, readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {once} from "node:events";
import {gzipSync} from "node:zlib";
import Registry from "../../../lib/ui5Framework/maven/Registry.js";
import Installer from "../../../lib/ui5Framework/maven/Installer.js";
import {getMavenLimits} from "../../../lib/ui5Framework/maven/limits.js";
import sinon from "sinon";
import fs from "graceful-fs";
import {Readable, Writable} from "node:stream";
import StreamZip from "node-stream-zip";
import fetch from "make-fetch-happen";
import esmock from "esmock";
import {serve, archive} from "./__helper__/maven.js";

const coordinates = {groupId: "test.ui5", artifactId: "library", version: "1-SNAPSHOT",
	revision: "1-20261030", classifier: "npm", extension: "zip"};
const pkg = {...coordinates, pkgName: "@test/library"};
const metadata = Buffer.from("<metadata><version>1-SNAPSHOT</version></metadata>");
const normalArchive = archive([{name: "package.json", content: "{}"}]);

test.beforeEach(async (t) => {
	t.context.env = {...process.env};
	for (const name of Object.keys(process.env).filter((name) => name.startsWith("UI5_MAVEN_"))) {
		delete process.env[name];
	}
	t.context.dir = await mkdtemp(path.join(tmpdir(), "ui5-maven-"));
	t.context.target = path.join(t.context.dir, "artifact.zip");
});

test.afterEach.always(async (t) => {
	sinon.restore();
	for (const name of Object.keys(process.env).filter((name) => name.startsWith("UI5_MAVEN_"))) {
		delete process.env[name];
	}
	Object.assign(process.env, t.context.env);
	await rm(t.context.dir, {force: true, recursive: true});
});

async function missing(t, target) {
	await t.throwsAsync(access(target), {code: "ENOENT"});
}

function installer(t, endpointUrl) {
	const instance = new Installer({ui5DataDir: t.context.dir, snapshotEndpointUrlCb: () => endpointUrl});
	instance._fetchArtifactMetadata = async () => ({revision: coordinates.revision});
	return instance;
}

for (const kind of ["metadata", "artifact"]) {
	for (const contentLength of [false, true]) {
		test.serial(`${kind}: abort an oversized body (Content-Length: ${contentLength})`, async (t) => {
			process.env[`UI5_MAVEN_MAX_${kind.toUpperCase()}_BYTES`] = "1024";
			let sent = 0;
			let closed;
			const endpointUrl = await serve(t, (req, res) => {
				if (contentLength) {
					res.setHeader("Content-Length", 1024 * 1024);
				}
				closed = once(res, "close");
				const timer = setInterval(() => {
					sent += 512;
					res.write(Buffer.alloc(512, "x"));
				}, 5);
				res.on("close", () => clearInterval(timer));
			});
			const reg = new Registry({endpointUrl});
			const result = kind === "metadata" ? reg.requestMavenMetadata(coordinates) :
				reg.requestArtifact(coordinates, t.context.target);
			const error = await t.throwsAsync(result, {code: `ERR_MAVEN_${kind.toUpperCase()}_TOO_LARGE`});
			t.regex(error.message, /1024 bytes/);
			t.true(error.message.includes(endpointUrl));
			await closed;
			t.true(sent < 1024 * 1024, "The client closes the response before the full body arrives");
			await missing(t, t.context.target);
		});
	}

	for (const mode of ["stalled", "drip", "headers"]) {
		test.serial(`${kind}: overall deadline bounds ${mode}`, async (t) => {
			process.env.UI5_MAVEN_FETCH_TIMEOUT = "150";
			let closed;
			const endpointUrl = await serve(t, (req, res) => {
				closed = once(res, "close");
				if (mode !== "headers") {
					res.write("<metadata>");
				}
				if (mode === "drip") {
					const timer = setInterval(() => res.write("x"), 15);
					res.on("close", () => clearInterval(timer));
				}
			});
			const reg = new Registry({endpointUrl});
			const start = performance.now();
			const result = kind === "metadata" ? reg.requestMavenMetadata(coordinates) :
				reg.requestArtifact(coordinates, t.context.target);
			await t.throwsAsync(result, {code: "ERR_MAVEN_FETCH_TIMEOUT", message: /UI5_MAVEN_FETCH_TIMEOUT=150/});
			t.true(performance.now() - start < 1500);
			await closed;
			await missing(t, t.context.target);
		});
	}

	test.serial(`${kind}: redirects share the deadline`, async (t) => {
		process.env.UI5_MAVEN_FETCH_TIMEOUT = "300";
		let requests = 0;
		const endpointUrl = await serve(t, (req, res) => {
			requests++;
			const timer = setTimeout(() => {
				if (requests === 1) {
					res.writeHead(302, {Location: "/redirected"});
					res.end();
				} else {
					res.end(metadata);
				}
			}, 200);
			res.on("close", () => clearTimeout(timer));
		});
		const reg = new Registry({endpointUrl});
		const result = kind === "metadata" ? reg.requestMavenMetadata(coordinates) :
			reg.requestArtifact(coordinates, t.context.target);
		await t.throwsAsync(result, {code: "ERR_MAVEN_FETCH_TIMEOUT"});
		t.is(requests, 2);
		await missing(t, t.context.target);
	});

	test.serial(`${kind}: retries share the deadline`, async (t) => {
		process.env.UI5_MAVEN_FETCH_TIMEOUT = "300";
		let requests = 0;
		const endpointUrl = await serve(t, (req, res) => {
			requests++;
			const timer = setTimeout(() => {
				res.statusCode = requests === 1 ? 503 : 200;
				res.end(metadata);
			}, 125);
			res.on("close", () => clearTimeout(timer));
		});
		// Maven currently uses fetch's default of zero retries. Exercise its retry path with the same signal.
		const RetryingRegistry = await esmock("../../../lib/ui5Framework/maven/Registry.js", {
			"make-fetch-happen": fetch.defaults({retry: {retries: 1, minTimeout: 100, maxTimeout: 100}})
		});
		const reg = new RetryingRegistry({endpointUrl});
		const result = kind === "metadata" ? reg.requestMavenMetadata(coordinates) :
			reg.requestArtifact(coordinates, t.context.target);
		await t.throwsAsync(result, {code: "ERR_MAVEN_FETCH_TIMEOUT"});
		t.is(requests, 2);
		await missing(t, t.context.target);
	});
}

test.serial("Metadata and artifact byte boundaries succeed within the deadline", async (t) => {
	process.env.UI5_MAVEN_MAX_METADATA_BYTES = String(metadata.length);
	process.env.UI5_MAVEN_MAX_ARTIFACT_BYTES = String(metadata.length);
	process.env.UI5_MAVEN_FETCH_TIMEOUT = "2000";
	const endpointUrl = await serve(t, (req, res) => res.end(metadata));
	const reg = new Registry({endpointUrl});
	t.deepEqual(await reg.requestMavenMetadata(coordinates), {version: "1-SNAPSHOT"});
	await reg.requestArtifact(coordinates, t.context.target);
	t.deepEqual(await readFile(t.context.target), metadata);
});

test.serial("Metadata: count decoded bytes when Content-Length describes gzip bytes", async (t) => {
	const content = Buffer.from(`<metadata>${"x".repeat(8192)}</metadata>`);
	const compressed = gzipSync(content);
	process.env.UI5_MAVEN_MAX_METADATA_BYTES = String(compressed.length);
	const endpointUrl = await serve(t, (req, res) => {
		res.writeHead(200, {"Content-Encoding": "gzip", "Content-Length": compressed.length});
		res.end(compressed);
	});
	await t.throwsAsync(new Registry({endpointUrl}).requestMavenMetadata(coordinates),
		{code: "ERR_MAVEN_METADATA_TOO_LARGE"});
});

for (const [name, value, code] of [
	["MAX_ARCHIVE_ENTRIES", 1, "ERR_MAVEN_ARCHIVE_TOO_MANY_ENTRIES"],
	["MAX_ENTRY_BYTES", 1024, "ERR_MAVEN_ENTRY_TOO_LARGE"],
	["MAX_EXPANDED_BYTES", 1024, "ERR_MAVEN_ARCHIVE_TOO_LARGE"],
	["MAX_COMPRESSION_RATIO", 2, "ERR_MAVEN_COMPRESSION_RATIO_EXCEEDED"]
]) {
	test.serial(`Archive: ${name} rejection cleans staging and releases locks`, async (t) => {
		process.env[`UI5_MAVEN_${name}`] = String(value);
		let content = archive([{name: "package.json", content: "{}"}, {name: "large", content: "x".repeat(65536)}]);
		const endpointUrl = await serve(t, (req, res) => res.end(content));
		const inst = installer(t, endpointUrl);
		const error = await t.throwsAsync(inst.installPackage(pkg), {code});
		t.true(error.message.includes(`UI5_MAVEN_${name}=${value}`));
		t.true(error.message.includes("test.ui5:library:1-20261030"));
		t.false(error.message.includes("xxxx"));
		t.deepEqual(await readdir(inst._stagingDir), []);
		t.deepEqual(await readdir(inst._lockDir), []);
		await missing(t, inst._getTargetDirForPackage(pkg.pkgName, coordinates.revision));
		await missing(t, inst._getTargetPathForArtifact(coordinates));
		content = normalArchive;
		const {pkgPath} = await inst.installPackage(pkg);
		t.is(await readFile(path.join(pkgPath, "package.json"), "utf8"), "{}");
	});
}

for (const [name, value, code] of [
	["MAX_ENTRY_BYTES", 100, "ERR_MAVEN_ENTRY_TOO_LARGE"],
	["MAX_EXPANDED_BYTES", 100, "ERR_MAVEN_ARCHIVE_TOO_LARGE"],
	["MAX_COMPRESSION_RATIO", 2, "ERR_MAVEN_COMPRESSION_RATIO_EXCEEDED"]
]) {
	test.serial(`Archive: actual bytes enforce ${name} with understated sizes`, async (t) => {
		process.env[`UI5_MAVEN_${name}`] = String(value);
		const content = archive([{name: "package.json", content: "x".repeat(65536),
			declaredSize: 1, descriptor: true}]);
		const endpointUrl = await serve(t, (req, res) => res.end(content));
		const inst = installer(t, endpointUrl);
		await t.throwsAsync(inst.installPackage(pkg), {code});
		t.deepEqual(await readdir(inst._stagingDir), []);
		t.deepEqual(await readdir(inst._lockDir), []);
		await missing(t, inst._getTargetDirForPackage(pkg.pkgName, coordinates.revision));
	});
}

for (const mode of ["interrupted", "limit", "timeout"]) {
	test.serial(`Artifact: ${mode} failure removes staging and permits a later install`, async (t) => {
		let fail = true;
		process.env.UI5_MAVEN_MAX_ARTIFACT_BYTES = "512";
		process.env.UI5_MAVEN_FETCH_TIMEOUT = "150";
		const endpointUrl = await serve(t, (req, res) => {
			if (!fail) {
				res.end(normalArchive);
				return;
			}
			res.write(Buffer.alloc(256));
			const timer = setTimeout(() => {
				if (mode === "interrupted") {
					res.destroy();
				} else if (mode === "limit") {
					res.end(Buffer.alloc(512));
				}
			}, 25);
			res.on("close", () => clearTimeout(timer));
		});
		const inst = installer(t, endpointUrl);
		await t.throwsAsync(inst.installArtifact(coordinates), {message: /Failed to retrieve artifact/});
		t.deepEqual(await readdir(inst._stagingDir), []);
		t.deepEqual(await readdir(inst._lockDir), []);
		await missing(t, inst._getTargetPathForArtifact(coordinates));
		fail = false;
		const {artifactPath} = await inst.installArtifact(coordinates);
		t.deepEqual(await readFile(artifactPath), normalArchive);
	});
}

test.serial("Archive entry and expanded-byte boundaries succeed; JAR strips META-INF", async (t) => {
	process.env.UI5_MAVEN_MAX_ARCHIVE_ENTRIES = "4";
	process.env.UI5_MAVEN_MAX_ENTRY_BYTES = "2";
	process.env.UI5_MAVEN_MAX_EXPANDED_BYTES = "4";
	const content = archive([{name: "META-INF/"}, {name: "META-INF/empty/"},
		{name: "META-INF/package.json", content: "{}"}, {name: "outside", content: "xx"}]);
	const endpointUrl = await serve(t, (req, res) => res.end(content));
	const inst = installer(t, endpointUrl);
	const {pkgPath} = await inst.installPackage({...pkg, extension: "jar"});
	t.is(await readFile(path.join(pkgPath, "package.json"), "utf8"), "{}");
	t.deepEqual(await readdir(path.join(pkgPath, "empty")), []);
	await missing(t, path.join(pkgPath, "META-INF"));
	await missing(t, path.join(pkgPath, "outside"));
});

for (const name of ["../outside", "/outside", "C:/outside", "nested/../../outside"]) {
	test.serial(`Archive: entry-name validation rejects ${name}`, async (t) => {
		const content = archive([{name, content: "{}"}]);
		const endpointUrl = await serve(t, (req, res) => res.end(content));
		const inst = installer(t, endpointUrl);
		await t.throwsAsync(inst.installPackage(pkg), {message: /Malicious entry/});
		t.deepEqual(await readdir(inst._stagingDir), []);
		t.deepEqual(await readdir(inst._lockDir), []);
	});
}

for (const value of ["", "0", "-1", "1.5", "Infinity", "1e3", " 5", "9007199254740992"]) {
	test.serial(`Invalid override: ${JSON.stringify(value)}`, (t) => {
		process.env.UI5_MAVEN_MAX_METADATA_BYTES = value;
		t.throws(getMavenLimits, {code: "ERR_MAVEN_INVALID_LIMIT"});
	});
}

test.serial("Archive: extraction timeout closes the stream, cleans staging, and permits another install", async (t) => {
	process.env.UI5_MAVEN_MAX_EXTRACTION_TIME = "100";
	const endpointUrl = await serve(t, (req, res) => res.end(normalArchive));
	const inst = installer(t, endpointUrl);
	const source = new Readable({read() {}});
	source.push(Buffer.from("partial"));
	const streamStub = sinon.stub(StreamZip.async.prototype, "stream").resolves(source);
	const closeSpy = sinon.spy(StreamZip.async.prototype, "close");
	const start = performance.now();
	await t.throwsAsync(inst.installPackage(pkg), {code: "ERR_MAVEN_EXTRACTION_TIMEOUT",
		message: /UI5_MAVEN_MAX_EXTRACTION_TIME=100/});
	t.true(performance.now() - start < 1500);
	t.true(source.destroyed);
	t.is(closeSpy.callCount, 1);
	t.deepEqual(await readdir(inst._stagingDir), []);
	t.deepEqual(await readdir(inst._lockDir), []);
	await missing(t, inst._getTargetDirForPackage(pkg.pkgName, coordinates.revision));
	await missing(t, inst._getTargetPathForArtifact(coordinates));
	streamStub.restore();
	const {pkgPath} = await inst.installPackage(pkg);
	t.is(await readFile(path.join(pkgPath, "package.json"), "utf8"), "{}");
});

for (const phase of ["download", "extraction"]) {
	test.serial(`ENOSPC during ${phase} removes partial output and permits another install`, async (t) => {
		const endpointUrl = await serve(t, (req, res) => res.end(normalArchive));
		const inst = installer(t, endpointUrl);
		const createWriteStream = fs.createWriteStream;
		const streamStub = sinon.stub(fs, "createWriteStream").callsFake((target, options) => {
			const extracting = target.endsWith("package.json");
			if (extracting === (phase === "extraction")) {
				return new Writable({
					write(chunk, encoding, callback) {
						callback(Object.assign(new Error("No space left on device"), {code: "ENOSPC"}));
					}
				});
			}
			return createWriteStream(target, options);
		});
		await t.throwsAsync(inst.installPackage(pkg), {code: "ENOSPC"});
		t.deepEqual(await readdir(inst._stagingDir), []);
		t.deepEqual(await readdir(inst._lockDir), []);
		await missing(t, inst._getTargetDirForPackage(pkg.pkgName, coordinates.revision));
		await missing(t, inst._getTargetPathForArtifact(coordinates));
		streamStub.restore();
		const {pkgPath} = await inst.installPackage(pkg);
		t.is(await readFile(path.join(pkgPath, "package.json"), "utf8"), "{}");
	});
}

test.serial("Archive: exact compression ratio succeeds", async (t) => {
	const data = Buffer.alloc(4096, "x");
	const zipped = archive([{name: "package.json", content: data}]);
	const padding = Buffer.alloc(data.length / 2 - zipped.length);
	zipped.writeUInt16LE(padding.length, zipped.length - 2);
	const content = Buffer.concat([zipped, padding]);
	process.env.UI5_MAVEN_MAX_COMPRESSION_RATIO = "2";
	const endpointUrl = await serve(t, (req, res) => res.end(content));
	const {pkgPath} = await installer(t, endpointUrl).installPackage(pkg);
	t.deepEqual(await readFile(path.join(pkgPath, "package.json")), data);
});

test.serial("Archive: actual total spans entries whose individual sizes fit", async (t) => {
	process.env.UI5_MAVEN_MAX_ENTRY_BYTES = "100";
	process.env.UI5_MAVEN_MAX_EXPANDED_BYTES = "100";
	const content = archive([
		{name: "package.json", content: Buffer.alloc(60), declaredSize: 1, descriptor: true},
		{name: "second", content: Buffer.alloc(60), declaredSize: 1, descriptor: true}
	]);
	const endpointUrl = await serve(t, (req, res) => res.end(content));
	const inst = installer(t, endpointUrl);
	await t.throwsAsync(inst.installPackage(pkg), {code: "ERR_MAVEN_ARCHIVE_TOO_LARGE", message: /120 bytes observed/});
	t.deepEqual(await readdir(inst._stagingDir), []);
	await missing(t, inst._getTargetDirForPackage(pkg.pkgName, coordinates.revision));
});

test.serial("Archive: duplicate names count toward the entry limit", async (t) => {
	process.env.UI5_MAVEN_MAX_ARCHIVE_ENTRIES = "1";
	const content = archive([{name: "package.json", content: "{}"}, {name: "package.json", content: "{}"}]);
	const endpointUrl = await serve(t, (req, res) => res.end(content));
	const inst = installer(t, endpointUrl);
	await t.throwsAsync(inst.installPackage(pkg), {code: "ERR_MAVEN_ARCHIVE_TOO_MANY_ENTRIES"});
	t.deepEqual(await readdir(inst._stagingDir), []);
});

test.serial("Metadata parse errors omit response content", async (t) => {
	const endpointUrl = await serve(t, (req, res) => res.end("<metadata><private-value><invalid&</metadata>"));
	const error = await t.throwsAsync(new Registry({endpointUrl}).requestMavenMetadata(coordinates),
		{message: /Invalid Maven metadata XML/});
	t.false(error.message.includes("private-value"));
});

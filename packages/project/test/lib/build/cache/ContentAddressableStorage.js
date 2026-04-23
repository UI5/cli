import test from "ava";
import path from "node:path";
import fs from "graceful-fs";
import {promisify} from "node:util";
import {gunzip} from "node:zlib";
import {rimraf} from "rimraf";
import ContentAddressableStorage from "../../../../lib/build/cache/ContentAddressableStorage.js";

const readFile = promisify(fs.readFile);

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "ContentAddressableStorage");

test.beforeEach(async (t) => {
	t.context.basePath = path.join(TEST_DIR, `cas-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	t.context.cas = new ContentAddressableStorage(t.context.basePath);
});

test.after.always(async () => {
	await rimraf(TEST_DIR);
});

test("contentPath: Computes deterministic path from integrity", (t) => {
	const cas = t.context.cas;

	// Use a known integrity hash
	const integrity = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
	const result = cas.contentPath(integrity);

	t.true(result.startsWith(t.context.basePath));
	t.true(result.includes("sha256"));

	// Verify determinism: same input produces same output
	t.is(result, cas.contentPath(integrity));
});

test("contentPath: Path contains algorithm and hex digest segments", (t) => {
	const cas = t.context.cas;
	const integrity = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
	const result = cas.contentPath(integrity);

	// Path structure: {basePath}/sha256/{xx}/{yy}/{rest}
	const relPath = path.relative(t.context.basePath, result);
	const parts = relPath.split(path.sep);

	t.is(parts[0], "sha256");
	t.is(parts[1].length, 2); // First 2 hex chars
	t.is(parts[2].length, 2); // Next 2 hex chars
	t.true(parts[3].length > 0); // Remaining hex chars
});

test("contentPath: Different integrities produce different paths", (t) => {
	const cas = t.context.cas;
	const integrity1 = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
	const integrity2 = "sha256-LCa0a2j/xo/5m0U8HTBBNBNCLXBkg7+g+YpeiGJm564=";

	t.not(cas.contentPath(integrity1), cas.contentPath(integrity2));
});

test("has: Returns false when content does not exist", async (t) => {
	const cas = t.context.cas;
	const integrity = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

	t.false(await cas.has(integrity));
});

test("has: Returns true after content is stored", async (t) => {
	const cas = t.context.cas;
	const content = Buffer.from("test content");
	const integrity = "sha256-6DvEUQhlMraqbfGBGR2fhsJaNhr0K0VhMupLPEYrmIY=";

	// Compute real integrity for test content
	const ssri = await import("ssri");
	const realIntegrity = ssri.fromData(content, {algorithms: ["sha256"]}).toString();

	await cas.put(realIntegrity, content);
	t.true(await cas.has(realIntegrity));
});

test("put: Stores gzip-compressed content at correct path", async (t) => {
	const cas = t.context.cas;
	const content = Buffer.from("hello world");

	const ssri = await import("ssri");
	const integrity = ssri.fromData(content, {algorithms: ["sha256"]}).toString();

	await cas.put(integrity, content);

	// Verify file exists at computed path
	const contentPath = cas.contentPath(integrity);
	const compressedData = await readFile(contentPath);

	// Verify it's gzip-compressed: decompress and compare
	const decompressed = await promisify(gunzip)(compressedData);
	t.deepEqual(decompressed, content);
});

test("put: Deduplicates — skips write if content already exists", async (t) => {
	const cas = t.context.cas;
	const content = Buffer.from("deduplicated content");

	const ssri = await import("ssri");
	const integrity = ssri.fromData(content, {algorithms: ["sha256"]}).toString();

	await cas.put(integrity, content);
	const contentPath = cas.contentPath(integrity);
	const stat1 = fs.statSync(contentPath);

	// Small delay to ensure mtime would differ if rewritten
	await new Promise((resolve) => setTimeout(resolve, 10));

	// Write same content again
	await cas.put(integrity, content);
	const stat2 = fs.statSync(contentPath);

	// File should not have been rewritten (mtime unchanged)
	t.is(stat1.mtimeMs, stat2.mtimeMs);
});

test("createReadStream: Returns decompressed content stream", async (t) => {
	const cas = t.context.cas;
	const content = Buffer.from("stream test content");

	const ssri = await import("ssri");
	const integrity = ssri.fromData(content, {algorithms: ["sha256"]}).toString();

	await cas.put(integrity, content);

	const stream = cas.createReadStream(integrity);
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}
	const result = Buffer.concat(chunks);
	t.deepEqual(result, content);
});

test("readContent: Returns decompressed buffer", async (t) => {
	const cas = t.context.cas;
	const content = Buffer.from("buffer test content");

	const ssri = await import("ssri");
	const integrity = ssri.fromData(content, {algorithms: ["sha256"]}).toString();

	await cas.put(integrity, content);

	const result = await cas.readContent(integrity);
	t.deepEqual(result, content);
});

test("readContent: Throws when content does not exist", async (t) => {
	const cas = t.context.cas;
	const integrity = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

	await t.throwsAsync(cas.readContent(integrity), {code: "ENOENT"});
});

test("put + readContent: Roundtrip with large content", async (t) => {
	const cas = t.context.cas;
	// Create a 1MB buffer with random-ish content
	const content = Buffer.alloc(1024 * 1024);
	for (let i = 0; i < content.length; i++) {
		content[i] = i % 256;
	}

	const ssri = await import("ssri");
	const integrity = ssri.fromData(content, {algorithms: ["sha256"]}).toString();

	await cas.put(integrity, content);
	const result = await cas.readContent(integrity);
	t.deepEqual(result, content);
});

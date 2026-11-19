import test from "ava";
import {isCacheVersionDir, classifyVersionDirs} from "../../../../lib/build/cache/cacheVersions.js";

// ─── isCacheVersionDir ────────────────────────────────────────────────────────

test("isCacheVersionDir: matches a standard version", (t) => {
	t.true(isCacheVersionDir("v0_10"));
});

test("isCacheVersionDir: matches v0_0", (t) => {
	t.true(isCacheVersionDir("v0_0"));
});

test("isCacheVersionDir: matches a higher major/minor", (t) => {
	t.true(isCacheVersionDir("v2_15"));
});

test("isCacheVersionDir: false for bare vX (no underscore)", (t) => {
	t.false(isCacheVersionDir("v1"));
});

test("isCacheVersionDir: false for trailing underscore", (t) => {
	t.false(isCacheVersionDir("v0_"));
});

test("isCacheVersionDir: false for non-numeric major", (t) => {
	t.false(isCacheVersionDir("va_b"));
});

test("isCacheVersionDir: false for trailing non-numeric suffix", (t) => {
	t.false(isCacheVersionDir("v0_10x"));
});

test("isCacheVersionDir: false for arbitrary string", (t) => {
	t.false(isCacheVersionDir("foo"));
});

test("isCacheVersionDir: false for leading-zero minor", (t) => {
	t.false(isCacheVersionDir("v0_01"));
});

test("isCacheVersionDir: false for leading-zero major", (t) => {
	t.false(isCacheVersionDir("v01_0"));
});

test("isCacheVersionDir: false for empty string", (t) => {
	t.false(isCacheVersionDir(""));
});

// ─── classifyVersionDirs ──────────────────────────────────────────────────────

const KNOWN = ["v0_7", "v0_9"];
const CURRENT = "v0_10";

test("classifyVersionDirs: allowlisted version is deletable", (t) => {
	const result = classifyVersionDirs(["v0_9"], {known: KNOWN, current: CURRENT});
	t.deepEqual(result.deletable, ["v0_9"]);
	t.deepEqual(result.unknown, []);
	t.deepEqual(result.foreign, []);
});

test("classifyVersionDirs: unshipped older version (not in KNOWN) goes to unknown", (t) => {
	const result = classifyVersionDirs(["v0_8"], {known: KNOWN, current: CURRENT});
	t.deepEqual(result.deletable, []);
	t.deepEqual(result.unknown, ["v0_8"]);
	t.deepEqual(result.foreign, []);
});

test("classifyVersionDirs: genuinely newer version goes to unknown, not deletable", (t) => {
	const result = classifyVersionDirs(["v1_0"], {known: KNOWN, current: CURRENT});
	t.deepEqual(result.deletable, []);
	t.deepEqual(result.unknown, ["v1_0"]);
	t.deepEqual(result.foreign, []);
});

test("classifyVersionDirs: current version is skipped (not in any bucket)", (t) => {
	const result = classifyVersionDirs([CURRENT], {known: KNOWN, current: CURRENT});
	t.deepEqual(result.deletable, []);
	t.deepEqual(result.unknown, []);
	t.deepEqual(result.foreign, []);
});

test("classifyVersionDirs: defense in depth — current in KNOWN is still not deletable", (t) => {
	const knownWithCurrent = [...KNOWN, CURRENT];
	const result = classifyVersionDirs([CURRENT], {known: knownWithCurrent, current: CURRENT});
	t.deepEqual(result.deletable, [], "current must never appear in deletable");
	t.deepEqual(result.unknown, []);
	t.deepEqual(result.foreign, []);
});

test("classifyVersionDirs: non-version dirname goes to foreign", (t) => {
	const result = classifyVersionDirs(["not-a-version"], {known: KNOWN, current: CURRENT});
	t.deepEqual(result.deletable, []);
	t.deepEqual(result.unknown, []);
	t.deepEqual(result.foreign, ["not-a-version"]);
});

test("classifyVersionDirs: leading-zero version goes to foreign (invalid format)", (t) => {
	const result = classifyVersionDirs(["v0_08"], {known: KNOWN, current: CURRENT});
	t.deepEqual(result.deletable, []);
	t.deepEqual(result.unknown, []);
	t.deepEqual(result.foreign, ["v0_08"]);
});

test("classifyVersionDirs: mixed input produces correct three-way partition", (t) => {
	const names = ["v0_7", "v0_9", "v0_8", "v1_0", CURRENT, "other-dir", "v0_08"];
	const result = classifyVersionDirs(names, {known: KNOWN, current: CURRENT});
	t.deepEqual([...result.deletable].sort(), ["v0_7", "v0_9"], "only known versions are deletable");
	t.deepEqual([...result.unknown].sort(), ["v0_8", "v1_0"], "unshipped older + newer go to unknown");
	t.deepEqual([...result.foreign].sort(), ["other-dir", "v0_08"], "malformed/non-version go to foreign");
});


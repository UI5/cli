import test from "ava";
import {parseCacheVersion, compareCacheVersion} from "../../../../lib/build/cache/cacheVersions.js";

// ─── parseCacheVersion ────────────────────────────────────────────────────────

test("parseCacheVersion: parses a standard version", (t) => {
	t.deepEqual(parseCacheVersion("v0_10"), {major: 0, minor: 10});
});

test("parseCacheVersion: parses v0_0", (t) => {
	t.deepEqual(parseCacheVersion("v0_0"), {major: 0, minor: 0});
});

test("parseCacheVersion: parses large minor version", (t) => {
	t.deepEqual(parseCacheVersion("v2_15"), {major: 2, minor: 15});
});

test("parseCacheVersion: returns null for bare vX (no underscore)", (t) => {
	t.is(parseCacheVersion("v1"), null);
});

test("parseCacheVersion: returns null for trailing underscore", (t) => {
	t.is(parseCacheVersion("v0_"), null);
});

test("parseCacheVersion: returns null for non-numeric major", (t) => {
	t.is(parseCacheVersion("va_b"), null);
});

test("parseCacheVersion: returns null for trailing non-numeric suffix", (t) => {
	t.is(parseCacheVersion("v0_10x"), null);
});

test("parseCacheVersion: returns null for arbitrary string", (t) => {
	t.is(parseCacheVersion("foo"), null);
});

test("parseCacheVersion: returns null for leading-zero minor", (t) => {
	t.is(parseCacheVersion("v0_01"), null);
});

test("parseCacheVersion: returns null for leading-zero major", (t) => {
	t.is(parseCacheVersion("v01_0"), null);
});

test("parseCacheVersion: returns null for empty string", (t) => {
	t.is(parseCacheVersion(""), null);
});

// ─── compareCacheVersion ──────────────────────────────────────────────────────

test("compareCacheVersion: equal versions return 0", (t) => {
	t.is(compareCacheVersion("v0_10", "v0_10"), 0);
});

test("compareCacheVersion: older major returns -1", (t) => {
	t.is(compareCacheVersion("v0_10", "v1_0"), -1);
});

test("compareCacheVersion: newer major returns 1", (t) => {
	t.is(compareCacheVersion("v1_0", "v0_10"), 1);
});

test("compareCacheVersion: older minor returns -1", (t) => {
	t.is(compareCacheVersion("v0_9", "v0_10"), -1);
});

test("compareCacheVersion: newer minor returns 1", (t) => {
	t.is(compareCacheVersion("v0_10", "v0_9"), 1);
});

test("compareCacheVersion: numeric minor tie-break — v2_5 < v2_15", (t) => {
	t.is(compareCacheVersion("v2_5", "v2_15"), -1);
});

test("compareCacheVersion: numeric minor tie-break — v2_15 > v2_5", (t) => {
	t.is(compareCacheVersion("v2_15", "v2_5"), 1);
});

test("compareCacheVersion: throws on invalid first argument", (t) => {
	t.throws(() => compareCacheVersion("foo", "v0_10"), {message: /Invalid cache version/});
});

test("compareCacheVersion: throws on invalid second argument", (t) => {
	t.throws(() => compareCacheVersion("v0_10", "bar"), {message: /Invalid cache version/});
});

test("compareCacheVersion: throws on first argument when both are invalid", (t) => {
	t.throws(() => compareCacheVersion("foo", "bar"), {message: /Invalid cache version: "foo"/});
});

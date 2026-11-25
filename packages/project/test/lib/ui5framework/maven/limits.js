import test from "ava";
import sinon from "sinon";
import {createDeadline, assertCompressionRatio, getMavenLimits} from "../../../../lib/ui5Framework/maven/limits.js";

test.serial("Deadline accepts overrides above Node's maximum timer interval", async (t) => {
	const clock = sinon.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "performance"]});
	t.teardown(() => clock.restore());
	const deadline = createDeadline({input: "test:artifact:1", limit: 2147483649,
		name: "UI5_MAVEN_FETCH_TIMEOUT", code: "ERR_MAVEN_FETCH_TIMEOUT"});
	t.teardown(() => deadline.clear());
	await clock.tickAsync(2147483647);
	t.false(deadline.signal.aborted);
	await clock.tickAsync(2);
	t.true(deadline.signal.aborted);
	t.is(deadline.signal.reason.code, "ERR_MAVEN_FETCH_TIMEOUT");
	t.regex(deadline.signal.reason.message, /2147483649 ms observed/);
	await t.throwsAsync(deadline.wait(Promise.resolve()), {code: "ERR_MAVEN_FETCH_TIMEOUT"});
});

test.serial("Clearing a deadline removes its timer", async (t) => {
	const clock = sinon.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "performance"]});
	t.teardown(() => clock.restore());
	const deadline = createDeadline({input: "test:artifact:1", limit: 20,
		name: "UI5_MAVEN_FETCH_TIMEOUT", code: "ERR_MAVEN_FETCH_TIMEOUT"});
	t.is(await deadline.wait(Promise.resolve("done")), "done");
	deadline.clear();
	t.is(clock.countTimers(), 0);
	await clock.tickAsync(100);
	t.false(deadline.signal.aborted);
});

test("Compression ratios accept equality and empty output", (t) => {
	t.notThrows(() => assertCompressionRatio(200, 100, {input: "test:artifact:1", limit: 2}));
	t.notThrows(() => assertCompressionRatio(0, 0, {input: "test:artifact:1", limit: 2}));
	t.throws(() => assertCompressionRatio(1, 0, {input: "test:artifact:1", limit: 2}),
		{code: "ERR_MAVEN_COMPRESSION_RATIO_EXCEEDED"});
});

test.serial("Each Maven override rejects invalid values and reads subsequent changes", (t) => {
	const names = ["MAX_METADATA_BYTES", "MAX_ARTIFACT_BYTES", "MAX_ARCHIVE_ENTRIES", "MAX_ENTRY_BYTES",
		"MAX_EXPANDED_BYTES", "MAX_COMPRESSION_RATIO", "FETCH_TIMEOUT", "MAX_EXTRACTION_TIME"];
	const env = {...process.env};
	t.teardown(() => {
		for (const suffix of names) {
			delete process.env[`UI5_MAVEN_${suffix}`];
		}
		Object.assign(process.env, env);
	});
	for (const suffix of names) {
		delete process.env[`UI5_MAVEN_${suffix}`];
	}
	for (const suffix of names) {
		const name = `UI5_MAVEN_${suffix}`;
		process.env[name] = "1.5";
		t.throws(getMavenLimits, {code: "ERR_MAVEN_INVALID_LIMIT"});
		process.env[name] = "0001";
		t.notThrows(getMavenLimits);
		delete process.env[name];
	}
	t.deepEqual(getMavenLimits(), {metadataBytes: 67108864, artifactBytes: 2147483648,
		archiveEntries: 262144, entryBytes: 1073741824, expandedBytes: 4294967296, compressionRatio: 200,
		fetchTimeout: 1800000, extractionTime: 600000});
});

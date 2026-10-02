import test from "ava";
import {
	STAGE_SIGNATURE_SEPARATOR,
	STAGE_SIG_DEPENDENCY_INDEX,
	createStageSignature,
	splitStageSignature,
} from "../../../../lib/build/cache/stageSignature.js";

// A stage signature is the explicit tuple [project, dependency, input, root]. These tests pin the
// composition and decomposition the two cache classes share, including the empty-input and empty-root
// cases where the input and/or root components are an empty-set digest rather than absent.

const PROJECT = "a".repeat(64);
const DEPENDENCY = "b".repeat(64);
const INPUT = "c".repeat(64);
const ROOT = "d".repeat(64);

test("createStageSignature joins the four components in tuple order", (t) => {
	t.is(
		createStageSignature([PROJECT, DEPENDENCY, INPUT, ROOT]),
		`${PROJECT}${STAGE_SIGNATURE_SEPARATOR}${DEPENDENCY}${STAGE_SIGNATURE_SEPARATOR}` +
		`${INPUT}${STAGE_SIGNATURE_SEPARATOR}${ROOT}`);
});

test("splitStageSignature reverses createStageSignature losslessly", (t) => {
	const components = [PROJECT, DEPENDENCY, INPUT, ROOT];
	t.deepEqual(splitStageSignature(createStageSignature(components)), components,
		"Round-trips the exact components");
});

test("STAGE_SIG_DEPENDENCY_INDEX addresses the dependency component", (t) => {
	const components = [PROJECT, DEPENDENCY, INPUT, ROOT];
	t.is(splitStageSignature(createStageSignature(components))[STAGE_SIG_DEPENDENCY_INDEX], DEPENDENCY,
		"The dependency component is read back out by index");
});

test("The separator cannot occur inside a hex component, so the split is unambiguous", (t) => {
	// Every component is a SHA-256 hex digest; the separator is a single character absent from [0-9a-f].
	t.false(PROJECT.includes(STAGE_SIGNATURE_SEPARATOR));
	t.is(splitStageSignature(createStageSignature([PROJECT, DEPENDENCY, INPUT, ROOT])).length, 4,
		"Exactly four components are recovered");
});

test("Empty-input and empty-root components round-trip like any other", (t) => {
	// A stage that recorded no non-resource inputs and no root reads still contributes a hex digest in
	// each of those two slots (the digest of an empty set), so the tuple shape is uniform.
	const emptyInputDigest = "e".repeat(64);
	const emptyRootDigest = "f".repeat(64);
	const signature = createStageSignature([PROJECT, DEPENDENCY, emptyInputDigest, emptyRootDigest]);
	t.deepEqual(splitStageSignature(signature), [PROJECT, DEPENDENCY, emptyInputDigest, emptyRootDigest]);
});

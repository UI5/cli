const test = require("ava");

const nonAsciiEscaper = require("../../../lib/processors/nonAsciiEscaper");
const Resource = require("@ui5/fs").Resource;

/**
 * Executes string escaping. Returns <code>undefined</code> if nothing was escaped.
 *
 * @param {string} input string
 * @param {object} [options]
 * @param {string} encoding character encoding used, e.g. utf8, latin1, ..
 * @returns {Promise<string|undefined>} escaped string if non-ascii characters present, <code>undefined</code> otherwise
 */
const escape = async function(input, options={}, encoding="utf8") {
	const resource = new Resource({
		path: "my.properties",
		buffer: Buffer.from(input, encoding)
	});
	return nonAsciiEscaper({resources: [resource], options});
};

test("Escape characters (ISO-8859-1)", async (t) => {
	t.plan(1);

	const input = `Viele Grüße`;
	const expected = `Viele Gr\\u00fc\\u00dfe`;
	const [resource] = await escape(input, {
		encoding: "latin1" // escape encoding
	}, "latin1"); // resource encoding
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("Escape characters (UTF-8, explicit parameter)", async (t) => {
	t.plan(1);

	const input = `These are 人物 characters`;
	const expected = "These are \\u4eba\\u7269 characters";
	const [resource] = await escape(input, {
		encoding: "utf8" // escape encoding
	}, "utf8"); // resource encoding
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("Escape characters (UTF-8, default)", async (t) => {
	t.plan(1);

	const input = `Viele Grüße`;
	const expected = `Viele Gr\\u00fc\\u00dfe`;
	// default encoding is utf8
	const [resource] = await escape(input);
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("Replace symbol characters", async (t) => {
	t.plan(1);

	const input = `L♥VE is everywhere`;
	const expected = `L\\u2665VE is everywhere`;
	const [resource] = await escape(input);
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("Replace chinese characters", async (t) => {
	t.plan(1);

	const input = `These are 人物 characters`;
	const expected = "These are \\u4eba\\u7269 characters";
	const [resource] = await escape(input);
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("Replace umlaut characters", async (t) => {
	t.plan(1);

	const input = `Achso Ähem`;
	const expected = "Achso \\u00c4hem";
	const [resource] = await escape(input);
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("Replace constructed characters", async (t) => {
	t.plan(1);

	const input = `Oh ẛ̣ that's ẛ̣ yes`;
	const expected = "Oh \\u1e9b\\u0323 that's \\u1e9b\\u0323 yes";
	const [resource] = await escape(input);
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});


test("Replace multiple times same character", async (t) => {
	t.plan(1);

	const input = `♥H L♥VE AND HARM♥NY ♥MG`;
	const expected = "\\u2665H L\\u2665VE AND HARM\\u2665NY \\u2665MG";
	const [resource] = await escape(input);
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("No Replace of characters", async (t) => {
	t.plan(1);

	const input = `ONE LOVE`;
	const expected = `ONE LOVE`;
	const [resource] = await escape(input);
	t.deepEqual(await resource.getString(), expected, "Correct file content should be set");
});

test("Invalid encoding", async (t) => {
	t.plan(2);

	const input = `ONE LOVE`;
	const error = await t.throwsAsync(escape(input, {encoding: "asd"}));
	t.is(error.message, "Unknown encoding: asd");
});


test("getEncodingFromAlias", (t) => {
	t.is(nonAsciiEscaper.getEncodingFromAlias("UTF-8"), "utf8");
});

test("getEncodingFromAlias invalid", (t) => {
	const error = t.throws(function() {
		nonAsciiEscaper.getEncodingFromAlias("asd");
	});
	t.is(error.message, `Encoding "asd" is not supported. Only UTF-8, ISO-8859-1 are allowed values`);
});

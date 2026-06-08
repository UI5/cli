import test from "ava";
import {injectHead} from "../../../../../lib/middleware/helper/injectHtml.js";

const TAG = `<script src="/test.js"></script>`;

test("Empty tags string returns html unchanged", (t) => {
	const html = `<!doctype html><html><head></head><body></body></html>`;
	t.is(injectHead(html, ""), html);
});

test("<head> opener: tags inserted immediately after opener on a new line", (t) => {
	const html = `<!doctype html>\n<html>\n<head>\n</head>\n<body></body>\n</html>`;
	const out = injectHead(html, TAG);
	t.is(out,
		`<!doctype html>\n<html>\n<head>\n${TAG}\n</head>\n<body></body>\n</html>`);
});

test("<head> opener with attributes still matches", (t) => {
	const html = `<html><head lang="en" data-x="1"><title>x</title></head></html>`;
	const out = injectHead(html, TAG);
	t.is(out, `<html><head lang="en" data-x="1">\n${TAG}<title>x</title></head></html>`);
});

test("<head> match is case-insensitive (<HEAD>)", (t) => {
	const html = `<HTML><HEAD></HEAD></HTML>`;
	const out = injectHead(html, TAG);
	t.is(out, `<HTML><HEAD>\n${TAG}</HEAD></HTML>`);
});

test("<head> opener: anchor indent is reused on the injected line", (t) => {
	const html = `<html>\n\t<head>\n\t</head>\n</html>`;
	const out = injectHead(html, TAG);
	// anchor indent (one tab) is reused before injected tags
	t.is(out, `<html>\n\t<head>\n\t${TAG}\n\t</head>\n</html>`);
});

test("<head> opener: space indent is reused on the injected line", (t) => {
	const html = `<html>\n  <head>\n  </head>\n</html>`;
	const out = injectHead(html, TAG);
	t.is(out, `<html>\n  <head>\n  ${TAG}\n  </head>\n</html>`);
});

test("Only first <head> occurrence is targeted", (t) => {
	const html = `<html><head></head><head></head></html>`;
	const out = injectHead(html, TAG);
	t.is(out, `<html><head>\n${TAG}</head><head></head></html>`);
});

test("Self-closing <head/> is treated as a normal opener (matches [^>]*>)", (t) => {
	const html = `<html><head/><body></body></html>`;
	const out = injectHead(html, TAG);
	t.is(out, `<html><head/>\n${TAG}<body></body></html>`);
});

test("Commented-out <head> still matches the regex", (t) => {
	const html = `<html><!-- <head></head> --><body></body></html>`;
	const out = injectHead(html, TAG);
	// Regex does not parse comments; first <head> inside the comment is matched.
	// The space after "<!--" is captured as p1 and reused as indent on the injected line.
	t.is(out, `<html><!-- <head>\n ${TAG}</head> --><body></body></html>`);
});

test("No <head>: falls through to <html> opener anchor (no extra indent)", (t) => {
	const html = `<html>\n  <body></body>\n</html>`;
	const out = injectHead(html, TAG);
	// Fallback paths emit tags without indent adjustment, on a new line.
	t.is(out, `<html>\n${TAG}\n  <body></body>\n</html>`);
});

test("No <head>: <html> with attributes still matches", (t) => {
	const html = `<html lang="en"><body></body></html>`;
	const out = injectHead(html, TAG);
	t.is(out, `<html lang="en">\n${TAG}<body></body></html>`);
});

test("No <head>: does NOT consult </head> as anchor", (t) => {
	const html = `</head><body></body>`;
	const out = injectHead(html, TAG);
	t.is(out, `${TAG}</head><body></body>`);
});

test("No <head>, no <html>: <!doctype html> anchor used", (t) => {
	const html = `<!doctype html>\n<body></body>`;
	const out = injectHead(html, TAG);
	t.is(out, `<!doctype html>\n${TAG}\n<body></body>`);
});

test("Doctype match is case-insensitive (<!DOCTYPE html>)", (t) => {
	const html = `<!DOCTYPE html>\n<body></body>`;
	const out = injectHead(html, TAG);
	t.is(out, `<!DOCTYPE html>\n${TAG}\n<body></body>`);
});

test("<html> opener wins over doctype when no <head> present", (t) => {
	const html = `<!doctype html>\n<html>\n<body></body>\n</html>`;
	const out = injectHead(html, TAG);
	t.is(out, `<!doctype html>\n<html>\n${TAG}\n<body></body>\n</html>`);
});

test("None of the anchors: tags prepended at position 0 with no separator", (t) => {
	const html = `<body>just a fragment</body>`;
	const out = injectHead(html, TAG);
	t.is(out, `${TAG}<body>just a fragment</body>`);
});

test("Empty html input: tags become entire output", (t) => {
	t.is(injectHead("", TAG), TAG);
});

test("Plain-text html (no anchors at all): tags prepended", (t) => {
	const html = `not html at all`;
	t.is(injectHead(html, TAG), `${TAG}not html at all`);
});

test("Multi-line tags string is inserted opaquely (caller controls internal indent)", (t) => {
	const tags = `<script>\n\tconsole.log(1);\n</script>`;
	const html = `<html>\n  <head>\n  </head>\n</html>`;
	const out = injectHead(html, tags);
	// Anchor indent ("  ") reused once before the tags; internal tag lines stay as authored.
	t.is(out, `<html>\n  <head>\n  ${tags}\n  </head>\n</html>`);
});

test("Tags string with $ and other regex specials is inserted literally (no replace-string interpretation)", (t) => {
	const tags = `<script>const x = "$&$1$$";</script>`;
	const html = `<head></head>`;
	const out = injectHead(html, tags);
	t.is(out, `<head>\n${tags}</head>`);
});

test("HTML body containing $-sequences is preserved verbatim", (t) => {
	const html = `<head></head><body>$1 $& $$ done</body>`;
	const out = injectHead(html, TAG);
	t.is(out, `<head>\n${TAG}</head><body>$1 $& $$ done</body>`);
});

test("Indent capture only matches space/tab (not newlines) before <head>", (t) => {
	// Per regex /([ \t]*)<head[^>]*>/i: leading whitespace capture is space/tab only.
	// A newline directly before <head> means p1 is empty, so injected line has no indent.
	const html = `<html>\n<head></head>\n</html>`;
	const out = injectHead(html, TAG);
	t.is(out, `<html>\n<head>\n${TAG}</head>\n</html>`);
});

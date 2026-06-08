// Anchor patterns for head-prepend injection. Mirrors Vite's html plugin so
// behavior stays predictable for users coming from that ecosystem. Patterns are
// case-insensitive and match the first occurrence; p1 captures leading
// space/tab indent (not newlines) so the injected block aligns with the anchor.
const headPrependInjectRE = /([ \t]*)<head[^>]*>/i;
const htmlPrependInjectRE = /([ \t]*)<html[^>]*>/i;
const doctypePrependInjectRE = /<!doctype html>/i;

/**
 * Inject a pre-serialized tag string into the head section of an HTML string.
 *
 * Resolution order (head-prepend semantics): <head> opener → <html> opener →
 * <!doctype html> → document start. The injected string is treated as opaque:
 * the caller controls its internal formatting; this function only chooses the
 * insertion point and reuses the anchor's indent on the line it adds.
 *
 * Implementation note: the callback form of String.prototype.replace is used
 * throughout so that $-sequences (e.g. "$&", "$1") in the injected string are
 * inserted verbatim instead of being interpreted as back-references.
 *
 * @param {string} html Source HTML (full document, fragment, or anything between).
 * @param {string} tags Pre-serialized tag markup to insert. Empty string is a no-op.
 * @returns {string} HTML with tags injected, or the input unchanged when tags is empty.
 */
export function injectHead(html, tags) {
	if (!tags) {
		return html;
	}

	// Primary anchor: first child of <head>. Anchor indent is reused before the
	// tags so the injected line sits at the same column as the head opener.
	if (headPrependInjectRE.test(html)) {
		return html.replace(headPrependInjectRE, (match, p1) => `${match}\n${p1}${tags}`);
	}

	// Fallback: after <html> opener, no extra indent. Per spec, head-prepend
	// does not consult <body> or </head> as secondary anchors.
	if (htmlPrependInjectRE.test(html)) {
		return html.replace(htmlPrependInjectRE, (match) => `${match}\n${tags}`);
	}

	// Fallback: after <!doctype html>, no extra indent.
	if (doctypePrependInjectRE.test(html)) {
		return html.replace(doctypePrependInjectRE, (match) => `${match}\n${tags}`);
	}

	// Final fallback: prepend at position 0 with no separator.
	return tags + html;
}

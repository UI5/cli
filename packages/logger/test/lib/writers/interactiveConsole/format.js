import test from "ava";
import chalk from "chalk";

// AVA workers are non-TTY, so chalk auto-detects "no color". Force truecolor
// so the palette wrappers emit their SGR codes and the palette assertions
// below have something to match against.
chalk.level = 3;

// `format.js` snapshots DARK_MODE at import time by reading COLORFGBG. To
// exercise both palettes we set the env var, re-import via a cache-busting
// query, and inspect the exported theme primitives. Every case restores the
// env so tests remain order-independent.

async function loadFormat(colorfgbg) {
	const previous = process.env.COLORFGBG;
	if (colorfgbg === undefined) {
		delete process.env.COLORFGBG;
	} else {
		process.env.COLORFGBG = colorfgbg;
	}
	try {
		// A unique query param bypasses Node's ESM module cache so the module
		// runs its top-level DARK_MODE detection against the current env.
		const suffix = Math.random().toString(36).slice(2);
		return await import(
			`../../../../lib/writers/interactiveConsole/format.js?bg=${suffix}`);
	} finally {
		if (previous === undefined) {
			delete process.env.COLORFGBG;
		} else {
			process.env.COLORFGBG = previous;
		}
	}
}

// Terminal SGR sequences carry the decimal RGB triple; look for that rather
// than the source hex so we don't depend on chalk's exact serialisation.
const LIGHT_BRAND = /24;115;180/;
const LIGHT_ACCENT = /83;184;222/;
const DARK_BRAND = /255;90;55/;
const DARK_ACCENT = /255;164;44/;

test.serial("format: brand and accent hexes match the light palette when COLORFGBG is unset", async (t) => {
	const {brand, accent} = await loadFormat(undefined);
	t.regex(brand("hello"), LIGHT_BRAND, "light-mode brand hex is applied");
	t.regex(accent("hello"), LIGHT_ACCENT, "light-mode accent hex is applied");
});

test.serial("format: dark palette activates when COLORFGBG signals a dark background (bg < 7)", async (t) => {
	const {brand, accent} = await loadFormat("15;0");
	t.regex(brand("hello"), DARK_BRAND, "dark-mode brand hex is applied when bg index is 0");
	t.regex(accent("hello"), DARK_ACCENT, "dark-mode accent hex is applied");
});

test.serial("format: dark palette activates for the special bg=8 index", async (t) => {
	// Index 8 is conventionally a "bright black" / dark grey background that
	// several terminals report. It's grouped with the < 7 range explicitly.
	const {brand} = await loadFormat("15;8");
	t.regex(brand("hello"), DARK_BRAND, "bg=8 is treated as dark");
});

test.serial("format: light palette when COLORFGBG bg index is >= 7 and not 8", async (t) => {
	const {brand} = await loadFormat("0;15");
	t.regex(brand("hello"), LIGHT_BRAND, "bg=15 is treated as light");
});

test.serial("format: light palette when COLORFGBG has a non-numeric background", async (t) => {
	// A malformed COLORFGBG (e.g. only a foreground index, or garbage) should
	// not throw — the parseInt returns NaN and we fall back to light.
	const {brand} = await loadFormat("nope");
	t.regex(brand("hello"), LIGHT_BRAND, "NaN parsed bg falls back to light");
});

test.serial("format: exports a bold accent variant and an arrow glyph", async (t) => {
	// Sanity — these primitives feed the region renderers and their contract
	// (bold/hex on accentBold, non-empty arrow) shouldn't drift silently.
	const {accentBold, arrow, placeholder} = await loadFormat(undefined);
	// accentBold wraps in bold + accent hex.
	t.regex(accentBold("hi"), /1m/, "accentBold includes the bold SGR (1m)");
	t.true(typeof arrow === "string" && arrow.length > 0, "arrow glyph is a non-empty string");
	// placeholder uses dim + italic.
	t.regex(placeholder("x"), /2m/, "placeholder uses the dim SGR (2m)");
	t.regex(placeholder("x"), /3m/, "placeholder uses the italic SGR (3m)");
});

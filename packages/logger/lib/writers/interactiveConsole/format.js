import chalk from "chalk";
import figures from "figures";

// Low-level formatting primitives — the theme (brand and accent colors, the
// pointer arrow, placeholder styling) shared by all region renderers.

// COLORFGBG is set by many terminals (xterm, konsole, rxvt, iTerm2, …) as
// "<fg>;<bg>" with ANSI color indices. Indices 0-6 and 8 are conventionally
// dark backgrounds. Apple Terminal, VS Code, and Windows Terminal don't set
// this — we fall back to the light-background palette in that case.
function isDarkTerminalBackground() {
	const v = process.env.COLORFGBG;
	if (!v) {
		return false;
	}
	const bg = parseInt(v.split(";").pop(), 10);
	if (Number.isNaN(bg)) {
		return false;
	}
	return bg < 7 || bg === 8;
}

const DARK_MODE = isDarkTerminalBackground();
const BRAND_HEX = DARK_MODE ? "#FF5A37" : "#1873B4";
const ACCENT_HEX = DARK_MODE ? "#FFA42C" : "#53B8DE";

export const brand = (text) => chalk.bold.hex(BRAND_HEX)(text);
export const accent = (text) => chalk.hex(ACCENT_HEX)(text);
export const accentBold = (text) => chalk.bold.hex(ACCENT_HEX)(text);
export const arrow = accent(figures.pointer);
export const placeholder = (text) => chalk.dim.italic(text);
